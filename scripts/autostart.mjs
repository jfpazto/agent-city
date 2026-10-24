#!/usr/bin/env node
// Arranque automático del colector al iniciar sesión, en cada sistema.
// macOS: launchd (scripts/autostart.sh). Linux: servicio de usuario de systemd. Windows: lanzador en la carpeta Inicio.
// Uso: node scripts/autostart.mjs install | uninstall | status
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const TSX = path.join(REPO, "node_modules", "tsx", "dist", "cli.mjs");
const MAIN = path.join(REPO, "packages", "collector", "src", "main.ts");
const LOG = path.join(REPO, "data", "collector.log");
const NAME = "ciudad-de-agentes";
const mode = process.argv[2];

/** Unidad de systemd: arranca con la sesión del usuario y se reinicia si cae. */
export function systemdUnit(node = process.execPath) {
  return `[Unit]
Description=Ciudad de agentes: colector local
After=network.target

[Service]
WorkingDirectory=${REPO}
ExecStart=${node} ${TSX} ${MAIN}
Restart=always
StandardOutput=append:${LOG}
StandardError=append:${LOG}

[Install]
WantedBy=default.target
`;
}

/** Lanzador .vbs para la carpeta Inicio de Windows: arranca el colector sin ventana. */
export function windowsLauncher(node = process.execPath) {
  const q = (s) => `""${s}""`;
  return `Set sh = CreateObject("WScript.Shell")
sh.CurrentDirectory = "${REPO}"
sh.Run "cmd /c " & "${q(node)} ${q(TSX)} ${q(MAIN)} >> ${q(LOG)} 2>&1", 0, False
`;
}

async function health() {
  try {
    const res = await fetch("http://127.0.0.1:4317/health", { signal: AbortSignal.timeout(1000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function main() {
  if (!["install", "uninstall", "status"].includes(mode)) {
    console.error("Uso: node scripts/autostart.mjs install | uninstall | status");
    process.exit(1);
  }
  if (process.platform === "darwin") {
    const r = spawnSync("bash", [path.join(REPO, "scripts", "autostart.sh"), mode], { stdio: "inherit" });
    process.exit(r.status ?? 1);
  }
  if (mode === "install" && !existsSync(TSX)) {
    console.error("Falta node_modules: ejecuta ./init.sh (o npm install) primero");
    process.exit(1);
  }
  mkdirSync(path.dirname(LOG), { recursive: true });

  if (process.platform === "win32") {
    const startup = path.join(process.env.APPDATA ?? path.join(os.homedir(), "AppData", "Roaming"), "Microsoft", "Windows", "Start Menu", "Programs", "Startup");
    const file = path.join(startup, `${NAME}.vbs`);
    if (mode === "install") {
      mkdirSync(startup, { recursive: true });
      writeFileSync(file, windowsLauncher());
      execFileSync("wscript", [file]);
      console.log(`Instalado: el colector arranca al iniciar sesión (${file}). Log: ${LOG}`);
    } else if (mode === "uninstall") {
      rmSync(file, { force: true });
      console.log("Desinstalado. Si el colector sigue en marcha, ciérralo o reinicia la sesión.");
    } else {
      console.log(existsSync(file) ? `Inicio: instalado (${file})` : "Inicio: no instalado");
      console.log((await health()) ? "colector: responde" : "colector: no responde");
    }
    return;
  }

  // Linux (y otros Unix con systemd).
  const unitDir = path.join(process.env.XDG_CONFIG_HOME ?? path.join(os.homedir(), ".config"), "systemd", "user");
  const unit = path.join(unitDir, `${NAME}.service`);
  const systemctl = (...args) => execFileSync("systemctl", ["--user", ...args], { stdio: "inherit" });
  if (mode === "install") {
    mkdirSync(unitDir, { recursive: true });
    writeFileSync(unit, systemdUnit());
    systemctl("daemon-reload");
    systemctl("enable", "--now", `${NAME}.service`);
    console.log(`Instalado: servicio de usuario ${NAME}.service. Log: ${LOG}`);
  } else if (mode === "uninstall") {
    try {
      systemctl("disable", "--now", `${NAME}.service`);
    } catch {
      // Ya estaba parado o no existía.
    }
    rmSync(unit, { force: true });
    try {
      systemctl("daemon-reload");
    } catch {}
    console.log("Desinstalado.");
  } else {
    console.log(existsSync(unit) ? `systemd: instalado (${unit})` : "systemd: no instalado");
    console.log((await health()) ? "colector: responde" : "colector: no responde");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
