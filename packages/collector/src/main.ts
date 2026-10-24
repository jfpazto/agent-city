import { createServer } from "./server.ts";

const HOST = "127.0.0.1";
const PORT = Number(process.env.COLLECTOR_PORT ?? 4317);

createServer({ coldStart: true }).listen(PORT, HOST, () => {
  console.log(`[collector] escuchando en http://${HOST}:${PORT}`);
});
