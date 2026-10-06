# BKT Jira Forge — BankDesk AI

App de **Jira Forge** que añade a cada incidencia un panel con el resultado del
pipeline agéntico (Clasificador / Supervisor / Validador / Documentador /
Resolutor) y un asistente conversacional contra un LLM.

## Estructura

```
manifest.yml                 Definición de la app Forge (módulos, scopes, recursos)
src/resolvers/               Backend: resolvers Forge y lógica del pipeline
  index.js                   Handler principal + datos de demo
  claude.js                  Llamada al LLM (usa el secreto LLM_API_KEY)
  jira.js, jira-fields.js    Acceso a la API de Jira
  pipeline.js, supervisor.js, validator.js, documentor.js, resolver.js
  asistente-data.js          Datos que consume el panel Asistente
static/asistente-app/        Frontend Custom UI (Vite + React 18)
  src/App.jsx                Panel con pestañas Resumen/Documentación/Subtareas/Plan/Asistente
```

## Puesta en marcha

```bash
npm install
npm run deploy    # build del frontend + forge deploy
```

Los pasos completos (login, registro de la app, variables de entorno,
webtrigger de datos de demo y desarrollo con `forge tunnel`) están en
[SETUP.md](SETUP.md).

## Secretos

Ninguna credencial se guarda en este repositorio. Los valores viven en un
`.env` local (ignorado por git); en el repo solo está `.env.example` con las
claves vacías.

```bash
cp .env.example .env                      # rellena los valores
bash scripts/set-forge-vars.sh development  # los publica en Forge
```

Ver [SETUP.md](SETUP.md#3-variables-de-entorno--secretos).

## Scripts

| Script | Qué hace |
| --- | --- |
| `npm run build` | `forge build` |
| `npm run build:asistente` | Instala y compila el frontend de `static/asistente-app` |
| `npm run deploy` | Build del frontend + `forge deploy` |
| `npm run tunnel` | `forge tunnel` para desarrollo con hot-reload |
