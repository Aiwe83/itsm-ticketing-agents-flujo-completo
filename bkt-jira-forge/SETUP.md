# BankDesk AI — Agentes IA en Jira Forge

App de Jira Forge que muestra en cada ticket el análisis del pipeline agéntico
(Clasificador/Supervisor/Validador/Documentador/Resolutor) y un panel
"Asistente" con chat real contra LLM, revisión de plan, docs/logs e
incidencias relacionadas.

Módulos:
- **BankDesk AI Agents** (panel nativo) — dispara y muestra el pipeline (`src/frontend/index.jsx`, `src/resolvers/index.js`).
- **Asistente** (panel + glance, Custom UI) — vista enriquecida con pestañas Resumen/Documentación/Subtareas/Plan/Asistente (`static/asistente-app/`).

## 0. Requisitos

- Node.js 22.x o 24.x (Forge CLI avisa si usas otra versión, pero suele funcionar igual)
- Forge CLI: `npm install -g @forge/cli`
- Cuenta Atlassian con acceso al Developer Space y al sitio Jira donde se instala

## 1. Login

```bash
forge login
```

## 2. Cómo trabajar sobre esta misma app (recomendado — el camino más ágil)

Esta app ya está registrada y desplegada en el Developer Space **AgenticIncidents**,
con `app.id` = `d1587c1d-da4e-4053-abde-bca2ec4119c1` (ya está en `manifest.yml`,
**no lo cambiéis**), instalada en `bankintergroup-sandbox.atlassian.net`.

Si os añaden como miembros de ese Developer Space (pedídselo a quien lo administra
desde https://developer.atlassian.com/console/), podéis desplegar y editar
directamente sin volver a configurar nada — los secretos de abajo ya están
puestos en el entorno `development` de esa app.

```bash
npm install
npm run deploy          # build del frontend Asistente + forge deploy
forge install --upgrade --site bankintergroup-sandbox.atlassian.net --product jira --environment development
```

### Si en vez de eso queréis vuestra propia copia independiente

```bash
forge register
```

Esto os genera un `app.id` nuevo y lo escribe en `manifest.yml`. En ese caso
**los secretos de abajo NO se copian solos** — tenéis que volver a
configurarlos vosotros (ver sección 3) antes del primer `forge deploy`, y
también volver a crear el webtrigger de datos de demo si lo vais a usar
(sección 4).

## 3. Variables de entorno / secretos

Forge no permite exportar el valor de una variable ya cifrada (`forge variables
list` la muestra como `****`), asi que los valores se guardan en un fichero
`.env` local. **`.env` esta en `.gitignore` y nunca se sube al repositorio.**

```bash
cp .env.example .env    # y rellena los valores (pidelos al admin del Developer Space)
bash scripts/set-forge-vars.sh development
```

El script lee `.env` y ejecuta los `forge variables set` correspondientes.
Si prefieres hacerlo a mano:

```bash
# Backend del pipeline agentico (LangGraph) - variable en claro, no cifrada
forge variables set LANGGRAPH_URL "$LANGGRAPH_URL" --environment development

# API key del LLM que usa el chat del Asistente (callClaude en src/resolvers/claude.js)
forge variables set --encrypt LLM_API_KEY "$LLM_API_KEY" --environment development

# Secreto del webtrigger de datos de demo (src/resolvers/seed.js) - solo hace
# falta si vais a usar/regenerar el sembrado de incidencias de demo
forge variables set --encrypt SEED_SECRET "$SEED_SECRET" --environment development
```

Comprobad que estan puestas con `forge variables list --environment development`.

## 4. Webtrigger de datos de demo (opcional)

`src/resolvers/seed.js` monta un endpoint HTTP protegido por `SEED_SECRET`
que rellena `agentResults` de un ticket con datos de demo ricos (docs, logs,
plan, incidencias relacionadas) sin depender del backend LangGraph real —
útil para preparar demos a cliente. Solo funciona si estáis sobre la misma
app ya desplegada (la URL está ligada al `app.id` + `environmentId` actuales):

```bash
forge webtrigger create -f seed-demo-data --site bankintergroup-sandbox.atlassian.net --product jira --environment development
```

La URL ya creada para la app de la demo esta en `.env` como `SEED_WEBTRIGGER_URL`
(incluye un token, por eso no vive en el repo):
```
https://<app-id>.hello.atlassian-dev.net/x1/<token>
```

Uso: `?issueKey=INCIDENT-93&secret=<SEED_SECRET>` (presets ya definidos en
`seed.js` para INCIDENT-93, INCIDENT-70 e INCIDENT-95 — añadid más entradas al
objeto `PRESETS` para otros tickets). También admite `?action=createRefs` para
crear/reutilizar los tickets reales de "incidencia relacionada" citados en los
presets.

Si registráis una app nueva (`forge register`), este webtrigger no existe
todavía — hay que volver a ejecutar el `create` de arriba para conseguir una
URL propia.

## 5. Desarrollo con hot-reload

```bash
forge tunnel
```

Cambios en `static/asistente-app/src` y `src/resolvers` se recargan solos.
Cambios en `manifest.yml` requieren `forge deploy` + reiniciar el túnel.

## 6. Notas

- El frontend del Asistente (`static/asistente-app/`) es un proyecto Vite/React
  aparte — instalad sus dependencias (`cd static/asistente-app && npm install`)
  antes del primer build. `npm run deploy` en la raíz ya hace esto automáticamente.
- `forge lint` antes de cada deploy para pillar errores de manifest pronto.
- `forge logs --environment development` para depurar resolvers en producción/dev.
