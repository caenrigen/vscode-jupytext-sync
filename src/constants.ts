import * as vscode from "vscode"

export const defaultNotebookDir = ".jupytext-sync-ipynb"

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
