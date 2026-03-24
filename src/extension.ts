import * as vscode from "vscode"
import {getJConsole, config, setConfig} from "./constants"
import {
  pickJupytext,
  setJupytext,
  getFileUri,
  handleDocument,
  openPairedNotebookCommand,
  pair,
  refreshCliArgsFromConfig,
  setExtensionContext,
  isNotebookAutoCreated,
  unmarkNotebookAsAutoCreated,
  queueOperation,
  readPairedPathsAndFormatsInternal,
  makeLogPrefix,
  validatePythonAndJupytext,
  locatePythonAndJupytext,
} from "./jupytext"
import {PairedNotebookEditorProvider} from "./pairedNotebookEditor"
import {getNewPythonEnvsApi} from "./pythonEnvironmentsApi"

// Store disposables for event handlers so we can manage them
let disposables: vscode.Disposable[] = []

export async function activate(context: vscode.ExtensionContext) {
  getJConsole().appendLine("Activating Jupytext extension...")

  // Set the extension context for tracking auto-created notebooks
  setExtensionContext(context)

  // Listen for configuration changes and update handlers accordingly
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(async (e) => {
      if (e.affectsConfiguration("jupytextSync")) {
        getJConsole().appendLine("onDidChangeConfiguration: jupytextSync")
      }
      if (
        e.affectsConfiguration("jupytextSync.syncDocuments") ||
        e.affectsConfiguration("jupytextSync.setFormatsArgs") ||
        e.affectsConfiguration("jupytextSync.syncArgs")
      ) {
        await updateEventHandlers(context)
      }
      if (e.affectsConfiguration("jupytextSync.pythonExecutable")) {
        await validatePythonAndJupytext()
      }
    }),
  )
  context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.pair", pair))
  context.subscriptions.push(
    vscode.commands.registerCommand("jupytextSync.openPairedNotebook", openPairedNotebookCommand),
  )
  context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.cell.changeToRaw", changeToRaw))
  context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.cell.changeToCode", changeToCode))
  context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.cell.toggleRaw", toggleRaw))
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupytextSync.cell.insertRawCodeCellBelowAndFocusContainer",
      insertRawCodeCellBelowAndFocusContainer,
    ),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupytextSync.cell.insertRawCodeCellAboveAndFocusContainer",
      insertRawCodeCellAboveAndFocusContainer,
    ),
  )
  context.subscriptions.push(
    vscode.commands.registerCommand(
      "jupytextSync.setSuggestedCompactNotebookLayout",
      setSuggestedCompactNotebookLayout,
    ),
  )
  context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.showLogs", () => getJConsole().show()))
  context.subscriptions.push(
    vscode.commands.registerCommand("jupytextSync.locatePythonAndJupytext", locatePythonAndJupytext),
  )

  // Register custom editor provider for paired notebooks
  context.subscriptions.push(PairedNotebookEditorProvider.register(context))

  // Validate Python and Jupytext on extension activation so that we have an updated
  // list of supported extensions
  await validatePythonAndJupytext()

  // Subscribe to Python environment changes from ms-python.vscode-python-envs
  subscribeToNewPythonEnvsChanges(context)

  // Initial setup of handlers based on current configuration
  await updateEventHandlers(context)
}

async function insertRawCodeCellBelowAndFocusContainer() {
  const editor = vscode.window.activeNotebookEditor
  if (!editor) {
    vscode.window.showErrorMessage("Open a notebook first.")
    return
  }
  await vscode.commands.executeCommand("notebook.cell.insertCodeCellBelowAndFocusContainer")
  await changeToRaw()
  await vscode.commands.executeCommand("notebook.cell.edit")
}

async function insertRawCodeCellAboveAndFocusContainer() {
  const editor = vscode.window.activeNotebookEditor
  if (!editor) {
    vscode.window.showErrorMessage("Open a notebook first.")
    return
  }
  await vscode.commands.executeCommand("notebook.cell.insertCodeCellAboveAndFocusContainer")
  await changeToRaw()
  await vscode.commands.executeCommand("notebook.cell.edit")
}

/**
 * Change the selected cells to raw code language.
 *
 * ! VSCode implemented "raw" as a language type instead of a cell type (as jupyter does).
 * ! Hence we replace the cell with a cell of type code and then change the language to raw.
 */
async function changeToRaw() {
  const editor = vscode.window.activeNotebookEditor
  if (!editor) {
    vscode.window.showErrorMessage("Open a notebook first.")
    return
  }
  const edits = []
  const cellType = vscode.NotebookCellKind.Code
  for (const nbRange of editor.selections) {
    const cells = editor.notebook.getCells(nbRange)
    const newCells = []
    for (const cell of cells) {
      const newCell = new vscode.NotebookCellData(cellType, cell.document.getText(), "raw")
      newCells.push(newCell)
    }
    edits.push(vscode.NotebookEdit.replaceCells(nbRange, newCells))
  }
  const edit = new vscode.WorkspaceEdit()
  edit.set(editor.notebook.uri, edits)
  await vscode.workspace.applyEdit(edit)
}

