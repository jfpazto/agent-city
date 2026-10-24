// Statusline de Claude Code (ciudad-de-agentes) para Windows: lo mismo que statusline.sh, sin sh ni curl.
// Reenvía el JSON al colector (que solo guarda límites de uso y % de contexto) y muestra el modelo.
// Nunca bloquea ni falla: timeout de 1 s y siempre exit 0.
const url = `http://127.0.0.1:${process.env.CIUDAD_PORT || 4317}/usage/claude`;
let input = "";
process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => (input += chunk));
process.stdin.on("end", () => {
  try {
    const name = JSON.parse(input)?.model?.display_name;
    if (typeof name === "string") process.stdout.write(name + "\n");
  } catch {}
  fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: input, signal: AbortSignal.timeout(1000) })
    .catch(() => {})
    .finally(() => process.exit(0));
});
setTimeout(() => process.exit(0), 1500).unref();
