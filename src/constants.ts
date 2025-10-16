import * as vscode from "vscode"

// Disabled for now. See https://github.com/caenrigen/vscode-jupytext-sync/issues/20
// export const defaultNotebookDir = ".jupytext-sync-ipynb"
export const defaultNotebookDir = ""

export function config(section?: string): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration(section ?? "jupytextSync")
}

export async function setConfig(
  section: string,
  value: any,
  target: vscode.ConfigurationTarget = vscode.ConfigurationTarget.Global,
): Promise<boolean> {
  try {
    await vscode.workspace.getConfiguration().update(section, value, target)
    return true
  } catch (error) {
    const msg = `Failed to update '${section}' config with value='${value}'`
    console.error(msg, error)
    vscode.window.showErrorMessage(msg)
    return false
  }
}

let jConsole: vscode.OutputChannel

function createOutputChannel(name: string) {
  return vscode.window.createOutputChannel(name)
}

export function getJConsole() {
  if (!jConsole) {
    jConsole = createOutputChannel("Jupytext")
  }
  return jConsole
}

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
