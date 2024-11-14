
import * as vscode from 'vscode';
import path from 'path';
import util from 'util';
import { EXTENSION_FORMATS } from './languages';

const exec = util.promisify(require('child_process').exec);

let jupytextConsole: vscode.OutputChannel;

export async function activate(context: vscode.ExtensionContext) {

    jupytextConsole = vscode.window.createOutputChannel("Jupytext");

    context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async event => {
        if (_isPossibleNotebookFile(event.fileName) && !event.fileName.endsWith('.ipynb')) {
            return _run_jupytext_sync(event.fileName);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(async event => {
        if (event.uri.scheme === 'file' && _isPossibleNotebookFile(event.uri.path)) {
            return _run_jupytext_sync(event.uri.path);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
        if (_isPossibleNotebookFile(document.fileName)) {
            return _run_jupytext_sync(document.fileName);
        }
    }));

    context.subscriptions.push(vscode.workspace.onDidSaveNotebookDocument((document: vscode.NotebookDocument) => {
        if (document.uri.scheme === 'file' && _isPossibleNotebookFile(document.uri.path)) {
            return _run_jupytext_sync(document.uri.path);
        }
    }));

    context.subscriptions.push(vscode.commands.registerTextEditorCommand('jupytext-paired.pairFile', async (textEditor: vscode.TextEditor, edit: vscode.TextEditorEdit) => {

        const activeNotebookEditor = vscode.window.activeNotebookEditor;
        if (!activeNotebookEditor) { return }

        if (activeNotebookEditor.notebook.isUntitled) {
            // triggering a save on an untitled notebook via the API
            // closes it after saving, so just make the user do it
            // (which automatically reopens it via some magic code
            // somewhere I don't know how to replicate)
            vscode.window.showInformationMessage("Please save the notebook before pairing.")
            return
        }

        // for a non-untitled notebook, doing a save is fine
        await activeNotebookEditor.notebook.save();

        // use the kernel language to determine a default for the script file extension
        const language = activeNotebookEditor.notebook.metadata.metadata.kernelspec?.language; 
        const scriptExt = Object.keys(EXTENSION_FORMATS)[Object.values(EXTENSION_FORMATS).indexOf(language)];
        const defaultFormat = vscode.workspace.getConfiguration('jupytext-paired').get<string>('defaultFormat', 'light');
        const defaultPairings = scriptExt ? `${scriptExt}:${defaultFormat}` : '';
        
        const formats = await vscode.window.showInputBox({
            prompt: `Enter script formats to pair together with the current notebook (see --set-formats in Jupytext docs)`,
            value: defaultPairings
        })
        if (formats) {
            const fileName = textEditor.document.fileName;
            _run_jupytext(`--set-formats ipynb,${formats} ${fileName}`);
        }
    }));
}

export function deactivate() { 
    jupytextConsole.dispose();	
}

function _isPossibleNotebookFile(fileName: string): boolean {
    const ext = path.extname(fileName).slice(1);
    return Object.keys(EXTENSION_FORMATS).includes(ext);
}

async function _run_jupytext_sync(fileName: string) {
    return _run_jupytext(`--sync ${fileName}`);
}

async function _run_jupytext(args: string) {
    const jupytext = vscode.workspace.getConfiguration('jupytext-paired').get<string>('jupytextCommand', 'jupytext');
    const cmd = `${jupytext} ${args}`
    try {
        const { stdout, stderr } = await exec(cmd);
        jupytextConsole.appendLine(stdout);
        jupytextConsole.appendLine(stderr);
    } catch (error) {
        jupytextConsole.appendLine(String(error));
        const selection = await vscode.window.showErrorMessage(`Calling \`${cmd}\` failed.`, "Show Output");
        if (selection === "Show Output") {
            jupytextConsole.show();
        }
    };
}