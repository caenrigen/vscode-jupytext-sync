# Jupytext Sync: Pair and Auto Sync Jupyter Notebooks via Jupytext in VSCode

[![Screenshot](https://raw.githubusercontent.com/caenrigen/vscode-jupytext-sync/main/screenshot.jpg)](https://github.com/caenrigen/vscode-jupytext-sync/)

This VSCode extension is a wrapper around the Jupytext Python command-line interface, designed to bring a smoother Jupyter Notebook experience to VSCode, especially for users familiar with JupyterLab or the classic Jupyter Notebook interface. It aims to address common pain points and streamline the workflow when working with Jupytext-paired notebooks in VSCode-based IDEs.

The core motivation behind this extension is to bridge the gap between VSCode's powerful editing features and Jupytext's ability to keep notebooks in version-control-friendly text formats. While VSCode offers a notebook interface, it doesn't natively integrate with Jupytext's pairing and synchronization features. This extension provides that missing functionality, along with a few more convenience tools.

## Installation

You can install this extensions by searching for "Jupytext Sync" in the Extensions Marketplace within the IDE.

Alternatively, you can install it directly by downloading the `.vsix` file from the release page on the GitHub and drag-and-drop it in your VSCode-based IDE. This has the downside that you will not be notified about available updates.

## Features

This extension solves several common annoyances and provides handy features for a better Jupyter Notebook experience in VSCode:

-   **Automatic Synchronization**:
    -   Automatically syncs paired files (`.ipynb` and text-based formats like `.py`, `.md`) when you open, save, or close them. This ensures that your notebook and its text representation are always in sync.
    -   Configuration options allow you to customize which events trigger a sync (on open, on save, on close for both text documents and notebook documents).
-   **Persistent Cell Outputs**: All files are saved to disk, meaning cell outputs are not lost when reopening a notebook, providing a more consistent experience.
-   **Convenient Pairing Command**: The "Pair via Jupytext" command is accessible from multiple convenient locations:
    -   Command Palette (Ctrl+Shift+P or Cmd+Shift+P)
    -   File Explorer context menu (right-click on a file)
    -   Editor context menu (right-click inside the editor or on the editor tab)
    -   Icons in the editor and notebook toolbars.
-   **Broad File Support**: Supports all file extensions and formats recognized by your `jupytext` installation. The extension dynamically fetches the supported formats from `jupytext`.
-   **Raw Cells Support in Notebooks**:
    -   Easily insert new raw cells via buttons in Notebook editor toolbar or keyboard shortcuts.
    -   Toggle cells to raw format and back to default code. Keyboard shortcuts available.
-   **Compact Notebook Layout**: An optional command to apply recommended VSCode settings for a more compact and user-friendly notebook layout, similar to traditional Jupyter interfaces.
-   **Python Interpreter Flexibility**:
    -   Uses the Python interpreter configured in the [MS Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python) by default.
    -   Allows to configure a custom Python executable path for `jupytext` if needed.

## Recommended Workflow

1.  **Pair your Notebook**:
    -   Open an `.ipynb` file or a text file (e.g., `myscript.py`, `mymarkdown.md`) that you want to use as a notebook.
    -   Use the "Pair via Jupytext" command (accessible from the Command Palette, context menus, or toolbars).
    -   You'll be prompted to choose the Jupytext formats (e.g., `ipynb,py:percent`). The default suggestion is configurable per file extension.
2.  **Work in the Notebook**: Primarily work within the `.ipynb` notebook interface in VSCode. The extension will automatically keep the paired text file in sync upon saving.
3.  **Version Control**:
    -   Commit the text-based file (e.g., `.py`, `.md`) to your Git repository. This file is human-readable and diff-friendly.
    -   Optionally, you can also commit the `.ipynb` file if you prefer to version control the outputs too.
4.  **Pre-commit Hook (Recommended)**: To ensure your paired files are always synchronized before committing, it's highly recommended to use the `jupytext` pre-commit hook. This prevents accidental commits of unsynced files.

    Refer to the [Jupytext documentation on pre-commit hooks](https://jupytext.readthedocs.io/en/latest/using-pre-commit.html) for detailed configuration.

## Configuration

### Extension Settings

You can configure the extension's behavior via VSCode settings, search for `jupytextSync`:

-   `jupytextSync.pythonExecutable`: Path to the Python executable for Jupytext. Defaults to the interpreter selected by the [MS Python extension](https://marketplace.visualstudio.com/items?itemName=ms-python.python).
-   `jupytextSync.syncDocuments`: Control on which events (open, save, close) to sync documents.
-   `jupytextSync.defaultFormats`: Define default pairing formats suggestion per file extension.
-   `jupytextSync.enabledMenus`: Enable or disable Jupytext commands in different VSCode UI locations (explorer, editor context menus, toolbars).

### Jupytext Behavior

To configure Jupytext's own behavior (e.g., metadata filters, default formats), consult the official Jupytext documentation on [configuring Jupytext via `pyproject.toml` or `jupytext.toml` files](https://jupytext.readthedocs.io/en/latest/config.html).

For example, to avoid noisy metadata in your text notebooks, you might add this to your `pyproject.toml`:

```toml
[tool.jupytext]
notebook_metadata_filter = "-kernelspec,-jupytext.text_representation.jupytext_version"
cell_metadata_filter = "-all"
```

## Acknowledgements

This extension was inspired by and builds upon the ideas from the following projects:

-   [marius311/jupytext-paired-vscode](https://github.com/marius311/jupytext-paired-vscode)
-   [parmentelat/vscode-jupytext](https://github.com/parmentelat/vscode-jupytext)
    -   itself a soft fork of [notebookPowerTools/vscode-jupytext](https://github.com/notebookPowerTools/vscode-jupytext)
    -   with fixes from [congyiwu/vscode-jupytext](https://github.com/congyiwu/vscode-jupytext)

## Related Projects

-   [fmilanese-1/ds_utils](https://github.com/fmilanese-1/ds_utils): A VSCode extension that has some `jupytext`-based capabilities and supports exporting notebooks to HTML via `nbconvert`, but does not include automatic synchronization of paired files.
