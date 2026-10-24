#!/bin/sh
# Statusline de Claude Code (ciudad-de-agentes): reenvía el JSON de stdin al colector, que solo guarda `rate_limits`.
# Nunca bloquea ni falla: timeout de 1 s y siempre exit 0. Muestra el modelo, como la statusline por defecto.
input=$(cat)
printf '%s' "$input" | curl -s -m 1 -X POST -H 'content-type: application/json' --data-binary @- \
  "http://127.0.0.1:${CIUDAD_PORT:-4317}/usage/claude" >/dev/null 2>&1
printf '%s' "$input" | sed -n 's/.*"display_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1
exit 0
