#!/usr/bin/env bash
# Arranque automático del colector con launchd (LaunchAgent de usuario).
# Uso: scripts/autostart.sh install | uninstall | status
set -euo pipefail

LABEL="com.ciudad-de-agentes.collector"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
NODE="$(command -v node)"
TSX="$REPO/node_modules/.bin/tsx"
LOG="$REPO/data/collector.log"

case "${1:-}" in
  install)
    [ -x "$TSX" ] || { echo "Falta node_modules: ejecuta ./init.sh primero"; exit 1; }
    if ! launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1 && lsof -nP -iTCP:4317 -sTCP:LISTEN >/dev/null 2>&1; then
      echo "El puerto 4317 ya está en uso (¿npm run dev o un colector manual?). Páralo y vuelve a ejecutar."; exit 1
    fi
    mkdir -p "$(dirname "$PLIST")" "$REPO/data"
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NODE</string>
    <string>$TSX</string>
    <string>$REPO/packages/collector/src/main.ts</string>
  </array>
  <key>WorkingDirectory</key><string>$REPO</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$LOG</string>
  <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Instalado: el colector arranca solo al iniciar sesión y se reinicia si cae. Log: $LOG"
    ;;
  uninstall)
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Desinstalado."
    ;;
  status)
    if launchctl print "gui/$(id -u)/$LABEL" >/dev/null 2>&1; then
      echo "launchd: cargado"
    else
      echo "launchd: no instalado"
    fi
    curl -s -m 1 127.0.0.1:4317/health && echo || echo "colector: no responde"
    ;;
  *)
    echo "Uso: $0 install | uninstall | status"; exit 1 ;;
esac
