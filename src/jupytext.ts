import * as vscode from "vscode"
import {config, defaultNotebookDir, EXTENSIONS} from "./constants"
import {getPythonPaths, runCommand, resolvePythonExecutable} from "./python"
import {getJConsole} from "./constants"
import * as path from "path"
import * as fs from "fs"

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
let extensionContext: vscode.ExtensionContext | undefined = undefined

const AUTO_CREATED_NOTEBOOKS_KEY = "jupytextSync.autoCreatedNotebooks"

export function setExtensionContext(context: vscode.ExtensionContext): void {
  extensionContext = context
}

export function markNotebookAsAutoCreated(notebookUri: vscode.Uri, logPrefix: string = ""): void {
  if (!extensionContext) {
    getJConsole().appendLine(`${logPrefix}Extension context not set, cannot track auto-created notebook`)
    return
  }
  const autoCreated = extensionContext.workspaceState.get<string[]>(AUTO_CREATED_NOTEBOOKS_KEY, [])
  const notebookPath = notebookUri.fsPath
  if (!autoCreated.includes(notebookPath)) {
    autoCreated.push(notebookPath)
    extensionContext.workspaceState.update(AUTO_CREATED_NOTEBOOKS_KEY, autoCreated)
    getJConsole().appendLine(`${logPrefix}Marked notebook as auto-created: ${notebookPath}`)
  }
}

export function isUntitled(uri: vscode.Uri): boolean {
  return uri.scheme === "untitled"
}

export function isNotebookAutoCreated(notebookUri: vscode.Uri): boolean {
  if (!extensionContext) {
    return false
  }
  const autoCreated = extensionContext.workspaceState.get<string[]>(AUTO_CREATED_NOTEBOOKS_KEY, [])
  return autoCreated.includes(notebookUri.fsPath)
}

export function unmarkNotebookAsAutoCreated(notebookUri: vscode.Uri, logPrefix: string = ""): void {
  if (!extensionContext) {
    return
  }
  const autoCreated = extensionContext.workspaceState.get<string[]>(AUTO_CREATED_NOTEBOOKS_KEY, [])
  const notebookPath = notebookUri.fsPath
  const filtered = autoCreated.filter((path) => path !== notebookPath)
  if (filtered.length < autoCreated.length) {
    extensionContext.workspaceState.update(AUTO_CREATED_NOTEBOOKS_KEY, filtered)
    getJConsole().appendLine(`${logPrefix}Unmarked notebook as auto-created: ${notebookPath}`)
  }
}

export function getSupportedExtensions(): string[] {
  return supportedExtensions
}

export function setSupportedExtensions(extensions: string[]): void {
  supportedExtensions = extensions ?? []
}

export function resetSupportedExtensions(): void {
  supportedExtensions = EXTENSIONS
}

export function getJupytext(): Jupytext | undefined {
  return jupytextInfo
}

export async function setJupytext(jupytext: Jupytext | undefined, showMessage: boolean = false): Promise<void> {
  // Prior to v1.17.3 there were several issues and bugs that did not play well with
  // this extension. Made it a requirement to simplify code.
  const vMin = "1.17.3"
  if (jupytext && compareVersions(jupytext.jupytextVersion, vMin) < 0) {
    const msgVersion =
      `Jupytext version ${jupytext.jupytextVersion} is not supported. ` +
      `To use this extension, upgrade to Jupytext ${vMin} or newer.`
    getJConsole().appendLine(msgVersion)
    vscode.window.showErrorMessage(msgVersion) // don't await
    jupytext = undefined // clear the jupytext info and make function return
  }

  jupytextInfo = jupytext // store the jupytext info for later use (or clear it)
  if (!jupytext) {
    getJConsole().appendLine("Jupytext cleared")
    resetSupportedExtensions()
    return
  }

  // Import supported extensions from Jupytext
  const extensions = await importJupytextFileExtensions()
  if (extensions) {
    setSupportedExtensions(extensions)
  }

  let msg = `Using Jupytext ${jupytext.jupytextVersion} via '${jupytext.executable}' `
  if (jupytext.executable !== jupytext.python) {
    msg += ` (${jupytext.python}).`
  }
  getJConsole().appendLine(msg)
  msg +=
    " Configurable in the " +
    "[settings](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.pythonExecutable%22%5D)."
  if (showMessage) {
    vscode.window.showInformationMessage(msg) // don't await
  }
}

