import * as vscode from "vscode"
import {readPairedFormats, getJupytext, openPairedNotebookProgress} from "./jupytext"
import {getJConsole, config} from "./constants"

/**
 * Custom text editor provider that automatically opens paired notebooks
 * when a text file (e.g., .py, .md) is opened and it's paired with a .ipynb file.
 */
export class PairedNotebookEditorProvider implements vscode.CustomTextEditorProvider {
    public static register(context: vscode.ExtensionContext): vscode.Disposable {
        const provider = new PairedNotebookEditorProvider()
        const providerRegistration = vscode.window.registerCustomEditorProvider(
            "jupytextSync.pairedNotebookEditor",
            provider,
            {
                webviewOptions: {
                    retainContextWhenHidden: true, // did not seem relevant
                },
                supportsMultipleEditorsPerDocument: false,
            },
        )
        return providerRegistration
    }

    async resolveCustomTextEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        _token: vscode.CancellationToken,
    ): Promise<void> {
        getJConsole().appendLine(`PairedNotebookEditor: Opening ${document.uri}`)
        
        // Check if auto-open is enabled
        const autoOpenEnabled = config().get<boolean>("autoOpenNotebook", true)
        if (!autoOpenEnabled) {
            getJConsole().appendLine(`PairedNotebookEditor: Auto-open disabled, falling back to default editor`)
            await this.fallbackToDefaultEditor(document, webviewPanel)
            return
        }
        
        // Check if jupytext is available
        if (!getJupytext()) {
            getJConsole().appendLine(`PairedNotebookEditor: Jupytext not available, falling back to default editor`)
            await this.fallbackToDefaultEditor(document, webviewPanel)
            return
        }

        // Check if the file is paired with an ipynb notebook
        try {
            const formats = await readPairedFormats(document.uri)

            if (formats === undefined || formats.length <= 1) {
                getJConsole().appendLine(`PairedNotebookEditor: File not paired, falling back to default editor`)
                await this.fallbackToDefaultEditor(document, webviewPanel)
                return
            }
            // Check if one of the paired formats is ipynb
            if (!formats.some((f) => f.includes("ipynb"))) {
                getJConsole().appendLine(
                    `PairedNotebookEditor: File is paired but not with .ipynb, falling back to default editor`,
                )
                await this.fallbackToDefaultEditor(document, webviewPanel)
                return
            }
            // File is paired with .ipynb, proceed to open the notebook
            getJConsole().appendLine(`PairedNotebookEditor: File is paired with .ipynb, opening notebook`)
            await this.openPairedNotebook(document, webviewPanel, formats)
        } catch (ex) {
            getJConsole().appendLine(`PairedNotebookEditor: Error checking paired formats: ${ex}`)
            vscode.window.showErrorMessage(`Failed to check if file is paired: ${ex}`)
            await this.fallbackToDefaultEditor(document, webviewPanel)
        }
    }

    private async openPairedNotebook(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
        formats: string[],
    ): Promise<void> {
        const uri = document.uri
        try {
            await openPairedNotebookProgress(uri, formats)
            getJConsole().appendLine(`PairedNotebookEditor: Successfully opened notebook ${uri}`)
            webviewPanel.dispose()
        } catch (ex) {
            getJConsole().appendLine(`PairedNotebookEditor: Failed to open notebook: ${ex}`)
            vscode.window.showErrorMessage(`Failed to open paired notebook: ${ex}`)
            // Fall back to default editor on error
            await this.fallbackToDefaultEditor(document, webviewPanel)
        }
    }

    private async fallbackToDefaultEditor(
        document: vscode.TextDocument,
        webviewPanel: vscode.WebviewPanel,
    ): Promise<void> {
        // Immediately dispose the webview to avoid any manipulation errors
        // We use setImmediate to ensure VS Code has time to finish initializing the webview
        setImmediate(async () => {
            try {
                if (!webviewPanel.visible) {
                    return // Webview was already closed/disposed
                }
                webviewPanel.dispose()
            } catch (ex) {
                // Ignore disposal errors
                const msg = `PairedNotebookEditor: Error during disposal (ignored)`
                console.error(msg, ex)
                getJConsole().appendLine(msg+ ": " + ex)
            }

            try {
                // Open with default text editor - we need to explicitly specify the 
                // "default" editor to avoid VS Code opening with our custom editor again
                await vscode.commands.executeCommand("vscode.openWith", document.uri, "default")
                getJConsole().appendLine(`PairedNotebookEditor: Opened ${document.uri} with default editor`)
            } catch (ex) {
                const msg = `PairedNotebookEditor: Error opening default editor`
                console.error(msg, ex)
                getJConsole().appendLine(msg+ ": " + ex)
            }
        })
    }
}
