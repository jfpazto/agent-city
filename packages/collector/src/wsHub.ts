import type http from "node:http";
import { WebSocket, WebSocketServer } from "ws";
import type { ServerMessage } from "@ciudad/shared";
import type { SessionStore } from "./sessions.ts";
import type { UsageStore } from "./usage.ts";

// Puertos locales cuyo front puede hablar con el colector: el de Vite (5173), el propio colector
// y los que añada CIUDAD_WEB_PORTS (separados por comas). Otro servidor de desarrollo local no entra.
export function allowedPortsFromEnv(value = process.env.CIUDAD_WEB_PORTS): Set<string> {
  const ports = new Set(["5173", process.env.COLLECTOR_PORT ?? process.env.CIUDAD_PORT ?? "4317"]);
  for (const p of (value ?? "").split(",")) if (/^\d+$/.test(p.trim())) ports.add(p.trim());
  return ports;
}

// Solo el front servido desde la propia máquina puede leer el estado o lanzar acciones.
// Sin Origin (tests, node, curl) se acepta: no es un navegador.
export function isAllowedOrigin(origin: string | undefined, ports = allowedPortsFromEnv()): boolean {
  if (!origin) return true;
  try {
    const { protocol, hostname, port } = new URL(origin);
    return protocol === "http:" && (hostname === "localhost" || hostname === "127.0.0.1") && ports.has(port || "80");
  } catch {
    return false;
  }
}

export function attachWsHub(server: http.Server, store: SessionStore, usage?: UsageStore): { close(): void } {
  const wss = new WebSocketServer({ noServer: true });

  server.on("upgrade", (req, socket, head) => {
    if (req.url !== "/ws") {
      socket.destroy();
      return;
    }
    if (!isAllowedOrigin(req.headers.origin)) {
      socket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      const snapshot: ServerMessage = { type: "snapshot", sessions: store.list(), usage: usage?.list() ?? [] };
      ws.send(JSON.stringify(snapshot));
    });
  });

  const broadcast = (msg: ServerMessage) => {
    const data = JSON.stringify(msg);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) client.send(data);
    }
  };
  const offSessions = store.subscribe(broadcast);
  const offUsage = usage?.subscribe((limits) => broadcast({ type: "usage", limits })) ?? (() => {});

  const closeHub = () => {
    offSessions();
    offUsage();
    for (const client of wss.clients) client.terminate();
    wss.close();
  };

  // Node solo emite "close" cuando no quedan conexiones, y los sockets WS cuentan:
  // hay que terminarlos antes de cerrar el servidor o server.close() no acaba nunca.
  const originalClose = server.close.bind(server);
  server.close = ((cb?: (err?: Error) => void) => {
    closeHub();
    return originalClose(cb);
  }) as typeof server.close;

  return { close: closeHub };
}