export async function getAvailableVersions(): Promise<Jupytext[]> {
  const pythonPaths = await getPythonPaths()
  const versions = await Promise.all(pythonPaths.map(resolveJupytext))
  let msg = "Verifying Jupytext versions:\n"
  for (const {python, executable, jupytextVersion} of versions) {
    msg += `Option: ${python} (${executable}) jupytext=${jupytextVersion}\n`
  }
  getJConsole().appendLine(msg)
  return versions.filter((v) => v.executable && v.jupytextVersion) as Jupytext[]
}

async function runJupytextVersion(pythonPath: string) {
  try {
    const version = await runCommand([pythonPath, "-m", "jupytext", "--version"])
    return version ?? undefined
  } catch (ex) {
    const msg = `Failed to run Jupytext version with ${pythonPath}: ${ex}`
    console.error(msg, ex)
    getJConsole().appendLine(msg)
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

const injectTimestamp = (module: string, prefix: string = "") =>
  "import sys; sys.path.remove(''); import runpy,time; " +
  "ow1=sys.stdout.write; " +
  `sys.stdout.write=lambda s,ow=ow1: ow(''.join(f'${prefix}{time.time():.6f} {l}' for l in s.splitlines(True))); ` +
  "ow2=sys.stderr.write; " +
  `sys.stderr.write=lambda s,ow=ow2: ow(''.join(f'${prefix}{time.time():.6f} {l}' for l in s.splitlines(True))); ` +
  `runpy.run_module('${module}', run_name='__main__')`

export async function runJupytext(
  cmdArgs: string[],
  showError: boolean = true,
  logPrefix: string = "",
): Promise<string | undefined> {
  try {
    const jupytext = getJupytext()
    if (!jupytext) {
      throw new Error("Jupytext not found")
    }
    const cmdLog = ["jupytext", ...cmdArgs].join(" ")
    getJConsole().appendLine(`${logPrefix}Executing (abbreviated): ${cmdLog}`)
    // pass the cwd so that jupytext can pick up config files
    const cwd = path.dirname(cmdArgs[cmdArgs.length - 1])
    // const cmdBase = [jupytext.executable, "-m", "jupytext"]
    const cmdBase = [jupytext.executable, "-c", injectTimestamp("jupytext", logPrefix)]
    const output = await runCommand(cmdBase.concat(cmdArgs), cwd)
    // Don't prefix with logPrefix, already done by injectTimestamp
    getJConsole().appendLine(output)
    return output
  } catch (ex) {
    const msg = `Failed to run Jupytext: ${ex}`
    getJConsole().appendLine(`${logPrefix}${msg}`)
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
      "import sys; sys.path.remove(''); import jupytext, json; print(json.dumps(jupytext.formats.NOTEBOOK_EXTENSIONS))",
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

// Cached extra CLI args for jupytext commands
let cachedSetFormatsCliArgs: string[] = []
let cachedSyncCliArgs: string[] = []

export function refreshCliArgsFromConfig(): void {
  try {
    const setFormatsItems = config().get<string[]>("setFormatsArgs", [])
    const syncItems = config().get<string[]>("syncArgs", [])
    cachedSetFormatsCliArgs = (setFormatsItems || []).filter((s) => typeof s === "string" && s.trim() !== "")
    cachedSyncCliArgs = (syncItems || []).filter((s) => typeof s === "string" && s.trim() !== "")
    const msg =
      "Loaded extra CLI args - setFormats: [" +
      cachedSetFormatsCliArgs.join(" ") +
      "] sync: [" +
      cachedSyncCliArgs.join(" ") +
      "]"
    getJConsole().appendLine(msg)
  } catch (ex) {
    const msg = `Failed to load extra CLI args from config: ${ex}`
    getJConsole().appendLine(msg)
    cachedSetFormatsCliArgs = []
    cachedSyncCliArgs = []
  }
}

function getSetFormatsArgs(formats: string): string[] {
  const args = [...cachedSetFormatsCliArgs]
  const idx = args.indexOf("--set-formats")
  if (idx !== -1) {
    const withInserted = args.slice()
    withInserted.splice(idx + 1, 0, formats)
    return withInserted
  }
  return args
}

function getSyncArgs(): string[] {
  return cachedSyncCliArgs
}

// Queue for operations on paired file groups
const operationQueues = new Map<string, Promise<any>>()

/**
 * Generate a consistent key for a group of paired files.
 * All paired files share the same base name, ignoring directory and
 * subdirs in format specs. This might be over-constraining, but there are no good
 * alternatives without complex logic.
 */
function getPairingGroupKey(fileUri: vscode.Uri): string {
  // Use base filename (without extension) as the group key
  // This ensures all paired files (script.py, script.ipynb, script.md) share the same key
  const fsPath = fileUri.fsPath
  return path.basename(fsPath, path.extname(fsPath))
}

/**
 * Queue an operation for a group of paired files to ensure sequential execution.
 * All operations on the same paired file group will be serialized.
 *
 * @param uri - The URI of any file in the paired group
 * @param operation - The operation to execute. Must use internal functions,
 * not queued ones, to avoid nested queuing deadlocks.
 * @param operationName - Name of the operation for logging
 * @param logPrefix - Optional prefix for log messages
 */
export async function queueOperation<T>(
  uri: vscode.Uri,
  operation: () => Promise<T>,
  operationName: string,
  logPrefix: string = "",
): Promise<T> {
  const wrappedOperation = async (): Promise<T> => {
    const msg = `${logPrefix}Queued '${operationName}' started for ${uri}`
    getJConsole().appendLine(msg)
    try {
      const result = await operation()
      const msg = `${logPrefix}Queued '${operationName}' completed for ${uri}`
      getJConsole().appendLine(msg)
      return result
    } catch (ex) {
      const msg = `${logPrefix}Queued '${operationName}' failed for ${uri}: ${ex}`
      getJConsole().appendLine(msg)
      throw ex
    }
  }

  const groupKey = getPairingGroupKey(uri)
  // Get the current queue for this group (or create empty promise if none exists)
  const currentQueue = operationQueues.get(groupKey) || Promise.resolve()

  // Chain the new operation to run after the current queue
  // Even if previous operation failed, continue with this one
  const newQueue = currentQueue.then(() => wrappedOperation()).catch(() => wrappedOperation())
  // Update the queue (don't let failed operations break the queue)
  operationQueues.set(
    groupKey,
    newQueue.catch(() => undefined),
  )
  const msg = `${logPrefix}Queued ${operationName} for ${uri}`
  getJConsole().appendLine(msg)

  // Return the result of this specific operation
  return newQueue
}

// Internal implementation - does the actual sync without queuing
async function runJupytextSyncInternal(
  uri: vscode.Uri,
  showError: boolean = true,
  logPrefix: string = "",
): Promise<string | undefined> {
  const normalizedPath = path.resolve(uri.fsPath)
  getJConsole().appendLine(`${logPrefix}Running jupytext sync for ${normalizedPath}`)
  const result = await runJupytext([...getSyncArgs(), normalizedPath], showError, logPrefix)
  getJConsole().appendLine(`${logPrefix}Completed jupytext sync for ${normalizedPath}`)
  return result
}

export async function runJupytextSync(
  uri: vscode.Uri,
  showError: boolean = true,
  logPrefix: string = "",
): Promise<string | undefined> {
  return queueOperation(uri, () => runJupytextSyncInternal(uri, showError, logPrefix), "Sync", logPrefix)
}

// Internal implementation - does the actual setFormats without queuing
async function runJupytextSetFormatsInternal(uri: vscode.Uri, formats: string[], logPrefix: string = "") {
  return await runJupytext([...getSetFormatsArgs(formats.join(",")), uri.fsPath], true, logPrefix)
}

export async function runJupytextSetFormats(uri: vscode.Uri, formats: string[], logPrefix: string = "") {
  return queueOperation(uri, () => runJupytextSetFormatsInternal(uri, formats, logPrefix), "SetFormats", logPrefix)
}

export function isSupportedFile(uri: vscode.Uri): boolean {
  const ext = path.extname(uri.fsPath)
  return supportedExtensions.includes(ext)
}

export function makeLogPrefix(eventName: string): string {
  let eventId = Math.random().toString(36)
  eventId = eventId.substring(eventId.length - 4)
  return `${eventName},${eventId}: `
}

export async function handleDocument(document: vscode.TextDocument | vscode.NotebookDocument, eventName: string) {
  const logPrefix = makeLogPrefix(eventName)

  const jupytext = getJupytext()
  if (!jupytext) {
    const msg = `${logPrefix}Jupytext not set`
    getJConsole().appendLine(msg)
    return
  }
  if (isSupportedFile(document.uri) && document.uri.scheme === "file") {
    return await runJupytextSync(document.uri, true, logPrefix)
  }
}

export async function getFileUri(fileUri?: vscode.Uri) {
  let uri: vscode.Uri | undefined
  // Case 1: Command was called from context menu on a file
  if (fileUri && fileUri instanceof vscode.Uri) {
    uri = fileUri
  }
  // Case 2: Command was called from notebook editor
  else if (vscode.window.activeNotebookEditor) {
    uri = vscode.window.activeNotebookEditor.notebook.uri
  }
  // Case 3: Command was called from text editor
  else if (vscode.window.activeTextEditor) {
    uri = vscode.window.activeTextEditor.document.uri
  }
  // No file context available
  else {
    vscode.window.showErrorMessage("No file context available, cannot get file URI")
    uri = undefined
  }
  if (!uri) {
    return undefined
  }
  if (isUntitled(uri)) {
    getJConsole().appendLine(`Invalid URI: ${uri}`)
    return undefined
  }
  return uri
}

function getSuggestedFormats(uri: vscode.Uri): string[] {
  let ext = path.extname(uri.fsPath)
  const defaultFormats = getDefaultFormats()
  let suggestFormatsStr = defaultFormats[ext] || "default"
  ext = ext.slice(1)
  if (suggestFormatsStr === "default") {
    const notebookFormat = defaultNotebookDir ? `${defaultNotebookDir}//ipynb` : "ipynb"
    let fallback = `${notebookFormat},${ext}:percent`
    if (ext === "ipynb") {
      fallback = `${notebookFormat},py:percent`
    }
    suggestFormatsStr = defaultFormats["default"] || fallback
  }
  if (ext !== "ipynb") {
    suggestFormatsStr = suggestFormatsStr.replace("${ext}", ext)
  }
  return suggestFormatsStr ? suggestFormatsStr.split(",") : []
}

export async function setFormats(
  fileUri?: vscode.Uri,
  askFormats?: boolean,
  requireIpynbFormat: boolean = false,
  logPrefix: string = "",
): Promise<[vscode.Uri | undefined, string[] | undefined]> {
  const uri = await getFileUri(fileUri)
  if (!uri) {
    return [undefined, undefined]
  }

  let formats = getSuggestedFormats(uri)
  if (askFormats) {
    const fType = uri.fsPath.endsWith(".ipynb") ? "notebook" : "document"
    const formatsStr = await vscode.window.showInputBox({
      title: "Configure Jupytext Pairing Formats",
      prompt:
        `Define formats to pair with this ${fType}. ` +
        "This operation usually writes or modifies metadata in your paired files " +
        "(unless you use a [Jupytext config](https://jupytext.readthedocs.io/en/latest/config.html) file in your project). " +
        "Jupytext uses metadata to determine how to sync paired files. " +
        "Example: 'ipynb,py:percent'. Commas separate formats. " +
        `Formats can include subdirectories (e.g., '.jupytext-sync-ipynb//ipynb,scripts//py:percent,md'). ` +
        "This input is passed to Jupytext's '--set-formats' argument. " +
        "Syncing occurs on open/save/close based on your " +
        "[Sync Settings](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.syncDocuments%22%5D). " +
        "For common formats and more details, " +
        "refer to the [Default Formats](command:workbench.action.openSettings?%5B%22%40id%3AjupytextSync.defaultFormats%22%5D) " +
        "settings and the [Jupytext docs](https://jupytext.readthedocs.io).",
      value: formats.join(","),
    })
    // User cancelled the input box
    if (!formatsStr) {
      return [uri, undefined]
    }
    if (requireIpynbFormat) {
      if (!formatsStr.includes("ipynb")) {
        const opt = {modal: true}
        vscode.window.showErrorMessage("Notebook 'ipynb' format required.", opt)
        return [uri, undefined]
      }
    }
    formats = formatsStr.split(",")
  }

  if (formats === undefined || formats.length < 1) {
    return [uri, undefined]
  }
  await runJupytextSetFormats(uri, formats, logPrefix)
  return [uri, formats]
}

// Use this in package.json to pair documents, otherwise VSCode injects more arguments
// into setFormats' arguments.
export async function pair(fileUri?: vscode.Uri) {
  const logPrefix = makeLogPrefix("Pair")
  return await setFormats(fileUri, config().get<boolean>("askFormats.onPairDocuments", true), false, logPrefix)
}

export type PairedFormat = {extension: string; format_name?: string}
export type PairedPathAndFormat = [string, PairedFormat]

// Internal implementation - reads paired formats without queuing
// Export for use within other queued operations to avoid nested queuing
export async function readPairedPathsAndFormatsInternal(
  fileUri: vscode.Uri,
  logPrefix: string = "",
): Promise<PairedPathAndFormat[] | undefined> {
  const jupytext = getJupytext()
  if (!jupytext) {
    const msg = `${logPrefix}Jupytext not set, cannot get paired formats for ${fileUri}`
    getJConsole().appendLine(msg)
    return undefined
  }

  // Requires Jupytext 1.17.3+
  // `get_formats_from_notebook_path` returns a dictionary.
  // E.g. [{'extension': '.ipynb'}, {'format_name': 'percent', 'extension': '.py'}].
  // `paired_paths` returns a list of tuples.
  // E.g. [["./nb.ipynb", {"extension": ".ipynb"}], ["./nb.py", {"format_name": "percent", "extension": ".py"}]]
  // The Python script prints a JSON.
  const py = `import sys, json; sys.path.remove(""); from jupytext.jupytext import get_formats_from_notebook_path; from jupytext.cli import paired_paths; fp = "${fileUri.fsPath}"; fmts = get_formats_from_notebook_path(fp); print(json.dumps(paired_paths(fp, None, fmts) if fmts else []));`
  try {
    // for options affecting jupytext based on config files
    const cwd = path.dirname(fileUri.fsPath)
    // Will be empty JSON list if file has no paired formats
    const formatsStr = await runCommand([jupytext.executable, "-c", py], cwd)
    let msg = `${logPrefix}Read paired paths and formats for ${fileUri}: ${formatsStr}`
    getJConsole().appendLine(msg)
    return JSON.parse(formatsStr) as PairedPathAndFormat[]
  } catch (ex) {
    const msg = `${logPrefix}Failed to get paired paths and formats for ${fileUri}: ${ex}`
    getJConsole().appendLine(msg)
    return undefined
  }
}

function getNotebookUriFromPairedPaths(pairedPaths: PairedPathAndFormat[]): vscode.Uri | undefined {
  const notebookPath = pairedPaths.find(([path, format]) => format.extension === ".ipynb")
  return notebookPath ? vscode.Uri.file(notebookPath[0]) : undefined
}

// Wrapper to deal with the potential arguments that VS Code might be injecting.
export async function openPairedNotebookCommand(fileUri?: vscode.Uri) {
  return await openPairedNotebookWithProgress(fileUri, undefined, makeLogPrefix("openPairedNotebookCommand"))
}

export async function openPairedNotebookWithProgress(
  fileUri?: vscode.Uri,
  pairedPaths?: PairedPathAndFormat[],
  logPrefix: string = "",
) {
  const syncNotification = vscode.window.withProgress(
    {
      location: vscode.ProgressLocation.Notification,
      title: "Jupytext: ",
      cancellable: false,
    },
    async (progress) => await openPairedNotebook(fileUri, pairedPaths, progress, logPrefix),
  )
  await syncNotification
}

export async function openPairedNotebook(
  fileUri?: vscode.Uri,
  pairedPaths?: PairedPathAndFormat[] | undefined,
  progress?: vscode.Progress<{message: string; increment?: number}>,
  logPrefix: string = "",
) {
  logPrefix = logPrefix || makeLogPrefix("openPairedNotebook")
  let msg = `${logPrefix}Opening as paired notebook ${fileUri}`
  let uri = await getFileUri(fileUri)
  getJConsole().appendLine(msg)
  if (!uri) {
    msg = `Aborting, failed to get file URI for ${fileUri}`
    getJConsole().appendLine(`${logPrefix}${msg}`)
    vscode.window.showErrorMessage(msg)
    return
  }

  progress?.report({message: "Determining notebook path"})
  let notebookUri: vscode.Uri | undefined = undefined

  if (pairedPaths === undefined) {
    pairedPaths = await readPairedPathsAndFormatsInternal(uri, logPrefix)
  }
  if (pairedPaths === undefined) {
    msg = `Aborting, failed to get paired paths for ${uri}`
    getJConsole().appendLine(`${logPrefix}${msg}`)
    vscode.window.showErrorMessage(msg)
    return
  }

  notebookUri = getNotebookUriFromPairedPaths(pairedPaths)
  if (notebookUri) {
    getJConsole().appendLine(`${logPrefix}Found notebook in paired paths: ${notebookUri.fsPath}`)
  } else {
    getJConsole().appendLine(`${logPrefix}Aborting, file is not paired with a notebook: ${uri}`)
    vscode.window.showErrorMessage(
      `File is not paired with a notebook. Pair with 'ipynb' format first (e.g. 'Pair via Jupytext' button/command). ` +
        "Or, edit the Jupytext config in your project (e.g., pyproject.toml/jupytext.toml). See " +
        "[Jupytext docs](https://jupytext.readthedocs.io/en/latest/config.html) for details.",
    )
    return
  }

  const notebookExistedBefore = fs.existsSync(notebookUri.fsPath)

  // Ensure notebook file is created if needed and it is up to date
  progress?.report({message: "Syncing"})
  await runJupytextSync(uri, true, logPrefix)

  // If the notebook was created by the sync operation, mark it as auto-created
  if (!notebookExistedBefore && fs.existsSync(notebookUri.fsPath)) {
    markNotebookAsAutoCreated(notebookUri, logPrefix)
  }

  try {
    progress?.report({message: "Opening"})
    // This did not seem to work
    // await vscode.workspace.openNotebookDocument(notebookUri)
    await vscode.commands.executeCommand("vscode.openWith", notebookUri, "jupyter-notebook")
    return
  } catch (ex) {
    msg = `Failed to open notebook ${notebookUri}: ${ex}`
    getJConsole().appendLine(`${logPrefix}${msg}`)
    console.error(`${logPrefix}${msg}`, ex)
    vscode.window.showErrorMessage(msg)
    return
  }
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

export async function isJupytextPossiblyUsed(): Promise<boolean> {
  const logPrefix = makeLogPrefix("isJupytextPossiblyUsed")
  try {
    if ((await vscode.workspace.findFiles("{jupytext.toml,.jupytext}", undefined, 1)).length > 0) {
      return true
    }

    let found = false
    await vscode.workspace.findTextInFiles(
      {pattern: "jupytext"},
      {include: "{pyproject.toml,requirements.txt,environment.yml,**/*.py}", maxResults: 1},
      () => {
        found = true
      },
    )
    return found
  } catch (ex) {
    getJConsole().appendLine(`${logPrefix}Error detecting jupytext: ${ex}`)
  }
  return false
}

export async function pickJupytext(): Promise<Jupytext | undefined> {
  const msg = "Attempting to pick a python executable and Jupytext automatically"
  getJConsole().appendLine(msg)
  const sorted = sortVersions(await getAvailableVersions())
  return sorted[sorted.length - 1] ?? undefined
}
