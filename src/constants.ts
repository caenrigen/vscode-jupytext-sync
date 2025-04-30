import * as vscode from "vscode"

export function config(): vscode.WorkspaceConfiguration {
    return vscode.workspace.getConfiguration("jupytextSync")
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
