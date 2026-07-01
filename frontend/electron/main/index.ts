import path from "node:path";
import { fileURLToPath } from "node:url";

import { app, BrowserWindow } from "electron";

import { ensureAppDataDirectories } from "./appPaths.js";
import { registerIpcHandlers, unregisterIpcHandlers } from "./ipc/registerHandlers.js";
import { TaskEventBus } from "./ipc/taskEvents.js";
import { ProcessManager } from "./processManager.js";

const moduleDir = path.dirname(fileURLToPath(import.meta.url));

let mainWindow: BrowserWindow | null = null;
const taskEvents = new TaskEventBus();
const appPaths = ensureAppDataDirectories();
const processManager = new ProcessManager({
  appPaths,
  isPackaged: app.isPackaged,
  packagedResourcesPath: app.isPackaged ? process.resourcesPath : undefined,
});

function preloadPath(): string {
  return path.join(moduleDir, "..", "preload", "index.js");
}

function rendererDistPath(): string {
  return path.join(moduleDir, "..", "..", "renderer", "dist", "index.html");
}

async function loadRenderer(window: BrowserWindow): Promise<void> {
  const devUrl = process.env.ELECTRON_RENDERER_URL?.trim();

  if (devUrl) {
    await window.loadURL(devUrl);
    if (process.env.ELECTRON_OPEN_DEVTOOLS === "true") {
      window.webContents.openDevTools({ mode: "detach" });
    }
    return;
  }

  await window.loadFile(rendererDistPath());
}

function createMainWindow(): BrowserWindow {
  mainWindow = new BrowserWindow({
    width: 960,
    height: 640,
    show: false,
    webPreferences: {
      preload: preloadPath(),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  taskEvents.bindWindow(mainWindow);

  mainWindow.on("closed", () => {
    mainWindow = null;
    taskEvents.clearBinding();
  });

  void loadRenderer(mainWindow);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });

  return mainWindow;
}

async function bootstrap(): Promise<void> {
  registerIpcHandlers({ processManager, appPaths, taskEvents });
  createMainWindow();

  await processManager.startAll();
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) {
  app.quit();
} else {
  app.on("second-instance", () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) {
        mainWindow.restore();
      }
      mainWindow.focus();
    }
  });

  app.whenReady().then(() => {
    void bootstrap();
  });

  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") {
      app.quit();
    }
  });

  app.on("before-quit", () => {
    void processManager.shutdownAll();
  });

  app.on("will-quit", () => {
    unregisterIpcHandlers();
  });
}
