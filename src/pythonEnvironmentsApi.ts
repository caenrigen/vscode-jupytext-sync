// Minimal type definitions for the ms-python.vscode-python-envs extension API.
// Sourced from: https://github.com/microsoft/vscode-python-environments (pythonEnvironmentsApi/src/main.ts)
// The @vscode/python-environments npm package is not yet published; this is a local copy.
import * as vscode from "vscode"

export interface PythonCommandRunConfiguration {
  executable: string
  args?: string[]
}

export interface PythonEnvironmentExecutionInfo {
  run: PythonCommandRunConfiguration
  activatedRun?: PythonCommandRunConfiguration
}

export interface PythonEnvironmentInfo {
  readonly name: string
  readonly displayName: string
  readonly version: string
  readonly execInfo: PythonEnvironmentExecutionInfo
  readonly error?: string
}

export interface PythonEnvironment extends PythonEnvironmentInfo {
  readonly envId: {readonly id: string}
}

export type DidChangeEnvironmentEventArgs = {
  readonly uri: vscode.Uri | undefined
  readonly old: PythonEnvironment | undefined
  readonly new: PythonEnvironment | undefined
}

export type DidChangeEnvironmentsEventArgs = {
  kind: "add" | "remove"
  environment: PythonEnvironment
}[]

export interface PythonEnvironmentApi {
  getEnvironments(scope: vscode.Uri | "all" | "global"): Promise<PythonEnvironment[]>
  getEnvironment(scope: vscode.Uri | undefined): Promise<PythonEnvironment | undefined>
  onDidChangeEnvironment: vscode.Event<DidChangeEnvironmentEventArgs>
  onDidChangeEnvironments: vscode.Event<DidChangeEnvironmentsEventArgs>
}

let _api: PythonEnvironmentApi | undefined

export async function getNewPythonEnvsApi(): Promise<PythonEnvironmentApi | undefined> {
  if (_api) {
    return _api
  }
  const ext = vscode.extensions.getExtension<PythonEnvironmentApi>("ms-python.vscode-python-envs")
  if (!ext) {
    return undefined
  }
  _api = ext.isActive ? ext.exports : await ext.activate()
  return _api
}
