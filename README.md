# Jupytext Sync: Pair and Auto Sync Jupyter Notebooks via Jupytext in VSCode

[![Screenshot](https://raw.githubusercontent.com/caenrigen/vscode-jupytext-sync/main/screenshot.jpg)](https://github.com/caenrigen/vscode-jupytext-sync/)

This VSCode extension is a wrapper around the Jupytext Python command-line interface, designed to bring a smoother Jupyter Notebook experience to VSCode, especially for users familiar with JupyterLab or the classic Jupyter Notebook interface. It aims to address common pain points and streamline the workflow when working with Jupytext-paired notebooks in VSCode-based IDEs.

The core motivation behind this extension is to bridge the gap between VSCode's powerful editing features and Jupytext's ability to keep notebooks in version-control-friendly text formats. While VSCode offers a notebook interface, it doesn't natively integrate with Jupytext's pairing and synchronization features. This extension provides that missing functionality, along with a few more convenience tools.

## Installation

You can install this extensions by searching for "Jupytext Sync" in the Extensions Marketplace within the IDE.

The extention is available on both [Microsoft VSCode Marketplace](https://marketplace.visualstudio.com/items?itemName=caenrigen.jupytext-sync) and on the [Open VSX Registry](https://open-vsx.org/extension/caenrigen/jupytext-sync) in case you are using an alternative VSCode-based IDE like [VSCodium](https://vscodium.com).

Alternatively, you can install it directly by downloading the `.vsix` file from the release page on the GitHub and drag-and-drop it in your VSCode-based IDE. This has the downside that you will not be notified about available updates.

The extension activates when VS Code has finished starting up (`onStartupFinished`), so it should be available shortly after launch.

## Requirements

-   **Python**: You need a Python installation.
-   **Jupytext**: The `jupytext` Python package must be installed in the Python environment used by the extension.
-   **VS Code Microsoft Python Extension (Recommended)**: For the best experience with automatic Python environment detection, it is recommended to have the Microsoft Python extension installed ([open in VSCode](vscode:extension/ms-python.python) / [open on marketplace](https://marketplace.visualstudio.com/items?itemName=ms-python.python)).

## Features

This extension solves several common annoyances and provides handy features for a better Jupyter Notebook experience in VSCode:

-   **Automatic Synchronization**:
    -   Automatically syncs paired files (`.ipynb` and text-based formats like `.py`, `.md`) when you open, save, or close them. This ensures that your notebook and its text representation are always in sync.
    -   Configuration options allow you to customize which events trigger a sync (on open, on save, on close for both text documents and notebook documents). See the `jupytextSync.syncDocuments` setting for details.
-   **Open Text Files as Notebooks**:
    -   Open Jupytext-compatible text files (e.g., `.py`, `.md` with Jupytext metadata) as notebooks using the "**Open as paired Notebook via Jupytext**" command. A notebook file will be created and all your edits in it will be synced to the text file(s).
-   **Persistent Cell Outputs**: All files are saved to disk, meaning cell outputs are not lost when reopening a notebook, providing a more consistent experience.
-   **Convenient Pairing Command**: The "**Pair via Jupytext**" command is accessible from multiple convenient locations:
    -   Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
    -   File Explorer context menu (right-click on a file)
    -   Editor context menu (right-click inside the editor or on the editor tab)
    -   Icons in the editor and notebook toolbars.
-   **Broad File Support**: Supports all file extensions and formats recognized by your `jupytext` installation. The extension dynamically fetches the supported formats from `jupytext`. The `jupytextSync.defaultFormats` setting allows you to pre-configure default pairing strings for various extensions.
-   **Raw Cells Support in Notebooks**:
    -   Easily insert new raw cells via buttons in Notebook editor toolbar or keyboard shortcuts.
    -   Toggle cells to raw format and back to default code. Keyboard shortcuts available.
-   **Compact Notebook Layout**: An optional command to apply recommended VSCode settings for a more compact and user-friendly notebook layout, similar to traditional Jupyter interfaces.
-   **Python Interpreter Flexibility**:
    -   Attempts are made to automatically discover Python executables that are able to invoke Jupytext. If the Microsoft Python extension is installed ([open in VSCode](vscode:extension/ms-python.python) / [open on marketplace](https://marketplace.visualstudio.com/items?itemName=ms-python.python)), its selected interpreter and other discovered environments (e.g., `venv`, `conda`) are considered.
    -   Allows you to configure a custom Python executable path for `jupytext` if needed (via the `jupytextSync.pythonExecutable` setting).
    -   You can check the extension logs ("**Jupytext: Show Jupytext Sync Logs**" command) to see which Python environment is being used.

## Recommended Workflow

1.  **Pair your Notebook**:
    -   Open an `.ipynb` file or a text file (e.g., `myscript.py`, `mymarkdown.md`) that you want to use as a notebook.
    -   Use the "**Pair via Jupytext**" command (accessible from the Command Palette, context menus, or toolbars).
    -   You'll be prompted to choose the Jupytext formats (e.g., `ipynb,py:percent`) unless disabled via `jupytextSync.askFormats.onPairDocuments`. The default suggestion is configurable per file extension using `jupytextSync.defaultFormats`.
2.  **Work in the Notebook or Text File**:
    -   Primarily work within the `.ipynb` notebook interface in VSCode. The extension will automatically keep the paired text file in sync upon saving (or other configured events).
    -   Alternatively, open your Jupytext-compatible text file using the "**Open as paired Notebook via Jupytext**" command and work directly in the notebook interface.
3.  **Version Control**:
    -   Commit the text-based file (e.g., `.py`, `.md`) to your Git repository. This file is human-readable and diff-friendly.
    -   Optionally, you can also commit the `.ipynb` file if you prefer to version control the outputs too.
4.  **Pre-commit Hook (Recommended)**: To ensure your paired files are always synchronized before committing, it's highly recommended to use the `jupytext` pre-commit hook. This prevents accidental commits of unsynced files.

    Refer to the [Jupytext documentation on pre-commit hooks](https://jupytext.readthedocs.io/en/latest/using-pre-commit.html) for detailed configuration.

## Configuration

### Extension Settings

You can configure the extension's behavior via VSCode settings (search for `jupytextSync` in the Settings UI or edit your `settings.json`):

-   **`jupytextSync.pythonExecutable`**:

    -   **Description**: The path to the Python executable used to invoke `jupytext`.
    -   **Details**: Jupytext Sync requires a Python executable with the `jupytext` package installed.
        -   _Automatic discovery_: If not specified, the extension attempts to find a suitable Python executable. If the Microsoft Python extension is installed, its selected interpreter and other known environments are checked. Otherwise, it looks for `python` and `python3` in your system PATH. The one providing the highest `jupytext` version is preferred.
        -   _Manual override_: Specify an absolute path or a command (e.g., `python3`). If using a command, ensure your VS Code instance inherits the correct PATH (launching from an activated terminal might be necessary for virtual environments).
    -   **Tip**: Use the "**Jupytext: Show Jupytext Sync Logs**" command to verify which Python executable is being used.
    -   **Default**: `""` (empty string, for automatic discovery)

-   **`jupytextSync.syncDocuments`**:

    -   **Description**: Controls on which events to attempt to `jupytext --sync` previously paired documents. This applies even if pairing was done externally.
    -   **Properties**:
        -   `onNotebookDocumentOpen` (boolean): Sync when opening a notebook document.
        -   `onNotebookDocumentSave` (boolean): Sync when saving a notebook document. (Default: `true`)
        -   `onNotebookDocumentClose` (boolean): Sync when closing a notebook document.
        -   `onTextDocumentOpen` (boolean): Sync when opening a supported text document.
        -   `onTextDocumentSave` (boolean): Sync when saving a supported text document. (Default: `true`)
        -   `onTextDocumentClose` (boolean): Sync when closing a supported text document.
    -   **Default**: See individual property defaults above.

-   **`jupytextSync.askFormats`**:

    -   **Description**: Controls whether to ask for pairing file formats before executing commands that may require pairing. If `false`, `jupytextSync.defaultFormats` are used.
    -   **Properties**:
        -   `onOpenPairedNotebook` (boolean): Ask for formats before opening a text document as a paired notebook. (Default: `false`)
        -   `onPairDocuments` (boolean): Ask for formats before pairing documents. (Default: `true`)

-   **`jupytextSync.defaultFormats`**:

    -   **Description**: Define default Jupytext pairing formats (e.g., `ipynb,py:percent`) used as suggestions or defaults.
    -   **Syntax**: Uses Jupytext's `--set-formats` string.
        -   `${ext}` can be used as a placeholder for the file extension (without the leading dot).
        -   `default` key: An extension set to `"default"` in the configuration will inherit the format string from this key.
        -   Subdirectories: Prefix with `dir_name//` (e.g., `notebooks//ipynb,scripts//py:percent`). Paths are relative to the source file's parent directory.
    -   **Activation**: Applies to file extensions recognized by your installed `jupytext`.
    -   **Example Default Entry**: `"default": ".jupytext-sync-ipynb//ipynb,${ext}:percent"`

-   **`jupytextSync.enabledMenus`**:
    -   **Description**: Enable or disable Jupytext menus and buttons in various VS Code UI locations.
    -   **Properties** (all boolean, default `true`):
        -   `explorerContext`: "Pair via Jupytext" in Explorer context menu.
        -   `editorContext`: "Pair via Jupytext" in Editor context menu.
        -   `editorTitle`: "Pair via Jupytext" button in Editor title bar.
        -   `editorTitleContext`: "Pair via Jupytext" in Editor title context menu.
        -   `notebookToolbar`: "Pair via Jupytext" button in Notebook toolbar.
        -   `notebookToolbarInsertRaw`: "Insert Raw Cell" button in Notebook toolbar.
        -   `notebookToolbarToRaw`: "Toggle Raw/Code Cell" button in Notebook toolbar.

### Jupytext Behavior

To configure Jupytext's own behavior (e.g., metadata filters, default formats), consult the official Jupytext documentation on [configuring Jupytext via `pyproject.toml` or `jupytext.toml` files](https://jupytext.readthedocs.io/en/latest/config.html).

For example, to avoid noisy metadata in your text notebooks, you might add this to your `pyproject.toml`:

```toml
[tool.jupytext]
notebook_metadata_filter = "-kernelspec,-jupytext.text_representation.jupytext_version"
cell_metadata_filter = "-all"
```

## Commands

This extension provides the following commands, accessible via the Command Palette (Ctrl+Shift+P or Cmd+Shift+P) under the "Jupytext" category:

-   **`Jupytext: Show Jupytext Sync Logs`**: Opens the output channel for Jupytext Sync, showing logs which can be helpful for troubleshooting, especially for Python executable discovery.
-   **`Jupytext: Pair via Jupytext`**: Initiates the pairing process for the active file or a file selected from the Explorer. Prompts for Jupytext formats based on `jupytextSync.askFormats.onPairDocuments` and `jupytextSync.defaultFormats`.
-   **`Jupytext: Open as paired Notebook via Jupytext`**: Opens a Jupytext-compatible text file (e.g., `.py`, `.md`) as a VS Code notebook. This is a key feature for working with text-based versions of notebooks.
-   **`Jupytext: Insert Raw Code Cell Below and Focus Container`**: Inserts a new raw cell below the active cell in a notebook.
-   **`Jupytext: Insert Raw Code Cell Above and Focus Container`**: Inserts a new raw cell above the active cell in a notebook.
-   **`Jupytext: Change Cell to default Code`**: Changes the selected notebook cell(s) to the default code type.
-   **`Jupytext: Change Cell to Raw Code`**: Changes the selected notebook cell(s) to raw format.
-   **`Jupytext: Toggle Cell between Raw Code and default Code`**: Toggles the selected notebook cell(s) between raw and default code formats.
-   **`Jupytext: Set Recommended Compact Notebook Layout`**: Applies a set of VS Code settings to achieve a more compact notebook UI.

## Default Keybindings

The following keybindings are available when a notebook editor is focused and you are not currently typing in a cell input or output area:

-   **`y`**: `Jupytext: Change Cell to default Code`
-   **`r`**: `Jupytext: Toggle Cell between Raw Code and default Code`
-   **`t`**: `Jupytext: Insert Raw Code Cell Below and Focus Container`
-   **`e`**: `Jupytext: Insert Raw Code Cell Above and Focus Container`
-   **`i i`** (press `i` twice): `jupyter.interruptkernel` (VS Code built-in)
-   **`0 0`** (press `0` twice): `jupyter.restartkernel` (VS Code built-in)

## Acknowledgements

This extension was inspired by and builds upon the ideas from the following projects:

-   [marius311/jupytext-paired-vscode](https://github.com/marius311/jupytext-paired-vscode)
-   [parmentelat/vscode-jupytext](https://github.com/parmentelat/vscode-jupytext)
    -   itself a soft fork of [notebookPowerTools/vscode-jupytext](https://github.com/notebookPowerTools/vscode-jupytext)
    -   with fixes from [congyiwu/vscode-jupytext](https://github.com/congyiwu/vscode-jupytext)

## Related Projects

-   [fmilanese-1/ds_utils](https://github.com/fmilanese-1/ds_utils): A VSCode extension that has some `jupytext`-based capabilities and supports exporting notebooks to HTML via `nbconvert`, but does not include automatic synchronization of paired files.
