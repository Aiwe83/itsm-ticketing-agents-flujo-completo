# Documentacion del proyecto

Esta carpeta contiene documentacion versionable, revisable y sanitizada del servicio `integration-service`.

La regla principal es sencilla:

- `docs/` guarda lo que ya esta ordenado para revision tecnica o funcional.
- Los datos recibidos como material de trabajo se revisan antes de promocionarlos a `docs/`.
- MongoDB solo debe recibir datos preparados para demo o carga controlada, nunca material bruto sin
  revisar. Desde 2026-08-19, la carga de mappings confirmados a la coleccion `mappings` real ya no
  es manual: `pnpm mappings:dry-run`/`pnpm mappings:apply` (ver `docs/mappings/README.md`, seccion
  "Pipeline de promocion") comparan `catalog.json` contra Mongo y solo escriben con confirmacion
  explicita de version.

## Estructura actual

| Ruta | Para que sirve |
| --- | --- |
| `docs/mappings/` | Catalogo de mappings Jira -> modelo interno. |
| `docs/mappings/contexts/pilot-local/` | Catalogo y matrices humanas por seccion funcional. |
| `docs/mappings/evidence/pilot-local/` | Evidencias sanitizadas que justifican cada decision. |
| `docs/mappings/modelo_de_datos_mappeos_nuevos/` | Copia documental del nuevo modelo recibido para revisar campos. |
| `docs/mappings/scripts/` | Scripts documentales para generar vistas de revision en MongoDB. |

`mapping_catalog_review` (la coleccion documental en MongoDB) no es de pruebas desechables: es la
vista de solo revision de los 163 campos del catalogo funcional. No borrar sin mirar antes
`docs/mappings/evidence/pilot-local/README.md` (seccion "Coleccion `mapping_catalog_review`") y
`docs/mappings/README.md` (seccion "Cuantos campos estan realmente cargados en Mongo").

## Como usar esta documentacion

1. Revisar primero el modelo recibido en `docs/mappings/modelo_de_datos_mappeos_nuevos/`.
2. Contrastar cada campo con evidencias sanitizadas en `docs/mappings/evidence/pilot-local/`.
3. Clasificar cada campo como `confirmed`, `pending-validation`, `excluded` o `engineBlocked`.
4. Promover solo los campos confirmados a `docs/mappings/contexts/pilot-local/catalog.json`.
5. Generar, si hace falta para demo, la coleccion documental `mapping_catalog_review` en MongoDB.

## Que no debe mezclarse aqui

- Credenciales, tokens, cookies o cabeceras de autorizacion.
- Datos personales reales.
- Adjuntos reales.
- Capturas o exports sin sanitizar.
- Pruebas temporales que no aporten evidencia reutilizable.

## Objetivo para negocio

La documentacion debe permitir explicar de forma visual:

1. que campos llegan desde Jira;
2. a que campos internos se traducen;
3. que mappings ya estan confirmados;
4. que campos siguen pendientes;
5. que partes no se pueden cargar todavia porque requieren una mejora del motor.
