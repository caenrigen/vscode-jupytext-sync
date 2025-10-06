# Change Log

## 1.1.11 2025-19-06

-   Disable the compact layout suggestion pop up. This feature will eventually moved into a separate extension. The command can still be invoked from the command palette.

## 1.1.10 2025-08-14

-   Rename `extraSetFormatsArgs`/`extraSyncArgs` to `setFormatsArgs`/`syncArgs`
-   This change allows arbitrary user-defined arguments order

## 1.1.9 2025-08-14

-   Add settings to pass extra CLI arguments to Jupytext commands:
    -   `jupytextSync.extraSyncArgs` for `jupytext --sync` (e.g., `--use-source-timestamp`)
    -   `jupytextSync.extraSetFormatsArgs` for `jupytext --set-formats`
-   Logs now print an abbreviated executed `jupytext` command for easier troubleshooting

## 1.1.8 2025-08-11

-   Enhance logs with timestamps and sync ID

## 1.1.7 2025-07-20

-   Add support for `${workspaceFolder}` in `pythonExecutable`

## 1.1.6 2025-07-19

-   Prevent concurrency for `jupytext --sync` commands on the same file

## 1.1.5 2025-07-10

-   Change compact layout to "suggested" (instead of "recommended")

## 1.1.4 2025-05-21

-   Fix: don't sync files that have not been paired before

## 1.1.3 2025-05-09

-   Made the notebook toolbar visible for users that activate the compact mode
-   Removed dummy files from the build

## 1.1.1 2025-06-08

-   Automatically discover suitable Python and Jupytext
-   Open as paired notebook command
-   Fix: jupytext config files should now be picked up correctly by jupytext

## 1.0.0 2025-05-06

Initial release.

-   Core Jupytext pairing and synchronization functionality.
-   Automatic sync on open/save/close (configurable).
-   Commands for pairing, raw cell manipulation.
-   Optional compact notebook layout command.
