import * as vscode from "vscode"
import {config, defaultNotebookDir} from "./constants"
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
    supportedExtensions = extensions ?? []
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
        "[settings](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.pythonExecutable%22%5D)."
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

export async function runJupytext(cmdArgs: string[], showError: boolean = true): Promise<string | undefined> {
    try {
        const jupytext = getJupytext()
        if (!jupytext) {
            throw new Error("Jupytext not found")
        }
        // pass the cwd so that jupytext can pick up config files
        const cwd = path.dirname(cmdArgs[cmdArgs.length - 1])
        const output = await runCommand([jupytext.executable, "-m", "jupytext"].concat(cmdArgs), cwd)
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
        return undefined
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

const syncQueues = new Map<string, Promise<string | undefined>>()

export async function runJupytextSync(fileName: string, showError: boolean = true): Promise<string | undefined> {
    const normalizedPath = path.resolve(fileName)

    // Create a new operation that will be added to the queue
    const jupyterSyncFunc = async (): Promise<string | undefined> => {
        // Generate unique timestamp-based ID for this sync operation
        let syncId = Math.random().toString(36)
        syncId = syncId.substring(syncId.length - 4)

        console.log(`[${syncId}] Starting jupytext sync for ${fileName}`)
        getJConsole().appendLine(`[${syncId}] Starting sync for ${fileName}`)

        try {
            const result = await runJupytext(["--sync", fileName], showError)
            console.log(`[${syncId}] Completed jupytext sync for ${fileName}`)
            getJConsole().appendLine(`[${syncId}] Completed sync for ${fileName}`)
            return result
        } catch (error) {
            console.error(`[${syncId}] Failed jupytext sync for ${fileName}:`, error)
            getJConsole().appendLine(`[${syncId}] Failed sync for ${fileName}: ${error}`)
            throw error
        }
    }

    // Get the current queue for this file (or create empty promise if none exists)
    const currentQueue = syncQueues.get(normalizedPath) || Promise.resolve()

    // Chain the new operation to run after the current queue
    // Even if previous operation failed, continue with this one
    const newQueue = currentQueue.then(() => jupyterSyncFunc()).catch(() => jupyterSyncFunc())

    // Update the queue
    syncQueues.set(
        normalizedPath,
        // Don't let failed operations break the queue
        newQueue.catch(() => undefined),
    )

    // Return the result of this specific operation
    return newQueue
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
        const pairedFormats = await readPairedFormats(document.uri.fsPath)
        // This fixes bug when default formats are set inside a config file e.g.
        // project.toml:
        // ```
        // [tool.jupytext]
        // formats = "ipynb,py:percent"
        // ```
        // and `jupytext` uses them right away even thought we never paired the file.
        // In such cases when saving any file matching supported extensions, would get
        // paired unintentionally.
        if (!pairedFormats) {
            const msg = `No paired formats in '${document.uri.fsPath}', skipping sync`
            console.log(msg)
            getJConsole().appendLine(msg)
            return
        }
        return await runJupytextSync(document.uri.fsPath)
    }
}

async function getFilePath(fileUri?: vscode.Uri) {
    // Case 1: Command was called from context menu on a file
    if (fileUri && fileUri instanceof vscode.Uri) {
        return fileUri.fsPath
    }
    // Case 2: Command was called from notebook editor
    else if (vscode.window.activeNotebookEditor) {
        const activeNotebookEditor = vscode.window.activeNotebookEditor

        if (activeNotebookEditor.notebook.isUntitled) {
            vscode.window.showInformationMessage("Please save the notebook before pairing.")
            return undefined
        }

        return activeNotebookEditor.notebook.uri.fsPath
    }
    // Case 3: Command was called from text editor
    else if (vscode.window.activeTextEditor) {
        return vscode.window.activeTextEditor.document.uri.fsPath
    }
    // No file context available
    else {
        vscode.window.showInformationMessage("Please open a file or notebook to pair.")
        return undefined
    }
}

function getSuggestedFormats(filePath: string) {
    let ext = path.extname(filePath)
    const defaultFormats = getDefaultFormats()
    let suggestFormats = defaultFormats[ext] || "default"
    ext = ext.slice(1)
    if (suggestFormats === "default") {
        let fallback = `${defaultNotebookDir}//ipynb,${ext}:percent`
        if (ext === "ipynb") {
            fallback = `${defaultNotebookDir}//ipynb,py:percent`
        }
        suggestFormats = defaultFormats["default"] || fallback
    }
    if (ext !== "ipynb") {
        suggestFormats = suggestFormats.replace("${ext}", ext)
    }
    return suggestFormats
}

export async function setFormats(
    fileUri?: vscode.Uri,
    askFormats: boolean | undefined = undefined,
    formats: string | undefined = undefined,
    requireNotebookFormat: boolean = false,
) {
    const filePath = await getFilePath(fileUri)
    if (!filePath) {
        return [undefined, undefined]
    }

    // Read formats from the file if available, otherwise use the suggested formats
    formats = formats || (await readPairedFormats(filePath)) || getSuggestedFormats(filePath)
    if (askFormats) {
        const fType = filePath.endsWith(".ipynb") ? "notebook" : "document"
        formats = await vscode.window.showInputBox({
            title: "Configure Jupytext Pairing Formats",
            prompt:
                `Define formats to pair with this ${fType}. Jupytext uses this to sync paired files. ` +
                "Example: 'ipynb,py:percent'. Use commas for multiple entries (e.g., 'md,py:percent'). " +
                `Formats can also specify subdirectories (e.g., '${defaultNotebookDir}//ipynb,scripts//py:percent,md'). ` +
                "This input is passed to Jupytext's '--set-formats' argument. " +
                "Syncing occurs on open/save/close based on your " +
                "[Sync Settings](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.syncDocuments%22%5D). " +
                "For common formats and more details, " +
                "refer to the [Default Formats](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.defaultFormats%22%5D) " +
                "settings and the [Jupytext docs](https://jupytext.readthedocs.io).",
            value: formats,
        })
        // User cancelled the input box
        if (!formats) {
            return [filePath, undefined]
        }
        if (requireNotebookFormat) {
            if (!formats.includes("ipynb")) {
                const opt = {modal: true}
                vscode.window.showErrorMessage("Notebook 'ipynb' format required.", opt)
                return [filePath, undefined]
            }
        }
    }

    if (!formats) {
        return [filePath, undefined]
    }
    await runJupytextSetFormats(filePath, formats)
    return [filePath, formats]
}

// Use this in package.json to pair documents, otherwise VSCode injects more arguments
// into setFormats' arguments.
export async function pair(fileUri?: vscode.Uri) {
    return await setFormats(fileUri, config().get<boolean>("askFormats.onPairDocuments", true), undefined)
}

export async function readPairedFormats(filePath: string) {
    const py = `import jupytext; print(jupytext.read('${filePath}').metadata.get('jupytext', {}).get('formats', ''))`
    const jupytext = getJupytext()
    if (!jupytext) {
        const msg = `Jupytext not set, cannot get paired formats for '${filePath}'`
        console.error(msg)
        getJConsole().appendLine(msg)
        return undefined
    }
    try {
        // pass it just in case there some options affecting jupytext
        const cwd = path.dirname(filePath)
        const formats = await runCommand([jupytext.executable, "-c", py], cwd)
        let msg = `Read paired formats for '${filePath}': '${formats}'`
        console.info(msg)
        getJConsole().appendLine(msg)
        return formats // Will be empty string if file has no paired formats
    } catch (ex) {
        const msg = `Failed to get paired formats for '${filePath}': ${ex}`
        console.error(msg)
        getJConsole().appendLine(msg)
        return undefined
    }
}

export async function openPairedNotebook(fileUri?: vscode.Uri) {
    let filePath = await getFilePath(fileUri)
    let msg = `Opening as paired notebook '${filePath}'`
    console.info(msg)
    getJConsole().appendLine(msg)
    if (!filePath) {
        msg = `Failed to open as paired notebook '${filePath}'`
        console.error(msg)
        getJConsole().appendLine(msg)
        return [undefined, undefined]
    }
    let pairedFormats = await readPairedFormats(filePath)
    if (pairedFormats === undefined) {
        msg = `Failed to get paired formats for '${filePath}'. Aborting.`
        console.error(msg)
        getJConsole().appendLine(msg)
        vscode.window.showErrorMessage(msg)
        return [filePath, undefined]
    }

    if (pairedFormats === "" || !pairedFormats.split(",").some((f) => f.endsWith("ipynb"))) {
        msg = `Not paired with a .ipynb notebook: '${filePath}', pairing`
        console.info(msg)
        getJConsole().appendLine(msg)
        let [_, updatedFormats] = await setFormats(
            fileUri,
            config().get<boolean>("askFormats.onOpenPairedNotebook", false),
            // If ipynb is missing, add it automatically to the pairing formats.
            // We don't want the jupytext.defaultFormats to override the formats
            // in the script's metadata.
            pairedFormats ? defaultNotebookDir + "//ipynb," + pairedFormats : undefined,
            true,
        )
        pairedFormats = updatedFormats
        if (!pairedFormats) {
            msg = `Aborted or failed to pair '${filePath}'`
            console.warn(msg)
            getJConsole().appendLine(msg)
            return [filePath, undefined]
        }
        msg = `Paired: '${filePath}' with '${pairedFormats}' formats`
        console.info(msg)
        getJConsole().appendLine(msg)
    } else {
        // Sync before opening the notebook, just in case
        await runJupytextSync(filePath)
    }
    // Extract the subdir from the paired formats and open the ipynb file as a notebook
    const formats = pairedFormats.split(",")
    for (const format of formats) {
        if (format.endsWith("ipynb")) {
            let subdir = ""
            if (format.includes("//")) {
                subdir = format.split("//")[0]
            }
            const {dir, name} = path.parse(filePath)
            let subdirPath = dir
            if (!subdir) {
                console.warn("Unexpected format: " + format)
            } else {
                subdirPath = path.join(dir, subdir)
            }
            const notebookPath = path.join(subdirPath, name + ".ipynb")
            const uri = vscode.Uri.file(notebookPath)

            // This did not seem to work
            // await vscode.workspace.openNotebookDocument(uri)

            await vscode.commands.executeCommand("vscode.openWith", uri, "jupyter-notebook")
            return [filePath, pairedFormats]
        }
    }
    // Should not happen
    msg = `No ipynb format found in paired formats: '${pairedFormats}'`
    console.warn(msg)
    getJConsole().appendLine(msg)
    vscode.window.showErrorMessage(msg)
    return [filePath, pairedFormats]
}

function compareVersions(a: string, b: string) {
    const regex = /^(\d+)\.(\d+)\.(\d+)(rc\d*)?$/

    const matchA = a.match(regex)
    const matchB = b.match(regex)

    if (!matchA || !matchB) {
        // Handle invalid version strings if necessary, or throw an error
        // For simplicity, this example pushes them to the end
        if (!matchA && !matchB) {
            return 0
        }
        return !matchA ? 1 : -1
    }

    const [, majorA, minorA, patchA, rcA] = matchA.map((val, i) => (i > 0 && i < 4 ? parseInt(val, 10) : val))
    const [, majorB, minorB, patchB, rcB] = matchB.map((val, i) => (i > 0 && i < 4 ? parseInt(val, 10) : val))

    if (majorA !== majorB) {
        return (majorA as number) - (majorB as number)
    }
    if (minorA !== minorB) {
        return (minorA as number) - (minorB as number)
    }
    if (patchA !== patchB) {
        return (patchA as number) - (patchB as number)
    }

    // Handle release candidates
    if (rcA && !rcB) {
        return -1
    } // rcA comes before non-rc B
    if (!rcA && rcB) {
        return 1
    } // non-rc A comes after rcB
    if (rcA && rcB) {
        if (rcA === rcB) {
            return 0
        }
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
