# Logs centralizados (Elasticsearch + Kibana + Filebeat)

Centraliza los logs de los 4 contenedores locales del flujo ITSM en un solo sitio, en vez de
`docker logs` contenedor por contenedor.

`bkt-jira-triggers` no esta incluido: corre en Forge (Atlassian Cloud), no tiene contenedor local ni
logs de Docker que recoger — sus logs se siguen viendo con `forge logs` o en el Developer Console.

## Que levanta esto

- **Elasticsearch + Kibana**: ya estaban instalados en `VisualStudio/docker-compose.yml` (raiz, fuera
  de este proyecto). No se instalo nada nuevo, solo se arrancaron.
- **Filebeat** (`observability/docker-compose.yml`, nuevo, solo en esta carpeta): lee los logs de
  Docker de `bkt-integration-service`, `bkt-integration-service-python`, `agent-runtime` y
  `bktcortexproxyllm`, y los manda a Elasticsearch con un campo `servicio` para poder filtrar.

## Arrancar

```powershell
# 1. Elasticsearch + Kibana (desde la raiz VisualStudio)
cd "..\..\..\..\.."   # o la ruta a VisualStudio
docker compose up -d elasticsearch kibana

# 2. Filebeat (desde esta carpeta)
cd observability
docker compose up -d
```

## Ver los logs

Abrir Kibana: http://localhost:5601/app/discover

Data view ya creado: **"ITSM - Logs 5 servicios"** (`itsm-logs-*`). Para filtrar por servicio, usar
la barra KQL, por ejemplo:

```text
servicio: "bkt-integration-service-python"
```

## Parar

```powershell
cd observability
docker compose down

cd "..\..\..\..\.."
docker compose stop elasticsearch kibana
```

`docker compose stop` (no `down`) para no perder el `.claude`/`itsm-logs-*` en el volumen de
Elasticsearch. Si se hace `down` sin `-v`, los datos del volumen se conservan igual; solo se pierden
con `down -v`.

## Notas

- `bkt-cortex-proxy-llm` es, con diferencia, el mas verboso (logs de cada request al proxy LLM) — si
  el volumen de datos crece mucho, se puede ajustar su nivel de log en su propio `.env`.
- El filtro de contenedores esta fijado por nombre exacto en `filebeat.yml` (no autodiscover
  abierto), asi que no capta nada de `moorcheh`/`milvus` ni de otros proyectos en la misma maquina.
