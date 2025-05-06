import * as vscode from "vscode"
import {config} from "./constants"
import {getPythonExecutable, runPython} from "./python"
import {getJConsole} from "./constants"
import * as path from "path"

export const EXTENSIONS = [
    ".ipynb",
    ".md",
    ".markdown",
    ".Rmd",
    ".py",
    ".coco",
    ".R",
    ".r",
    ".jl",
    ".cpp",
    ".ss",
    ".clj",
    ".scm",
    ".sh",
    ".ps1",
    ".q",
    ".m",
    ".wolfram",
    ".pro",
    ".js",
    ".ts",
    ".scala",
    ".rs",
    ".robot",
    ".resource",
    ".cs",
    ".fsx",
    ".fs",
    ".sos",
    ".java",
    ".groovy",
    ".sage",
    ".ml",
    ".hs",
    ".tcl",
    ".mac",
    ".gp",
    ".do",
    ".sas",
    ".xsh",
    ".lgt",
    ".logtalk",
    ".lua",
    ".go",
    ".qmd",
    ".myst",
    ".mystnb",
    ".mnb",
]

let jupytextVersion: string | undefined = undefined
let supportedExtensions: string[] = EXTENSIONS

export function getSupportedExtensions(): string[] {
    return supportedExtensions
}

export function setSupportedExtensions(extensions: string[]): void {
    supportedExtensions = extensions
}

export function getJupytextVersion(): string | undefined {
    return jupytextVersion
}

export async function runJupytextVersion(): Promise<boolean> {
    jupytextVersion = await runJupytext(["--version"], false)
    if (jupytextVersion) {
        getJConsole().appendLine(`Using Jupytext version ${getJupytextVersion()} via ${getPythonExecutable()}`)
        return true
    }
    return false
}

export async function runJupytext(cmdArgs: string[], showError: boolean = true): Promise<string> {
    try {
        const output = await runPython(["-m", "jupytext"].concat(cmdArgs))
        getJConsole().appendLine(output)
        return output
    } catch (ex) {
        const msg = `Failed to run Jupytext: ${ex}`
        console.error(msg, ex)
        getJConsole().appendLine(msg)
        if (showError) {
            const selection = await vscode.window.showErrorMessage(
                `Failed to run Jupytext. See output for details.`,
                "Show Output",
            )
            if (selection === "Show Output") {
                getJConsole().show()
            }
        }
        return ""
    }
}

export async function importJupytextFileExtensions(): Promise<string[] | undefined> {
    try {
        const extensions = await runPython([
            "-c",
            "import jupytext; import json; print(json.dumps(jupytext.formats.NOTEBOOK_EXTENSIONS))",
        ])
        const extensionsArray = JSON.parse(extensions)
        getJConsole().appendLine(`Jupytext ${getJupytextVersion()} supports: ${extensionsArray.join(", ")}`)
        return extensionsArray
    } catch (ex) {
        const msg = `Failed to import Jupytext and the file extensions it supports: ${ex}`
        console.error(msg, ex)
        getJConsole().appendLine(msg)
        return undefined
    }
}

export function getDefaultFormats(): Record<string, string> {
    return config().get<Record<string, string>>("defaultFormats", {})
}

export async function runJupytextSync(fileName: string) {
    return await runJupytext(["--sync", fileName])
}

export async function runJupytextSetFormats(fileName: string, formats: string) {
    return await runJupytext(["--set-formats", formats, fileName])
}

export function isSupportedFile(fileName: string): boolean {
    const ext = path.extname(fileName)
    return supportedExtensions.includes(ext)
}

export async function handleDocument(document: vscode.TextDocument | vscode.NotebookDocument) {
    if (jupytextVersion && isSupportedFile(document.uri.fsPath) && document.uri.scheme === "file") {
        return await runJupytextSync(document.uri.fsPath)
    }
}

export async function setFormats(fileUri?: vscode.Uri) {
    let fileName: string

    // Case 1: Command was called from context menu on a file
    if (fileUri && fileUri instanceof vscode.Uri) {
        fileName = fileUri.fsPath
    }
    // Case 2: Command was called from notebook editor
    else if (vscode.window.activeNotebookEditor) {
        const activeNotebookEditor = vscode.window.activeNotebookEditor

        if (activeNotebookEditor.notebook.isUntitled) {
            vscode.window.showInformationMessage("Please save the notebook before pairing.")
            return
        }

        // for a non-untitled notebook, doing a save is fine
        await activeNotebookEditor.notebook.save()

        fileName = activeNotebookEditor.notebook.uri.fsPath
    }
    // Case 3: Command was called from text editor
    else if (vscode.window.activeTextEditor) {
        fileName = vscode.window.activeTextEditor.document.uri.fsPath
    }
    // No file context available
    else {
        vscode.window.showInformationMessage("Please open a file or notebook to pair.")
        return
    }

    let ext = path.extname(fileName)
    const defaultFormats = getDefaultFormats()
    let suggestFormats = defaultFormats[ext] || "default"
    if (suggestFormats === "default") {
        suggestFormats = defaultFormats["default"] || "ipynb,py:percent"
    }
    ext = ext.slice(1)
    suggestFormats = suggestFormats.replace("${ext}", ext)

    const fType = fileName.endsWith(".ipynb") ? "notebook" : "file"
    const formats = await vscode.window.showInputBox({
        title: "Formats to pair via Jupytext",
        prompt:
            `Enter script formats to pair together with this ${fType}. ` +
            "After the files have been paired, they will be synced on open/save/close " +
            "events, according to your configuration of this extension. " +
            "This string will be passed to jupytext's '--set-formats' argument. " +
            "Use a comma ',' to separate multiple file extensions and their (optional) " +
            "corresponding jupytext formats: 'ext1,ext2:format2'. " +
            "The main supported formats are: percent, hydrogen, light, nomarker, " +
            "markdown, myst, rmarkdown, spin, quarto, pandoc and sphinx. " +
            "See [Jupytext docs](https://jupytext.readthedocs.io) for more details.",
        value: suggestFormats,
    })

    if (formats) {
        await runJupytextSetFormats(fileName, formats)
    }
}
