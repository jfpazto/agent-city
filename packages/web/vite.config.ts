import { defineConfig } from "vite";

export default defineConfig({
  server: { port: 5173, strictPort: true },
  // node_modules es un enlace a node_modules.nosync (fuera de iCloud). Sin esto Vite resuelve la ruta real,
  // no la reconoce como dependencia y deja sin convertir los módulos CommonJS (p. ej. eventemitter3).
  resolve: { preserveSymlinks: true },
});
