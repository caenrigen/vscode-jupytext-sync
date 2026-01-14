    "Other"
  ],
  "extensionKind": [
    "workspace"
  ],
  "keywords": [
    "python",
    "jupyter",
  readPairedPathsAndFormatsInternal,
  makeLogPrefix,
  isJupytextPossiblyUsed,
} from "./jupytext"
import {getPythonFromConfig} from "./python"
import {PairedNotebookEditorProvider} from "./pairedNotebookEditor"
async function validatePythonAndJupytext() {
  setJupytext(undefined, false) // reset runtime jupytext
  let pythonPath = getPythonFromConfig()
  let findAutomatically = false

  if (!(await isJupytextPossiblyUsed())) {
    getJConsole().appendLine("Jupytext usage not detected. Skipping validation.")
    return
  }

  const pythonPath = getPythonFromConfig()
  let shouldAutoDiscover = false

  if (pythonPath) {
    const jupytext = await resolveJupytext(pythonPath)
    if (jupytext.executable && jupytext.jupytextVersion) {
      console.warn(msg)
      getJConsole().appendLine(msg)

      const selection = await vscode.window.showWarningMessage(msg, "Find automatically", "Open Settings")
      if (selection === "Find automatically") {
        findAutomatically = true
        shouldAutoDiscover = true
      } else if (selection === "Open Settings") {
        vscode.commands.executeCommand("workbench.action.openSettings", "jupytextSync.pythonExecutable")
      }
    }
  } else {
    shouldAutoDiscover = true
  }
  // First launch (or bad python/jupytext), try to set it automatically
  if (!pythonPath || findAutomatically) {

  if (shouldAutoDiscover) {
    await locatePythonAndJupytext()
  }
  await vscode.commands.executeCommand("setContext", "jupytextSync.supportedExtensions", getSupportedExtensions())
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
