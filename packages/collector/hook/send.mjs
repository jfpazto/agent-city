// Hook de Claude Code y de Codex (ciudad-de-agentes) para Windows: lo mismo que send.sh, sin sh ni curl.
// Con argumento (`send.mjs codex`) marca el origen: /hook?agent=codex.
// Nunca bloquea ni falla: timeout de 1 s, sin salida y siempre exit 0.
const agent = process.argv.slice(2).find((a) => a === "codex");
const url = `http://127.0.0.1:${process.env.CIUDAD_PORT || 4317}/hook${agent ? `?agent=${agent}` : ""}`;
let body = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (body += chunk));
process.stdin.on("end", () => {
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body, signal: AbortSignal.timeout(1000) })
    .catch(() => {})
    .finally(() => process.exit(0));
});
setTimeout(() => process.exit(0), 1500).unref();
