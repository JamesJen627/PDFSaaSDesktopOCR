/**
 * Ensures bundled JRE + stirling-pdf JAR exist before electron-builder runs.
 * Skip with ELECTRON_SKIP_RESOURCE_CHECK=1 (packaged shell-only smoke builds).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const resourcesRoot = path.join(packageRoot, "resources");

function fail(message) {
  console.error(`[electron:build] ${message}`);
  console.error("[electron:build] Run: task desktop:jlink && task electron:bundle-resources");
  process.exit(1);
}

if (process.env.ELECTRON_SKIP_RESOURCE_CHECK === "1") {
  console.warn("[electron:build] Skipping bundled resource validation.");
  process.exit(0);
}

const jreBin =
  process.platform === "win32"
    ? path.join(resourcesRoot, "runtime", "jre", "bin", "java.exe")
    : path.join(resourcesRoot, "runtime", "jre", "bin", "java");

if (!fs.existsSync(jreBin)) {
  fail(`Bundled JRE not found at ${jreBin}`);
}

const libsDir = path.join(resourcesRoot, "libs");
if (!fs.existsSync(libsDir)) {
  fail(`libs directory not found: ${libsDir}`);
}

const jarFiles = fs
  .readdirSync(libsDir)
  .filter(
    (name) =>
      name.toLowerCase().endsWith(".jar") && name.toLowerCase().includes("stirling-pdf"),
  );

if (jarFiles.length === 0) {
  fail(`No stirling-pdf JAR found in ${libsDir}`);
}

console.log("[electron:build] Bundled resources OK.");
