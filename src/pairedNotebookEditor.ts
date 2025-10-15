import * as vscode from "vscode"
import {readPairedFormats, getJupytext, openPairedNotebookProgress, makeLogPrefix} from "./jupytext"
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
    const logPrefix = makeLogPrefix("PairedNotebookEditor")
    getJConsole().appendLine(`${logPrefix}Opening ${document.uri}`)

    // Check if auto-open is enabled
    const autoOpenEnabled = config().get<boolean>("autoOpenNotebook", true)
    if (!autoOpenEnabled) {
      getJConsole().appendLine(`${logPrefix}Auto-open disabled, falling back to default editor`)
      await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
      return
    }

    // Check if jupytext is available
    if (!getJupytext()) {
      getJConsole().appendLine(`${logPrefix}Jupytext not available, falling back to default editor`)
      await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
      return
    }

    // Check if the file is paired with an ipynb notebook
    try {
      const formats = await readPairedFormats(document.uri, logPrefix)

      if (formats === undefined || formats.length <= 1) {
        getJConsole().appendLine(`${logPrefix}File not paired, falling back to default editor`)
        await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
        return
      }
      // Check if one of the paired formats is ipynb
      if (!formats.some((f) => f.includes("ipynb"))) {
        getJConsole().appendLine(`${logPrefix}File is paired but not with .ipynb, falling back to default editor`)
        await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
        return
      }
      // File is paired with .ipynb, proceed to open the notebook
      getJConsole().appendLine(`${logPrefix}File is paired with .ipynb, opening notebook`)
      await this.openPairedNotebook(document, webviewPanel, formats, logPrefix)
    } catch (ex) {
      getJConsole().appendLine(`${logPrefix}Error checking paired formats: ${ex}`)
      vscode.window.showErrorMessage(`Failed to check if file is paired: ${ex}`)
      await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
    }
  }

  private async openPairedNotebook(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    formats: string[],
    logPrefix: string = "",
  ): Promise<void> {
    const uri = document.uri
    try {
      await openPairedNotebookProgress(uri, formats, logPrefix)
      getJConsole().appendLine(`${logPrefix}Successfully opened notebook ${uri}`)
      webviewPanel.dispose()
    } catch (ex) {
      getJConsole().appendLine(`${logPrefix}Failed to open notebook: ${ex}`)
      vscode.window.showErrorMessage(`Failed to open paired notebook: ${ex}`)
      await this.fallbackToDefaultEditor(document, webviewPanel, logPrefix)
    }
  }

  private async fallbackToDefaultEditor(
    document: vscode.TextDocument,
    webviewPanel: vscode.WebviewPanel,
    logPrefix: string = "",
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
        const msg = `${logPrefix}Error during disposal (ignored): ${ex}`
        console.error(msg, ex)
        getJConsole().appendLine(msg)
      }

      try {
        // Open with default text editor - we need to explicitly specify the
        // "default" editor to avoid VS Code opening with our custom editor again
        await vscode.commands.executeCommand("vscode.openWith", document.uri, "default")
        getJConsole().appendLine(`${logPrefix}Opened ${document.uri} with default editor`)
      } catch (ex) {
        const msg = `Error opening default editor for ${document.uri}: ${ex}`
        console.error(`${logPrefix}${msg}`, ex)
        getJConsole().appendLine(`${logPrefix}${msg}`)
        vscode.window.showErrorMessage(msg)
      }
    })
  }
}
