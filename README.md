# Jupytext Paired Notebooks Extension for VSCode

An extension to handle paired Jupytext notebook files. Opening and saving paired notebook files or scripts will automatically run a `jupytext --sync`, keeping files up to do date with each other. 

The `jupytext` command must be available in the user $PATH or set in the extension settings.

Does not currently support initial pairing of files, that should be done externally, e.g. with the Jupytext CLI:

```bash
jupytext --set-formats ipynb,py:percent notebook.ipynb
```

Does not currently support opening a script file "as a notebook".

## Extension Settings

This extension contributes the following settings:

* `jupytext-paired:jupytextCommand`: The command which runs the Jupytext CLI. Can be an absolute path or a command available in the user $PATH (default `jupytext`).

## Release Notes

### 1.0.0

Initial release.