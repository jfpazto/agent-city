import { configDefaults, defineConfig } from "vitest/config";

// Los worktrees de sesiones paralelas viven en .claude/worktrees: sus tests no son de esta copia.
// node_modules es un enlace a node_modules.nosync para que iCloud no descargue sus archivos.
export default defineConfig({
  test: { exclude: [...configDefaults.exclude, ".claude/**", "**/node_modules.nosync/**"] },
});
