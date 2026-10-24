#!/usr/bin/env bash
set -euo pipefail

echo "Repositorio: $(pwd)"

if [ ! -d node_modules ]; then
  echo "Instalando dependencias..."
  npm install
fi

echo "Verificación base: typecheck"
npm run typecheck

echo "Verificación base: tests"
npm test

echo "OK. Para arrancar colector (127.0.0.1:4317) y front (localhost:5173): npm run dev"
