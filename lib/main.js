import { rm, mkdir, move, writeFile, chmod, access } from "fs-extra"
import { homedir } from "os"
import { join, dirname, resolve } from "path"
import { getInput, debug, setFailed, addPath, error } from "@actions/core"
import { downloadTool, extractTar, extractZip } from "@actions/tool-cache"
import { saveCache, restoreCache } from "@actions/cache"
import { getDownloadObject } from "./utils"
import { exec } from "@actions/exec"

async function setup() {
  try {
    const version = getInput("version")
    const installPdiff = getInput("install-pdiff") === "true"
    const paths = [
      join(homedir(), ".nf-test", "nf-test"),
      join(homedir(), ".nf-test", "nf-test.jar")
    ]
    const key = "nf-test-" + version
    const restoreKey = await restoreCache(paths, key)

    if (restoreKey) {
      debug(`Cache restored from key: ${restoreKey}`)
      addPath(dirname(paths[0]))
      return
    }

    debug(`no version of nf-test matching "${version}" is installed`)
    const download = getDownloadObject(version)
    const pathToTarball = await downloadTool(download.url)
    const extract = download.url.endsWith(".zip") ? extractZip : extractTar
    const pathToCLI = await extract(pathToTarball)
    debug(`Path to CLI: ${pathToCLI}`)
    debug(`Bin path: ${download.binPath}`)
    const binFilePath = resolve(pathToCLI, download.binPath)

    debug("Make ~/.nf-test even if it already exists")
    if (await fileExists(join(homedir(), ".nf-test"))) {
      debug("Directory ~/.nf-test already exists")
      await rm(join(homedir(), ".nf-test"), { recursive: true, force: true })
    }
    await mkdir(join(homedir(), ".nf-test"))

    debug(paths)
    debug("Move the binary to ~/.nf-test/nf-test " + paths[0])
    try {
      await move(binFilePath, paths[0])
    } catch (err) {
      error(err)
    }

    debug("Move the jar to ~/.nf-test/nf-test.jar")
    try {
      await move(join(pathToCLI, "nf-test.jar"), paths[1])
    } catch (err) {
      error(err)
    }

    debug("Expose the tool by adding it to the PATH")
    addPath(dirname(paths[0]))

    if (installPdiff) {
      debug("Installing pdiff and setting environment variables")
      await exec("python -m pip install pdiff")

      // Create a simple wrapper script in the same directory as nf-test
      const pdiffWrapperPath = join(dirname(paths[0]), "pdiff")
      await writeFile(pdiffWrapperPath, `#!/bin/bash\npython -m pdiff "$@"\n`)
      await chmod(pdiffWrapperPath, 0o755)
      debug(`Created pdiff wrapper at ${pdiffWrapperPath}`)

      process.env.NFT_DIFF = "pdiff"
      process.env.NFT_DIFF_ARGS = "--line-numbers --expand-tabs=2"
    }

    await saveCache(paths, key)
    debug(`Cache saved with key: ${key}`)
    return
  } catch (e) {
    setFailed(e)
  }
}

async function fileExists(filePath) {
  try {
    await access(filePath)
    return true
  } catch (err) {
    return false
  }
}

/**
 * The main function for the action.
 *
 * @returns {Promise<void>} Resolves when the action is complete.
 */
export async function run() {
  setup()
}