async function changeToCode() {
  const editor = vscode.window.activeNotebookEditor
  if (!editor) {
    vscode.window.showErrorMessage("Open a notebook first.")
    return
  }
  // To avoid the trouble of guessing the language of the cell should be restored to,
  // we delegate this to VSCode with this trick.
  vscode.commands.executeCommand("notebook.cell.changeToMarkdown")
  vscode.commands.executeCommand("notebook.cell.changeToCode")
}

async function toggleRaw() {
  const editor = vscode.window.activeNotebookEditor
  if (!editor) {
    vscode.window.showErrorMessage("Open a notebook first.")
    return
  }
  const selections = editor.selections
  for (const nbRange of selections) {
    const cells = editor.notebook.getCells(nbRange)
    for (const cell of cells) {
      if (
        cell.kind !== vscode.NotebookCellKind.Code ||
        (cell.kind === vscode.NotebookCellKind.Code && cell.document.languageId !== "raw")
      ) {
        return await changeToRaw()
      }
    }
  }
  // All cells are raw, change to code
  return await changeToCode()
}

async function handleNotebookCloseInternal(uri: vscode.Uri, deleteOnClose: string, logPrefix: string) {
  const autoCreated = isNotebookAutoCreated(uri)
  getJConsole().appendLine(`${logPrefix}Notebook ${uri} closed, auto-created: ${autoCreated}`)
  // always unmark
  unmarkNotebookAsAutoCreated(uri, logPrefix)

  let shouldDelete = false
  let needsConfirmation = false
  try {
    if (deleteOnClose === "if auto created") {
      shouldDelete = autoCreated
    } else if (deleteOnClose === "yes") {
      // Use internal version to avoid nested queuing
      const formats = await readPairedPathsAndFormatsInternal(uri, logPrefix)
      // at least notebook and one other format
      const hasPairedFormats = formats !== undefined && formats.length >= 2
      shouldDelete = hasPairedFormats
    } else if (deleteOnClose === "ask") {
      // Use internal version to avoid nested queuing
      const formats = await readPairedPathsAndFormatsInternal(uri, logPrefix)
      // at least notebook and one other format
      const hasPairedFormats = formats !== undefined && formats.length >= 2
      if (hasPairedFormats || autoCreated) {
        needsConfirmation = true
        shouldDelete = true // Will be confirmed below
      }
    }

    if (!shouldDelete) {
      return
    }

    if (needsConfirmation) {
      const result = await vscode.window.showWarningMessage(
        `Delete paired notebook ${uri}?`,
        {modal: true, detail: "Click 'Open Settings' to disable this prompt or customize the behavior."},
        "Delete", // The first is the default action for pressing enter, at least on macOS
        "Open Settings",
        "Keep", // The last is the default for pressing space bar, at least on macOS
      )
      if (result === "Keep") {
        getJConsole().appendLine(`${logPrefix}User chose to keep notebook: ${uri}`)
        return
      }
      if (result === "Open Settings") {
        getJConsole().appendLine(`${logPrefix}User chose to open settings: ${uri}`)
        vscode.commands.executeCommand("workbench.action.openSettings", "jupytextSync.deleteOnNotebookClose")
        return
      }
      // Else delete
    }

    // Delete the file by moving it to trash
    try {
      await vscode.workspace.fs.delete(uri, {useTrash: true})
      let msg = `Notebook moved to trash: ${uri}.`
      getJConsole().appendLine(`${logPrefix}${msg}`)
      if (!needsConfirmation) {
        msg +=
          " Configurable in the " +
          "[settings](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.deleteOnNotebookClose%22%5D)."
        vscode.window.showInformationMessage(msg)
      }
      return
    } catch (ex) {
      const msg = `Failed to delete notebook ${uri}: ${ex}`
      getJConsole().appendLine(`${logPrefix}${msg}`)
      vscode.window.showErrorMessage(msg)
    }
  } catch (ex) {
    const msg = `${logPrefix}Error in handleNotebookClose for ${uri.fsPath}: ${ex}`
    getJConsole().appendLine(msg)
    console.error(msg, ex)
  }
}

async function handleNotebookClose(document: vscode.NotebookDocument) {
  const logPrefix = makeLogPrefix("onDidCloseNotebookDocument")
  const uri = document.uri
  getJConsole().appendLine(`${logPrefix}Notebook closed: ${uri}`)
  const deleteOnClose = config().get<string>("deleteOnNotebookClose", "if auto created")
  if (deleteOnClose === "never") {
    getJConsole().appendLine(`${logPrefix}Notebook ${uri} deleteOnNotebookClose is 'never', skipping`)
    return // should not happen
  }

  if (!uri.fsPath.endsWith(".ipynb")) {
    getJConsole().appendLine(`${logPrefix}Document ${uri} is not a .ipynb file, skipping`)
    return // should not happen
  }

  if (!(await getFileUri(uri))) {
    return // untitled notebook
  }

  // Queue this entire operation to avoid race conditions with sync/setFormats operations
  return queueOperation(
    uri,
    async () => handleNotebookCloseInternal(uri, deleteOnClose, logPrefix),
    "deleteOnClose",
    logPrefix,
  )
}

