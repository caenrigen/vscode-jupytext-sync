import * as vscode from "vscode"
import {getJupytext, pickJupytext, resolveJupytext, setJupytext, Jupytext} from "./jupytext"
import {getJConsole, config, setConfig} from "./constants"
import {
    setFormats,
    importJupytextFileExtensions,
    getSupportedExtensions,
    setSupportedExtensions,
    handleDocument,
} from "./jupytext"

// Store disposables for event handlers so we can manage them
let disposables: vscode.Disposable[] = []

export async function activate(context: vscode.ExtensionContext) {
    getJConsole().appendLine("Activating Jupytext extension...")

    // Listen for configuration changes and update handlers accordingly
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(async (e) => {
            console.debug("onDidChangeConfiguration")
            if (
                e.affectsConfiguration("jupytextSync.syncDocuments") ||
                e.affectsConfiguration("jupytextSync.pythonExecutable")
            ) {
                await updateEventHandlers(context)
            }
        }),
    )
    context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.setFormats", setFormats))
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
            "jupytextSync.setRecommendedCompactNotebookLayout",
            setRecommendedCompactNotebookLayout,
        ),
    )
    context.subscriptions.push(vscode.commands.registerCommand("jupytextSync.showLogs", () => getJConsole().show()))

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

async function handleSelection(msg: string) {
    const selection = await vscode.window.showErrorMessage(msg, "Select Interpreter", "Open Settings", "Show Output")
    if (selection === "Select Interpreter") {
        await vscode.commands.executeCommand("workbench.action.quickOpen", ">Python: Select Interpreter")
    } else if (selection === "Open Settings") {
        await vscode.commands.executeCommand("workbench.action.openSettings", "jupytextSync.pythonExecutable")
    } else if (selection === "Show Output") {
        getJConsole().show()
    }
}

async function updateEventHandlers(context: vscode.ExtensionContext) {
    console.debug("updateEventHandlers")

    let pythonPath = config().get<string>("pythonExecutable") ?? undefined
    setJupytext(undefined) // reset runtime jupytext

    if (pythonPath) {
        const jupytext = await resolveJupytext(pythonPath)
        if (jupytext.executable && jupytext.jupytextVersion) {
            setJupytext(jupytext as Jupytext, false)
        } else {
            const msg =
                `Could not invoke Jupytext with the python executable '${pythonPath}'. ` +
                "Will attempt to locate a suitable Python executable automatically."
            console.warn(msg)
            getJConsole().appendLine(msg)
            pythonPath = undefined
            vscode.window.showWarningMessage(msg) // don't await
        }
    }

    // First launch or bad python/jupytext, try to set it automatically
    if (!pythonPath) {
        const jupytext = await pickJupytext()
        if (jupytext) {
            setJupytext(jupytext, true)
            // Set it globally to avoid the need to select the interpreter again.
            // It is less intuitive for less experienced users. Advanced users can
            // always configure the Workspace overrides.
            await setConfig("jupytextSync.pythonExecutable", jupytext.executable, vscode.ConfigurationTarget.Global)
        } else {
            const messageSettings =
                "Failed to automatically locate a python executable that can invoke Jupytext. " +
                "Click 'Open Settings' and specify the Python Executable. " +
                "There you will find more detailed instructions and tips. " +
                "If you still have issues, click 'Show Logs' for more information or " +
                "create an issue on [GitHub](https://github.com/caenrigen/vscode-jupytext-sync/issues)."
            const selection = await vscode.window.showErrorMessage(messageSettings, "Open Settings", "Show Logs")
            if (selection === "Open Settings") {
                vscode.commands.executeCommand("workbench.action.openSettings", "jupytextSync.pythonExecutable") // don't await
            } else if (selection === "Show Logs") {
                getJConsole().show()
            }
        }
    }

    // update supported extensions importing them from the jupytext python module
    if (getJupytext()) {
        const extensions = await importJupytextFileExtensions()
        if (extensions) {
            setSupportedExtensions(extensions)
        }
    }
    await vscode.commands.executeCommand("setContext", "jupytextSync.supportedExtensions", getSupportedExtensions())

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
        disposables.push(vscode.workspace.onDidOpenTextDocument(handleDocument))
    }
    if (syncDocuments.onTextDocumentSave) {
        disposables.push(vscode.workspace.onDidSaveTextDocument(handleDocument))
    }
    if (syncDocuments.onTextDocumentClose) {
        disposables.push(vscode.workspace.onDidCloseTextDocument(handleDocument))
    }
    if (syncDocuments.onNotebookDocumentOpen) {
        disposables.push(vscode.workspace.onDidOpenNotebookDocument(handleDocument))
    }
    if (syncDocuments.onNotebookDocumentSave) {
        disposables.push(vscode.workspace.onDidSaveNotebookDocument(handleDocument))
    }
    if (syncDocuments.onNotebookDocumentClose) {
        disposables.push(vscode.workspace.onDidCloseNotebookDocument(handleDocument))
    }

    // Suggest compact layout on first activation
    if (pythonPath && !context.globalState.get("hasShownCompactLayoutSuggestion")) {
        const selection = await vscode.window.showInformationMessage(
            "Jupytext Sync: Would you like to apply a recommended compact notebook layout for a better experience?",
            "Apply Layout",
        )
        if (selection === "Apply Layout") {
            vscode.commands.executeCommand("jupytextSync.setRecommendedCompactNotebookLayout")
        }
        await context.globalState.update("hasShownCompactLayoutSuggestion", true)
    }
}

async function setRecommendedCompactNotebookLayout() {
    const settingsToUpdate = {
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
    vscode.window.showInformationMessage("Recommended compact notebook layout settings applied.")
}

export function deactivate() {
    // Dispose event handlers if they exist
    disposables.forEach((disposable) => disposable.dispose())
    disposables = []
    getJConsole().dispose()
}
