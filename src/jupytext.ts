import * as vscode from "vscode"
import {config} from "./constants"
import {getPythonPaths, runCommand, resolvePythonExecutable} from "./python"
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

export type MaybeJupytext = {
    python: string
    executable: string | undefined
    jupytextVersion: string | undefined
}

export type Jupytext = {
    python: string
    executable: string
    jupytextVersion: string
}

let jupytextInfo: Jupytext | undefined = undefined
let supportedExtensions: string[] = EXTENSIONS

export function getSupportedExtensions(): string[] {
    return supportedExtensions
}

export function setSupportedExtensions(extensions: string[]): void {
    supportedExtensions = extensions
}

export function getJupytext(): Jupytext | undefined {
    return jupytextInfo
}

export function setJupytext(jupytext: Jupytext | undefined, showMessage: boolean = false): void {
    jupytextInfo = jupytext
    if (!jupytext) {
        console.log("Jupytext cleared")
        return
    }
    let msg = `Using Jupytext ${jupytext.jupytextVersion} via '${jupytext.executable}' `
    if (jupytext.executable !== jupytext.python) {
        msg += ` (${jupytext.python}).`
    }
    console.log(msg)
    getJConsole().appendLine(msg)
    msg +=
        " This is configurable in the " +
        "[settings](command:workbench.action.openSettings?%5B%22jupytextSync.pythonExecutable%22%5D)."
    if (showMessage) {
        vscode.window.showInformationMessage(msg) // don't await
    }
}

export async function getAvailableVersions(): Promise<Jupytext[]> {
    const pythonPaths = await getPythonPaths()
    const versions = await Promise.all(pythonPaths.map(resolveJupytext))
    let msg = "Verifying Jupytext versions:\n"
    for (const v of versions) {
        msg += `Option: ${v}`
    }
    console.log(msg)
    getJConsole().appendLine(msg)
    return versions.filter((v) => v.executable && v.jupytextVersion) as Jupytext[]
}

async function runJupytextVersion(pythonPath: string) {
    try {
        const version = await runCommand([pythonPath, "-m", "jupytext", "--version"])
        return version ?? undefined
    } catch (ex) {
        const msg = `Failed to run Jupytext version with ${pythonPath}: ${ex}`
        console.debug(msg, ex)
        return undefined
    }
}

export async function resolveJupytext(pythonPath: string): Promise<MaybeJupytext> {
    const executable = await resolvePythonExecutable([pythonPath])
    if (!executable) {
        return {python: pythonPath, executable: undefined, jupytextVersion: undefined}
    }
    const jupytextVersion = await runJupytextVersion(executable)
    return {python: pythonPath, executable, jupytextVersion}
}

export async function runJupytext(cmdArgs: string[], showError: boolean = true): Promise<string> {
    try {
        const jupytext = getJupytext()
        if (!jupytext) {
            throw new Error("Jupytext not found")
        }
        const output = await runCommand([jupytext.executable, "-m", "jupytext"].concat(cmdArgs))
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
        const jupytext = getJupytext()
        if (!jupytext) {
            throw new Error("Jupytext not found")
        }
        const extensions = await runCommand([
            jupytext.executable,
            "-c",
            "import jupytext; import json; print(json.dumps(jupytext.formats.NOTEBOOK_EXTENSIONS))",
        ])
        const extensionsArray = JSON.parse(extensions)
        getJConsole().appendLine(`Jupytext ${jupytext.jupytextVersion} supports: ${extensionsArray.join(", ")}`)
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
    const jupytext = getJupytext()
    if (!jupytext) {
        console.error("handleDocument: Jupytext not set")
        return
    }
    if (isSupportedFile(document.uri.fsPath) && document.uri.scheme === "file") {
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

function compareVersions(a: string, b: string) {
    const regex = /^(\d+)\.(\d+)\.(\d+)(rc\d*)?$/

    const matchA = a.match(regex)
    const matchB = b.match(regex)

    if (!matchA || !matchB) {
        // Handle invalid version strings if necessary, or throw an error
        // For simplicity, this example pushes them to the end
        if (!matchA && !matchB) return 0
        return !matchA ? 1 : -1
    }

    const [, majorA, minorA, patchA, rcA] = matchA.map((val, i) => (i > 0 && i < 4 ? parseInt(val, 10) : val))
    const [, majorB, minorB, patchB, rcB] = matchB.map((val, i) => (i > 0 && i < 4 ? parseInt(val, 10) : val))

    if (majorA !== majorB) return (majorA as number) - (majorB as number)
    if (minorA !== minorB) return (minorA as number) - (minorB as number)
    if (patchA !== patchB) return (patchA as number) - (patchB as number)

    // Handle release candidates
    if (rcA && !rcB) return -1 // rcA comes before non-rc B
    if (!rcA && rcB) return 1 // non-rc A comes after rcB
    if (rcA && rcB) {
        if (rcA === rcB) return 0
        // Extract rc numbers for comparison, e.g., "rc0" -> 0, "rc2" -> 2
        const rcNumA = parseInt((rcA as string).substring(2), 10)
        const rcNumB = parseInt((rcB as string).substring(2), 10)
        return rcNumA - rcNumB
    }

    return 0 // Versions are identical (shouldn't happen if rc logic is complete)
}

export function sortVersions(versions: Jupytext[]) {
    return versions.sort((vA, vB) => compareVersions(vA.jupytextVersion, vB.jupytextVersion))
}

export async function pickJupytext(): Promise<Jupytext | undefined> {
    const msg = "Attempting to pick a python executable and Jupytext automatically"
    console.log(msg)
    getJConsole().appendLine(msg)
    const sorted = sortVersions(await getAvailableVersions())
    return sorted[sorted.length - 1] ?? undefined
}
