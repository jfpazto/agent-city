#!/bin/sh
# Hook de Claude Code y de Codex (ciudad-de-agentes): reenvía el JSON de stdin al colector.
# Con argumento (`send.sh codex`) marca el origen: /hook?agent=codex.
# Nunca bloquea ni falla: timeout de 1 s, sin salida y siempre exit 0.
curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- \
  "http://127.0.0.1:${CIUDAD_PORT:-4317}/hook${1:+?agent=$1}" >/dev/null 2>&1
exit 0