async function updateEventHandlers(context: vscode.ExtensionContext) {
  console.debug("updateEventHandlers")

  refreshCliArgsFromConfig()

  const syncDocuments = config().get<{
    onTextDocumentOpen: boolean
    onTextDocumentSave: boolean
    onTextDocumentClose: boolean
    onNotebookDocumentOpen: boolean
    onNotebookDocumentSave: boolean
    onNotebookDocumentClose: boolean
  }>("syncDocuments", {
    onTextDocumentOpen: false,
    onTextDocumentSave: true,
    onTextDocumentClose: false,
    onNotebookDocumentOpen: false,
    onNotebookDocumentSave: true,
    onNotebookDocumentClose: false,
  })

  // Dispose existing handlers if they exist
  disposables.forEach((disposable) => disposable.dispose())
  disposables = []

  // Register new handlers based on current configuration
  if (syncDocuments.onTextDocumentOpen) {
    disposables.push(
      vscode.workspace.onDidOpenTextDocument((document) => handleDocument(document, "onDidOpenTextDocument")),
    )
  }
  if (syncDocuments.onTextDocumentSave) {
    disposables.push(
      vscode.workspace.onDidSaveTextDocument((document) => handleDocument(document, "onDidSaveTextDocument")),
    )
  }
  if (syncDocuments.onTextDocumentClose) {
    disposables.push(
      vscode.workspace.onDidCloseTextDocument((document) => handleDocument(document, "onDidCloseTextDocument")),
    )
  }
  if (syncDocuments.onNotebookDocumentOpen) {
    disposables.push(
      vscode.workspace.onDidOpenNotebookDocument((document) => handleDocument(document, "onDidOpenNotebookDocument")),
    )
  }
  if (syncDocuments.onNotebookDocumentSave) {
    disposables.push(
      vscode.workspace.onDidSaveNotebookDocument((document) => handleDocument(document, "onDidSaveNotebookDocument")),
    )
  }
  if (syncDocuments.onNotebookDocumentClose) {
    disposables.push(
      vscode.workspace.onDidCloseNotebookDocument((document) => handleDocument(document, "onDidCloseNotebookDocument")),
    )
  }

  // Always register the notebook close handler for deletion feature
  const deleteOnClose = config().get<string>("deleteOnNotebookClose", "if auto created")
  if (deleteOnClose !== "never") {
    disposables.push(vscode.workspace.onDidCloseNotebookDocument((document) => handleNotebookClose(document)))
  }
}

async function setSuggestedCompactNotebookLayout() {
  const settingsToUpdate = {
    // important to make the global toolbar visible!
    "notebook.globalToolbar": true,
    "notebook.output.wordWrap": true,
    "notebook.output.textLineLimit": 100,
    "notebook.cellExecutionTimeVerbosity": "verbose",
    "notebook.consolidatedRunButton": true,
    "notebook.globalToolbarShowLabel": "dynamic",
    "notebook.insertToolbarLocation": "notebookToolbar",
    "notebook.cellToolbarLocation": {
      default: "hidden",
    },
    "notebook.scrolling.revealNextCellOnExecute": "firstLine",
  }

  for (const [key, value] of Object.entries(settingsToUpdate)) {
    await setConfig(key, value, vscode.ConfigurationTarget.Global)
  }
  vscode.window.showInformationMessage("Suggested compact notebook layout settings applied.")
}

async function subscribeToNewPythonEnvsChanges(context: vscode.ExtensionContext) {
  const api = await getNewPythonEnvsApi()
  if (!api) {
    return
  }
  try {
    // Single shared timer: both events trigger the same action, so one debounce covers both.
    // Delay trade-off: short = snappier feedback; long = fewer redundant re-validations during
    // burst discovery at startup. 500 ms is below the threshold of noticeable UI lag.
    const DEBOUNCE_MS = 500
    let debounceTimer: ReturnType<typeof setTimeout> | undefined
    const scheduleRevalidate = (reason: string) => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(async () => {
        getJConsole().appendLine(`${reason}, re-validating...`)
        await validatePythonAndJupytext()
      }, DEBOUNCE_MS)
    }

    context.subscriptions.push(
      api.onDidChangeEnvironment(() =>
        scheduleRevalidate("Python environment changed (ms-python.vscode-python-envs)"),
      ),
      api.onDidChangeEnvironments(() =>
        scheduleRevalidate("Python environments list changed (ms-python.vscode-python-envs)"),
      ),
    )
  } catch (ex) {
    getJConsole().appendLine(`Failed to subscribe to Python environment changes: ${ex}`)
  }
}

export function deactivate() {
  // Dispose event handlers if they exist
  disposables.forEach((disposable) => disposable.dispose())
  disposables = []
  getJConsole().dispose()
}
