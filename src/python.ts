// Inspired from https://github.com/parmentelat/vscode-jupytext
import {spawn} from "child_process"
import * as vscode from "vscode"
import {PythonExtension} from "@vscode/python-extension"
import {getJConsole, config} from "./constants"
import {getNewPythonEnvsApi} from "./pythonEnvironmentsApi"

export function getPythonFromConfig(): string | undefined {
  let pythonExecutable = config().get<string>("pythonExecutable") ?? undefined
  if (!pythonExecutable) {
    return undefined
  }
  /*
    Refs:
    Canonical variables:
    https://code.visualstudio.com/docs/reference/variables-reference
    VSCode does not provide an API to expand variables:
    https://github.com/microsoft/vscode/issues/46471
    A more elaborate implementation:
    https://github.com/sqlfluff/vscode-sqlfluff/blob/4e77e64d341ee54732139102997c1236ab43b134/src/features/helper/utilities.ts#L17-L30
    Potential package to use:
    https://github.com/DominicVonk/vscode-variables
    */
  pythonExecutable = expandVariables(pythonExecutable)
  console.debug("pythonExecutable", pythonExecutable)
  return pythonExecutable
}

function expandVariables(value: string): string {
  // ${workspaceFolder}
  if (value.includes("${workspaceFolder}")) {
    value = value.replace(
      /\$\{workspaceFolder\}/g,
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? "",
    )
  }

  // ${userHome}
  const userHome = process.env["HOME"] || process.env["USERPROFILE"] || ""
  if (value.includes("${userHome}")) {
    value = value.replace(/\$\{userHome\}/g, userHome)
  }

  // ${env:VAR_NAME}
  value = value.replace(/\$\{env:([^}]+)\}/g, (_match, varName) => {
    return process.env[varName] ?? ""
  })

  return value
}

export async function resolvePythonExecutable(command: string[]): Promise<string | undefined> {
  const cmdArgs = Array.isArray(command)
    ? command.concat("-c", "import sys; print(sys.executable)")
    : [command, "-c", "import sys; print(sys.executable)"]
  try {
    const output = await runCommand(cmdArgs)
    const msg = `Python '${command}' resolved to: ${output}`
    if (output) {
      getJConsole().appendLine(msg)
      return output
    }
  } catch (ex) {
    const msg = `Failed to check python with '${cmdArgs}': ${ex}`
    console.error(msg, ex)
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
    proc.on("close", (code: number) => {
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
  })
}

async function getPythonEnvsViaMsPython() {
  // Attempt to load the MS Python extension, should succeed if it's installed
  const pythonExt = vscode.extensions.getExtension<PythonExtension>("ms-python.python")
  const msgPrefix = "Skipping Python discovering via ms-python.python extension"
  if (!pythonExt) {
    const msg = `${msgPrefix}: not installed.`
    getJConsole().appendLine(msg)
    return undefined
  }

  // Activate the extension if not already active
  let pythonApi: PythonExtension
  try {
    pythonApi = pythonExt.isActive ? pythonExt.exports : await pythonExt.activate()
  } catch (ex) {
    const msg = `${msgPrefix}, failed to activate: ${ex}`
    console.error(msg, ex)
    getJConsole().appendLine(msg)
    return undefined
  }

  const envs = pythonApi.environments
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

async function getPythonPathsViaNewPythonEnvs(): Promise<string[]> {
  const msgPrefix = "Skipping Python discovery via ms-python.vscode-python-envs extension"
  const api = await getNewPythonEnvsApi()
  if (!api) {
    getJConsole().appendLine(`${msgPrefix}: not installed.`)
    return []
  }
  try {
    const paths: string[] = []
    const addEnvPath = (env: {execInfo?: {run?: {executable?: string}}; error?: string}) => {
      const exe = env.execInfo?.run?.executable
      if (exe && !env.error && !paths.includes(exe)) {
        paths.push(exe)
      }
    }
    // Prefer the selected environment for the current workspace folder (highest signal)
    const workspaceUri = vscode.workspace.workspaceFolders?.[0]?.uri
    if (workspaceUri) {
      const active = await api.getEnvironment(workspaceUri)
      if (active) {
        getJConsole().appendLine(
          `ms-python.vscode-python-envs: workspace active env: ${active.execInfo?.run?.executable ?? "(no executable)"}${active.error ? ` [broken: ${active.error}]` : ""}`,
        )
        addEnvPath(active)
      } else {
        getJConsole().appendLine("ms-python.vscode-python-envs: no active env set for workspace.")
      }
    }
    // Fall back to the globally-selected environment (useful with no workspace or single-file mode)
    const globalActive = await api.getEnvironment(undefined)
    if (globalActive) {
      getJConsole().appendLine(
        `ms-python.vscode-python-envs: global active env: ${globalActive.execInfo?.run?.executable ?? "(no executable)"}${globalActive.error ? ` [broken: ${globalActive.error}]` : ""}`,
      )
      addEnvPath(globalActive)
    }
    // Then include all other discovered environments, skipping broken ones
    const all = await api.getEnvironments("all")
    getJConsole().appendLine(
      `ms-python.vscode-python-envs: ${all.length} environment(s) discovered total, ${all.filter((e) => e.error).length} broken (skipped).`,
    )
    for (const env of all) {
      addEnvPath(env)
    }
    getJConsole().appendLine(
      `ms-python.vscode-python-envs: resolved ${paths.length} candidate path(s): ${paths.join(", ") || "(none)"}`,
    )
    return paths
  } catch (ex) {
    const msg = `${msgPrefix}: failed: ${ex}`
    console.error(msg, ex)
    getJConsole().appendLine(msg)
    return []
  }
}

export async function getPythonPaths() {
  const pythonPath = config("python").get<string>("defaultInterpreterPath")
  const pythonPaths = new Set([
    ...(await getPythonPathsViaNewPythonEnvs()),
    ...(await getPythonPathsViaMsPython()),
    ...getSystemPythonPaths(),
    ...(pythonPath ? [pythonPath] : []),
  ])
  console.debug("pythonPaths", pythonPaths)
  return Array.from(pythonPaths)
}
