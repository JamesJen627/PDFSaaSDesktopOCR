import path from "node:path";
import { fileURLToPath } from "node:url";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const rendererRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: rendererRoot,
  base: "./",
  plugins: [react()],
  resolve: {
    alias: {
      "@shared": path.resolve(rendererRoot, "../shared"),
    },
  },
  build: {
    outDir: path.resolve(rendererRoot, "dist"),
    emptyOutDir: true,
  },
  server: {
    port: 5174,
    strictPort: true,
  },
});
