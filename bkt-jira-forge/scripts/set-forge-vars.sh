#!/usr/bin/env bash
# Carga .env y publica las variables en el entorno Forge indicado.
# Uso: bash scripts/set-forge-vars.sh [development|staging|production]
set -euo pipefail

ENVIRONMENT="${1:-development}"
ROOT="$(cd "$(dirname "$0")/.." && pwd)"

if [ ! -f "$ROOT/.env" ]; then
  echo "No existe .env — copia .env.example a .env y rellena los valores." >&2
  exit 1
fi

set -a
# shellcheck disable=SC1091
. "$ROOT/.env"
set +a

: "${LANGGRAPH_URL:?falta LANGGRAPH_URL en .env}"
: "${LLM_API_KEY:?falta LLM_API_KEY en .env}"

forge variables set LANGGRAPH_URL "$LANGGRAPH_URL" --environment "$ENVIRONMENT"
forge variables set --encrypt LLM_API_KEY "$LLM_API_KEY" --environment "$ENVIRONMENT"

if [ -n "${SEED_SECRET:-}" ]; then
  forge variables set --encrypt SEED_SECRET "$SEED_SECRET" --environment "$ENVIRONMENT"
fi

echo "Listo. Comprueba con: forge variables list --environment $ENVIRONMENT"
