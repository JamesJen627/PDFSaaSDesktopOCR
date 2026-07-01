import fs from "node:fs";
import path from "node:path";

import type { ResourcePaths } from "../shared/types.js";

function findStirlingJar(libsDir: string): string {
  if (!fs.existsSync(libsDir)) {
    throw new Error(`libs directory not found: ${libsDir}`);
  }

  const jarFiles = fs
    .readdirSync(libsDir)
    .filter(
      (name) =>
        name.toLowerCase().endsWith(".jar") &&
        name.toLowerCase().includes("stirling-pdf"),
    )
    .sort((a, b) => b.localeCompare(a, undefined, { sensitivity: "base" }));

  if (jarFiles.length === 0) {
    throw new Error(`No stirling-pdf JAR found in ${libsDir}`);
  }

  return path.join(libsDir, jarFiles[0]);
}

function findBundledJreBin(resourcesDir: string): string {
  const jreBin =
    process.platform === "win32"
      ? path.join(resourcesDir, "runtime", "jre", "bin", "java.exe")
      : path.join(resourcesDir, "runtime", "jre", "bin", "java");

  if (!fs.existsSync(jreBin)) {
    throw new Error(`Bundled JRE not found at ${jreBin}`);
  }

  return jreBin;
}

function findOcrServiceDir(resourcesDir: string): string {
  const bundled = path.join(resourcesDir, "ocr-service");
  if (fs.existsSync(path.join(bundled, "pyproject.toml"))) {
    return bundled;
  }
  if (
    fs.existsSync(path.join(bundled, "start.bat")) ||
    fs.existsSync(path.join(bundled, "start.sh")) ||
    fs.existsSync(path.join(bundled, "scripts", "start.bat")) ||
    fs.existsSync(path.join(bundled, "scripts", "start.sh"))
  ) {
    return bundled;
  }

  const repoService = path.resolve(resourcesDir, "..", "..", "..", "ocr-service");
  if (fs.existsSync(path.join(repoService, "pyproject.toml"))) {
    return repoService;
  }

  const sibling = path.join(resourcesDir, "..", "ocr-service");
  if (fs.existsSync(path.join(sibling, "pyproject.toml"))) {
    return path.resolve(sibling);
  }

  return bundled;
}

/** Resolve bundled JRE, JAR, and OCR stub directory under resources root. */
export function resolveResourcePaths(resourcesDir: string): ResourcePaths {
  return {
    jreBin: findBundledJreBin(resourcesDir),
    jarPath: findStirlingJar(path.join(resourcesDir, "libs")),
    ocrServiceDir: findOcrServiceDir(resourcesDir),
  };
}
