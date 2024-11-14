# Jupytext Paired Notebooks Extension for VSCode

An extension to handle paired Jupytext notebook files. 

A command `Jupytext: Pair current notebook with script(s)` is provided to pair the current active notebook with one or more script files. The extension suggests a pairing based on the kernel language and default format chosen in the settings, but anything that `jupytext --set-formats` accepts can be chosen. 

Opening and saving paired notebook files or their script counterparts will automatically run a `jupytext --sync`, keeping files up to do date with each other. 

The `jupytext` command must be available in the user $PATH or set in the extension settings.

Does not currently support opening a script file "as a notebook".

## Extension Settings

This extension contributes the following settings:

* `jupytext-paired:jupytextCommand`: The command which runs the Jupytext CLI. Can be an absolute path or a command available in the user $PATH (default: `jupytext`).

* `jupytext-paired:defaultFormat`: The default script format to suggest when pairing a notebook, e.g. `light`, `percent`, `markdown`, etc... (default: `light`).

## Release Notes

### 1.0.0

Initial release.