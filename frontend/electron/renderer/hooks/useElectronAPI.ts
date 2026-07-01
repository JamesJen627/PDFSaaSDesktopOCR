import { useMemo } from "react";

import type { ElectronAPI } from "@shared/types.js";

export function getElectronAPI(): ElectronAPI | null {
  return window.electronAPI ?? null;
}

export function useElectronAPI(): ElectronAPI | null {
  return useMemo(() => getElectronAPI(), []);
}
