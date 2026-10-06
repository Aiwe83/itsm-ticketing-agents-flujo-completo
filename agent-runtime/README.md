# agentic-core

Backend de agentes construido con Litestar, Dishka y msgspec.

## Runtime incluido

- API HTTP para health, providers, MCPs y agents.
- Runtime de chat y ejecucion de agentes con tools internas y MCP.
- Persistencia en MongoDB y cache/coordinacion en Redis.
- Observabilidad opcional con OpenTelemetry y Phoenix.

## Arranque local

```bash
make install
copy .env.example .env
make up
```

Puntos de entrada:

- API: `http://localhost:8001` usando el `.env.example` del flujo completo.
- Health: `http://localhost:8001/api/v1/health`
- Phoenix: `http://localhost:6007`

El contenedor sigue escuchando internamente en `8000`; el puerto `8001` es solo el puerto publicado
en el host para convivir con `bkt-integration-service`, que usa `8000` en local.

## Estructura

- `src/`: codigo de aplicacion
- `infra/`: compose local y configuracion OTEL

## Requisitos

- Python 3.13
- uv
- Docker + Docker Compose v2
