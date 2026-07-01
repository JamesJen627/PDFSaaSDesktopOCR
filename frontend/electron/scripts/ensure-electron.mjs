/**
 * Repairs a broken/partial node_modules/electron install (empty folder, missing path.txt).
 * Uses npm pack + extract into node_modules/electron, then runs install.js.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronDir = path.join(packageRoot, "node_modules", "electron");
const pathFile = path.join(electronDir, "path.txt");
const version = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
).devDependencies.electron.replace(/^[^0-9]*/, "");

const force = process.argv.includes("--force");

function isElectronBinaryReady() {
  if (!fs.existsSync(pathFile)) {
    return false;
  }
  const relative = fs.readFileSync(pathFile, "utf8").trim();
  return fs.existsSync(path.join(electronDir, "dist", relative));
}

function run(command, args, options = {}) {
  const useShell = process.platform === "win32";
  const result = spawnSync(command, args, {
    stdio: "inherit",
    shell: useShell,
    ...options,
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function npmCommand() {
  return process.platform === "win32" ? "npm" : "npm";
}

function restoreElectronPackageFiles() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "pdfsaas-electron-pack-"));
  const packDest = path.join(tmpDir, "pack");

  try {
    fs.mkdirSync(packDest, { recursive: true });
    console.log(`[electron:repair] Fetching electron@${version} package...`);
    run(npmCommand(), ["pack", `electron@${version}`, "--pack-destination", packDest], {
      cwd: tmpDir,
      env: {
        ...process.env,
        ELECTRON_MIRROR:
          process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
      },
    });

    const tgz = fs.readdirSync(packDest).find((name) => name.endsWith(".tgz"));
    if (!tgz) {
      throw new Error("npm pack did not produce a tarball");
    }

    fs.mkdirSync(electronDir, { recursive: true });
    console.log("[electron:repair] Restoring package files into node_modules/electron ...");

    const tarResult = spawnSync(
      "tar",
      ["-xzf", path.join(packDest, tgz), "-C", electronDir, "--strip-components=1", "package"],
      { stdio: "inherit" },
    );

    if (tarResult.status !== 0) {
      throw new Error("Failed to extract electron package (is tar available?)");
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

function downloadElectronBinary() {
  const installScript = path.join(electronDir, "install.js");
  if (!fs.existsSync(installScript)) {
    throw new Error("electron install.js missing after package restore");
  }

  console.log("[electron:repair] Downloading Electron binary...");
  run(process.execPath, [installScript], {
    cwd: electronDir,
    shell: false,
    env: {
      ...process.env,
      ELECTRON_MIRROR:
        process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
    },
  });
}

if (isElectronBinaryReady() && !force) {
  process.exit(0);
}

if (!fs.existsSync(path.join(electronDir, "install.js"))) {
  restoreElectronPackageFiles();
} else if (!fs.existsSync(pathFile)) {
  restoreElectronPackageFiles();
}

downloadElectronBinary();

if (!isElectronBinaryReady()) {
  console.error("[electron:repair] Electron binary still missing after install.");
  process.exit(1);
}

console.log("[electron:repair] Electron ready.");
