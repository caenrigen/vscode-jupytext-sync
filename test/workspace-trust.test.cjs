const assert = require("node:assert/strict")
const {mkdtempSync, readFileSync, existsSync, rmSync} = require("node:fs")
const {tmpdir} = require("node:os")
const path = require("node:path")
const {test} = require("node:test")
const vm = require("node:vm")
const manifest = require("../package.json")

// Load the compiled extension with only VS Code mocked; child processes are real.
function loadExtension(isTrusted) {
  const vscode = {
    workspace: {
      isTrusted,
      getConfiguration() {
        throw new Error("Untrusted discovery must not read configuration")
      },
    },
  }
  const cache = new Map()
  function load(filename) {
    if (cache.has(filename)) {
      return cache.get(filename)
    }
    const exports = {}
    cache.set(filename, exports)
    vm.runInNewContext(readFileSync(filename, "utf8"), {
      exports,
      process,
      console,
      require(name) {
        if (name === "vscode") {
          return vscode
        }
        return name.startsWith(".")
          ? load(path.resolve(path.dirname(filename), `${name}.js`))
          : require(name)
      },
    }, {filename})
    return exports
  }
  return {vscode, python: load(path.resolve(__dirname, "../out/python.js")), load}
}

test("execution settings are user-only and restricted by Workspace Trust", () => {
  const keys = ["pythonExecutable", "setFormatsArgs", "syncArgs"].map((key) => `jupytextSync.${key}`)
  for (const key of keys) {
    assert.equal(manifest.contributes.configuration.properties[key].scope, "machine")
  }
  assert.equal(manifest.capabilities.untrustedWorkspaces.supported, "limited")
  assert.deepEqual(manifest.capabilities.untrustedWorkspaces.restrictedConfigurations, keys)
})

test("the process boundary blocks execution in Restricted Mode and permits it after trust", async (t) => {
  const {vscode, python} = loadExtension(false)
  const dir = mkdtempSync(path.join(tmpdir(), "jupytext-trust-"))
  t.after(() => rmSync(dir, {recursive: true, force: true}))
  const marker = path.join(dir, "executed")
  const command = [process.execPath, "-e", `require('node:fs').writeFileSync(${JSON.stringify(marker)}, 'ran')`]
  await assert.rejects(python.runCommand(command, dir), /Trust this workspace/)
  assert.equal(existsSync(marker), false)

  vscode.workspace.isTrusted = true
  await python.runCommand(command, dir)
  assert.equal(readFileSync(marker, "utf8"), "ran")

  // Trust is checked for every launch, even when a caller has cached its command.
  vscode.workspace.isTrusted = false
  await assert.rejects(python.runCommand(command, dir), /Trust this workspace/)
})

test("untrusted discovery and sync entry points return before reading configuration", async () => {
  const {load} = loadExtension(false)
  const jupytext = load(path.resolve(__dirname, "../out/jupytext.js"))
  assert.equal(await jupytext.locatePythonAndJupytext(), undefined)
  assert.equal(await jupytext.validatePythonAndJupytext(), undefined)
  assert.equal(await jupytext.ensurePythonAndJupytext(false), undefined)
  assert.equal(await jupytext.ensurePythonAndJupytext(true), undefined)
})
