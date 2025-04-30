// Inspired from https://github.com/parmentelat/vscode-jupytext
import {spawn} from "child_process"
import {extensions, Uri, window, commands} from "vscode"
import {getJConsole, config} from "./constants"

type Resource = Uri | undefined
type IPythonExtensionApi = {
    /**
     * Return internal settings within the extension which are stored in VSCode storage
     */
    settings: {
        /**
         * Returns all the details the consumer needs to execute code within the selected environment,
         * corresponding to the specified resource taking into account any workspace-specific settings
         * for the workspace to which this resource belongs.
         * @param {Resource} [resource] A resource for which the setting is asked for.
         * * When no resource is provided, the setting scoped to the first workspace folder is returned.
         * * If no folder is present, it returns the global setting.
         * @returns {({ execCommand: string[] | undefined })}
         */
        getExecutionDetails(resource?: Resource): {
            /**
             * E.g of execution commands returned could be,
             * * `['<path to the interpreter set in settings>']`
             * * `['<path to the interpreter selected by the extension when setting is not set>']`
             * * `['conda', 'run', 'python']` which is used to run from within Conda environments.
             * or something similar for some other Python environments.
             *
             * @type {(string[] | undefined)} When return value is `undefined`, it means no interpreter is set.
             * Otherwise, join the items returned using space to construct the full execution command.
             */
            execCommand: string[] | undefined
        }
    }
}

let pythonExecutable: string | undefined = undefined

export function getPythonExecutable(): string | undefined {
    return pythonExecutable
}

export async function runPython(cmdArgs: string[]): Promise<string> {
    if (pythonExecutable === undefined) {
        const msg = "Cannot run Python command. Python binary not found."
        console.debug(msg)
        getJConsole().appendLine(msg)
        return ""
    }
    cmdArgs = [pythonExecutable].concat(cmdArgs)
    return runCommand(cmdArgs)
}

export async function locatePython(): Promise<boolean> {
    const pythonUserConf = getPythonFromUserConfig().catch(() => undefined)
    const pythonExt = getPythonFromMSPythonExt().catch(() => undefined)

    const [extSupported, userConfSupported] = await Promise.all([pythonExt, pythonUserConf])
    if (userConfSupported) {
        pythonExecutable = userConfSupported
        const userPython = config().get<string>("pythonExecutable")
        const msg = `Using user-configured ${userPython} (${pythonExecutable})`
        console.debug(msg)
        getJConsole().appendLine(msg)
        return true
    }
    if (extSupported) {
        pythonExecutable = extSupported
        const msg = `Using python executable as configured for 'ms-python.python' extension: ${pythonExecutable}`
        console.debug(msg)
        getJConsole().appendLine(msg)
        return true
    }
    return false
}

async function getPythonFromMSPythonExt(): Promise<string | undefined> {
    const pyExt = extensions.getExtension<IPythonExtensionApi>("ms-python.python")
    if (!pyExt) {
        return undefined
    }
    if (!pyExt.isActive) {
        try {
            await pyExt.activate()
        } catch (ex) {
            console.error(`Failed to activate Python Extension`, ex)
            return undefined
        }
    }
    const cli = pyExt.exports.settings.getExecutionDetails(undefined)
    if (!cli.execCommand) {
        return undefined
    }
    const python = await resolvePythonExecutable(cli.execCommand)
    getJConsole().appendLine(`Python '${cli.execCommand}' from 'ms-python.python' extension resolved to: ${python}`)
    return python
}

async function getPythonFromUserConfig(): Promise<string | undefined> {
    const pythonExecutable = config().get<string>("pythonExecutable")
    if (!pythonExecutable) {
        return undefined
    }
    const python = await resolvePythonExecutable([pythonExecutable])
    getJConsole().appendLine(`Python '${pythonExecutable}' from user config resolved to: ${python}`)
    return python
}

async function resolvePythonExecutable(command: string[]): Promise<string | undefined> {
    const cmdArgs = command.concat("-c", "import sys; print(sys.executable)")
    try {
        const output = (await runCommand(cmdArgs)).trim()
        return !output ? undefined : output
    } catch (ex) {
        console.debug(`Failed to check python with '${cmdArgs}'`, ex)
    }
    return undefined
}

function normalizeCmdArgs(cmdArgs: string[]) {
    return cmdArgs.map((item) => item.replace(/\\/g, "/"))
}

export async function runCommand(cmdArgs: string[]): Promise<string> {
    const [cmd, ...args] = normalizeCmdArgs(cmdArgs)
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: process.env["PYTHONIOENCODING"] || "utf-8",
    }
    let spawnEnv = {cwd: ".", env}

    const cmdStr = `${cmd} ${args.join(" ")}`
    const msg = `Executing: ${cmdStr}`
    console.debug(msg)
    const proc = spawn(cmd, args, spawnEnv)
    let stdout = ""
    let stderr = ""
    proc.stdout.on("data", (data) => {
        stdout += data.toString("utf8")
    })
    proc.stderr.on("data", (data) => {
        stderr += data.toString("utf8")
    })
    return new Promise<string>((resolve, reject) => {
        proc.on("error", (error: Error) => {
            stderr = stderr.trim()
            stdout = stdout.trim()
            let msg = `'${error}' during '${cmdStr}'`
            if (stderr.length > 0) {
                msg += `\n(stderr): ${stderr}`
            }
            if (stdout.length > 0) {
                msg += `\n(stdout): ${stdout}`
            }
            console.error(msg)
            return reject(stderr)
        })
        proc.on("exit", (code: number) => {
            stderr = stderr.trim()
            stdout = stdout.trim()
            if (code !== 0) {
                let msg = `Unexpected exitcode=${code} during '${cmdStr}'`
                if (stderr.length > 0) {
                    msg += `\n(stderr): ${stderr}`
                }
                if (stdout.length > 0) {
                    msg += `\n(stdout): ${stdout}`
                }
                console.error(msg)
                return reject(stderr)
            }
            resolve(stdout)
        })
        // Not sure if needed, we already get the output in the proc.on("exit")
        // This seems duplicate
        // proc.on("close", () => {
        //     stdout = stdout.trim()
        //     stderr = stderr.trim()
        //     let msg = `Done '${cmdStr}'`
        //     if (stderr.length > 0) {
        //         msg += `\n(stderr): ${stderr}`
        //     }
        //     if (stdout.length > 0) {
        //         msg += `\n(stdout): ${stdout}`
        //     }
        //     console.debug(msg)
        //     getJConsole().appendLine(msg)
        //     resolve(stdout)
        // })
    })
}
