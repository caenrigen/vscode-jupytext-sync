import * as vscode from "vscode"
import {getPythonExecutable, locatePython} from "./python"
import {runJupytextVersion} from "./jupytext"
import {getJConsole, config} from "./constants"
import {
    setFormats,
    importJupytextFileExtensions,
    getSupportedExtensions,
    setSupportedExtensions,
    handleDocument,
} from "./jupytext"

// Store disposables for event handlers so we can manage them
let disposables: vscode.Disposable[] = []

export async function locatePythonAndJupytext(): Promise<[boolean, boolean]> {
    if (!(await locatePython())) {
        return [false, false]
    }
    return [true, await runJupytextVersion()]
}

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

    // check if python and jupytext are installed
    let [pythonFound, jupytextFound] = await locatePythonAndJupytext()
    if (!pythonFound) {
        const msg =
            "Jupytext Sync: no python found. " +
            "Jupytext Sync requires a python with [jupytext](https://jupytext.readthedocs.io/) module installed. " +
            "Please select a workspace interpreter for " +
            "[MS Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) " +
            "or manually set the python executable in Jupytext Sync settings. " +
            "Afterwards, restart VSCode for changes to take effect."
        await handleSelection(msg)
        setSupportedExtensions([])
        getJConsole().appendLine("Python not available. Jupytext Sync deactivated.")
        return
    }

    if (!jupytextFound) {
        const msg =
            `Jupytext cannot be invoked with ${getPythonExecutable()}. ` +
            "Jupytext Sync requires a python with [jupytext](https://jupytext.readthedocs.io/) module installed. " +
            "Please [install jupytext](https://jupytext.readthedocs.io/en/latest/install.html) " +
            "in your python environment. Alternatively, you can select a different workspace interpreter for " +
            "[MS Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) " +
            "or set the python executable manually in Jupytext Sync settings. " +
            "Afterwards, restart VSCode for changes to take effect."
        await handleSelection(msg)
        setSupportedExtensions([])
        getJConsole().appendLine("Python not available. Jupytext Sync deactivated.")
        return
    }

    // set the initial supported extensions, will be used as a fallback
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

    // update supported extensions importing them from the jupytext python module
    const extensions = await importJupytextFileExtensions()
    if (extensions) {
        setSupportedExtensions(extensions)
        await vscode.commands.executeCommand("setContext", "jupytextSync.supportedExtensions", getSupportedExtensions())
    }

    // Suggest compact layout on first activation
    if (!context.globalState.get("hasShownCompactLayoutSuggestion")) {
        const selection = await vscode.window.showInformationMessage(
            "Jupytext Sync: Would you like to apply a recommended compact notebook layout for a better experience?",
            "Apply Layout",
        )
        if (selection === "Apply Layout") {
            vscode.commands.executeCommand("jupytextSync.setRecommendedCompactNotebookLayout")
        }
        context.globalState.update("hasShownCompactLayoutSuggestion", true)
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

    const config = vscode.workspace.getConfiguration()

    for (const [key, value] of Object.entries(settingsToUpdate)) {
        try {
            await config.update(key, value, vscode.ConfigurationTarget.Global)
        } catch (error) {
            console.error(`Failed to update setting ${key}:`, error)
            vscode.window.showErrorMessage(`Failed to update setting ${key}. See console for details.`)
        }
    }
    vscode.window.showInformationMessage("Recommended compact notebook layout settings applied.")
}

export function deactivate() {
    // Dispose event handlers if they exist
    disposables.forEach((disposable) => disposable.dispose())
    disposables = []
    getJConsole().dispose()
}
