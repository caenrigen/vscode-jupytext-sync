
import * as vscode from 'vscode';
import path from 'path';
import util from 'util';

const exec = util.promisify(require('child_process').exec);

export async function activate(context: vscode.ExtensionContext) {

	context.subscriptions.push(vscode.workspace.onDidOpenTextDocument(async event => {
		if (_isPossibleNotebookFile(event.fileName) && !event.fileName.endsWith('.ipynb')) {
			return _runSync(event.fileName);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidOpenNotebookDocument(async event => {
		if (event.uri.scheme === 'file' && _isPossibleNotebookFile(event.uri.path)) {
			return _runSync(event.uri.path);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidSaveTextDocument(async (document: vscode.TextDocument) => {
		if (_isPossibleNotebookFile(document.fileName)) {
			return _runSync(document.fileName);
		}
	}));

	context.subscriptions.push(vscode.workspace.onDidSaveNotebookDocument((document: vscode.NotebookDocument) => {
		if (document.uri.scheme === 'file' && _isPossibleNotebookFile(document.uri.path)) {
			return _runSync(document.uri.path);
		}
	}));

}

export function deactivate() { }


function _isPossibleNotebookFile(fileName: string): boolean {
	return /\.(ipynb|jl|py)$/.test(fileName);
}

async function _runSync(fileName: string) {
	const jupytextCommand = vscode.workspace.getConfiguration('jupytext-paired').get<string>('jupytextCommand', 'jupytext');
	try {
		const { stdout, stderr } = await exec(`${jupytextCommand} --sync ${fileName}`);
		console.log(stdout);
		console.error(stderr);
	} catch (error) {
		vscode.window.showErrorMessage(`Jupytext sync failed for: \`${path.basename(fileName)}\`. See output console for more info.`);
		console.error(error);
	};
}