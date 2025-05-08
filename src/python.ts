// Inspired from https://github.com/parmentelat/vscode-jupytext
import {spawn} from "child_process"
import * as vscode from "vscode"
import {PythonExtension} from "@vscode/python-extension"
import {getJConsole, config} from "./constants"

export async function getPythonFromConfig(): Promise<string | undefined> {
    return config().get<string>("pythonExecutable") ?? undefined
}

export async function resolvePythonExecutable(command: string[]): Promise<string | undefined> {
    const cmdArgs = Array.isArray(command)
        ? command.concat("-c", "import sys; print(sys.executable)")
        : [command, "-c", "import sys; print(sys.executable)"]
    try {
        const output = await runCommand(cmdArgs)
        const msg = `Python '${command}' resolved to: ${output}`
        console.debug(msg)
        if (output) {
            getJConsole().appendLine(msg)
            return output
        }
    } catch (ex) {
        const msg = `Failed to check python with '${cmdArgs}': ${ex}`
        console.error(msg)
    }
    return undefined
}

function normalizeCmdArgs(cmdArgs: string[]) {
    return cmdArgs.map((item) => item.replace(/\\/g, "/"))
}

export async function runCommand(cmdArgs: string[], cwd?: string): Promise<string> {
    const [cmd, ...args] = normalizeCmdArgs(cmdArgs)
    const env: NodeJS.ProcessEnv = {
        ...process.env,
        PYTHONUNBUFFERED: "1",
        PYTHONIOENCODING: process.env["PYTHONIOENCODING"] || "utf-8",
    }
    let spawnEnv = {cwd: cwd || ".", env}

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
            let msg = `Exit code '${code}' during '${cmdStr}'`
            if (stderr.length > 0) {
                msg += `\n(stderr): ${stderr}`
            }
            if (stdout.length > 0) {
                msg += `\n(stdout): ${stdout}`
            }
            if (code !== 0) {
                console.error(msg)
                return reject(stderr)
            }
            console.debug(msg)
            resolve(stdout)
        })
        // Not sure if needed, we already get the output in the proc.on("exit")
        // This seems duplicate
        // proc.on("close", () => {
        //     stdout = stdout.trim()
        //     stderr = stderr.trim()
        //     let msg = `Closed '${cmdStr}'`
        //     if (stderr.length > 0) {
        //         msg += `\n(stderr): ${stderr}`
        //     }
        //     if (stdout.length > 0) {
        //         msg += `\n(stdout): ${stdout}`
        //     }
        //     console.debug(msg)
        //     resolve(stdout)
        // })
    })
}

async function getPythonEnvsViaMsPython() {
    // Attempt to load the MS Python extension, should succeed if it's installed
    const pythonExt = vscode.extensions.getExtension<PythonExtension>("ms-python.python")
    const msgPrefix = "Skipping Python discovering via ms-python.python extension"
    if (!pythonExt) {
        const msg = `${msgPrefix}: not installed.`
        console.log(msg)
        getJConsole().appendLine(msg)
        return undefined
    }

    // Activate the extension if not already active
    let pythonApi: PythonExtension
    try {
        pythonApi = pythonExt.isActive ? pythonExt.exports : await pythonExt.activate()
    } catch (ex) {
        const msg = `${msgPrefix}, failed to activate: ${ex}`
        console.error(msg)
        getJConsole().appendLine(msg)
        return undefined
    }

    const envs = pythonApi.environments
    console.log("envs", envs)
    return envs.known
}

async function getPythonPathsViaMsPython() {
    const pythonEnvs = await getPythonEnvsViaMsPython()
    if (!pythonEnvs) {
        return []
    }
    return pythonEnvs.map((env) => env.path)
}

function getSystemPythonPaths() {
    return ["python", "python3"]
}

export async function getPythonPaths() {
    const pythonPath = config("python").get<string>("defaultInterpreterPath")
    const pythonPaths = new Set([
        ...(await getPythonPathsViaMsPython()),
        ...getSystemPythonPaths(),
        ...(pythonPath ? [pythonPath] : []),
    ])
    console.log("pythonPaths", pythonPaths)
    return Array.from(pythonPaths)
}
