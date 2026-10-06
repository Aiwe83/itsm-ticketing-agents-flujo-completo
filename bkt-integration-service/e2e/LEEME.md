# Pruebas automáticas del flujo de adjuntos: qué mide cada una y cómo leer el resultado

Carpeta local del workspace (no es un repositorio y no se sube a GitLab). Sin dependencias: solo Node.

## 1. El flujo que se prueba

```text
Jira (ticket con adjuntos)  →  trigger (bkt-jira-triggers, en Forge)  →  servicio (bkt-integration-service)  →  Mongo
        crea el ticket              lo lee por REST y envía el aviso         descarga, convierte a Markdown      guarda el resultado
```

Probar todo el flujo de golpe es lento y frágil (Jira, Forge, ngrok, Docker). Por eso hay **tres niveles de prueba**,
de más rápido y estable a más real. Cada nivel responde a una pregunta distinta:

| Nivel | Pregunta que responde | Qué incluye | Qué NO incluye | Tarda |
|---|---|---|---|---|
| **A. Tests automáticos** | ¿Funciona el código? | Conversión de los 10 tipos de adjunto, seguridad, límites, descarga con autenticación, guardado en Mongo (en memoria) | Jira real, Forge, ngrok, Docker | segundos |
| **B1. Comprobaciones previas** | ¿Está listo el entorno para una prueba real? | Servicio, Mongo, URL de Forge, ngrok, trigger instalado, token de Jira | No crea nada | segundos |
| **B2-B4. Prueba real** | ¿Funciona todo junto con Jira de verdad? | Jira → Forge → ngrok → servicio → Mongo con un ticket real | Nada: es el flujo completo | ~1 min |

Regla práctica: el nivel A se ejecuta siempre que se toca código; la prueba real, antes de entregar o tras tocar el
trigger, la configuración de Forge o la descarga de adjuntos (lo que solo Jira real puede revelar: así aparecieron los 4
errores de `BFC-21`).

## Orden recomendado (el camino completo, de principio a fin)

1. **Preparación** (sección 3): pegar la ruta del workspace en la terminal.
2. **A1** `npx jest`: ¿funciona todo el código del servicio?
3. **A2** `npm run test:e2e`: ¿el servicio convierte bien los 10 adjuntos con un Jira falso?
4. **A4** tests del trigger: ¿el trigger monta bien el aviso?
5. *(Opcional)* **A3** el Excel hostil: ¿el servicio aguanta un fichero malicioso?
6. **B1** `node preflight.js`: ¿está listo el entorno real? Si algo sale `FAIL`, se corrige antes de seguir.
7. **B2** crear el ticket real con los 10 adjuntos (único paso manual) y apuntar su clave. **Solo cuando B1 salga en
   `PASS`**, y con los 10 ficheros subidos en el mismo formulario de creación, antes de pulsar **Crear**.
8. **B3** `node verify.js BFC-NN --timeout 600`: ¿Mongo guardó los 10 adjuntos como debía?
9. **B4** `npm run logs`: ¿el trigger se disparó una vez y el servicio lo aceptó?

Si los pasos 2 a 4 pasan y el 6 está en `PASS`, el código y el entorno están bien; los pasos 7 a 9 confirman que todo
funciona junto con Jira de verdad.

## 2. Cómo leer cualquier resultado (glosario)

| Palabra | Significa |
|---|---|
| **Test Suite** | Un fichero de pruebas. `24 passed, 24 total` = los 24 ficheros pasaron entero |
| **Tests: N passed** | Pruebas individuales que se ejecutaron y salieron bien |
| **skipped** | Prueba que **no se ejecutó a propósito** (no es un fallo ni un error). Aquí es el Excel hostil, que solo corre si se pide |
| **failed** | Una prueba falló: el resultado no fue el esperado. Es lo único que hay que investigar |
| **PASS / FAIL** (preflight y verify) | Comprobación correcta / incorrecta; cada FAIL trae debajo una pista (`->`) de qué hacer |
| **convertido (N caracteres)** | El adjunto se pasó a Markdown; N es el tamaño del texto generado |
| **unsupported** | Adjunto omitido a propósito: tipo no soportado, fichero corrupto o contenido que no coincide con su extensión |
| **too_large** | Adjunto omitido por ser demasiado grande o consumir demasiada memoria al analizarlo |
| **download_failed** | No se pudo descargar de Jira (credenciales, red, permisos) |

Las líneas largas que empiezan por `{"level":"info"...}` o `"level":"warn"` son **el registro (log) del servicio**, no
resultados. Los `warn` con `HTTP 401` o `does not match its extension` son los casos negativos que la prueba provoca a
propósito. Lo que importa está al final: `Tests: ...` y `Test Suites: ...`.

## 3. Preparación (una vez por terminal)

```powershell
$RAIZ = "C:\Users\0021260\OneDrive - ViewNext\Escritorio\VisualStudio\Bankinter\proyectos\Sistema_de _agentes_para_resolucion_de_incidencias\itsm-ticketing-agents-flujo-completo"
```

Guarda la ruta del workspace para que los comandos siguientes sean cortos. Si abres una terminal nueva, vuelve a pegarlo.

---

# Nivel A. Tests automáticos (no necesitan Docker, ni ngrok, ni Jira)

## A1. Todos los tests del servicio

```powershell
cd "$RAIZ\bkt-integration-service"
npx jest
```

**Qué mide.** Las 24 suites del servicio juntas: que cada pieza funciona sola (los conversores de PDF, Excel, PowerPoint,
Word, JSON y Markdown; la comprobación del tipo real por el contenido del fichero; los límites de tamaño, páginas,
filas y memoria; el aislamiento en hilos aparte; la descarga autenticada de Jira) y que juntas guardan bien el ticket.

**Qué verás al final y cómo leerlo:**

```text
Test Suites: 24 passed, 24 total          ← los 24 ficheros de pruebas pasaron
Tests:       1 skipped, 158 passed, 159 total
             │          │               └ 159 pruebas existen en total
             │          └ 158 se ejecutaron y salieron bien
             └ 1 no se ejecutó a propósito: el Excel hostil (paso A3)
```

**Está bien si:** `passed` coincide con `total` en las suites y no aparece ninguna línea `failed`.
**Si no:** busca la línea `FAIL src/...` y el bloque `●` de debajo, que dice qué se esperaba y qué se obtuvo.

## A2. Solo la prueba extremo a extremo del servicio (con un Jira falso)

```powershell
cd "$RAIZ\bkt-integration-service"
npm run test:e2e
```

**Qué mide.** Simula todo el camino dentro del servicio sin salir de tu equipo: un **Jira falso** (un mini servidor
local) sirve 10 ficheros pidiendo usuario y contraseña, el servicio los descarga, los convierte y los guarda en un Mongo
en memoria. La prueba comprueba, fichero por fichero, que el resultado es el esperado:

| Fichero | Qué se comprueba | Resultado esperado |
|---|---|---|
| `01_incidencia_pdf.pdf` | PDF de 2 páginas | Convertido: aparece `## Página 1` y `## Página 2` con su texto |
| `02_incidencias_excel.xlsx` | Excel con 2 hojas, una celda con `\|` y una fórmula | Convertido: una tabla por hoja; la fórmula sale con su valor (`Cerrada`). Este fichero se descarga **tras una redirección**, como hace Jira real |
| `03_revision_powerpoint.pptx` | 3 diapositivas (1, 2 y 10) | Convertido, en orden numérico y con `&amp;` decodificado a `&` |
| `04_configuracion.json` | JSON compacto | Convertido: con sangría dentro de un bloque ```` ```json ```` |
| `05_notas.md` | Markdown con tabla | Pasa tal cual |
| `06_notas_sin_extension` | Fichero sin extensión y sin firma conocida | **unsupported** (solo se aceptan tipos con firma conocida) |
| `07_excel_corrupto.xlsx` | Excel cortado a la mitad | **unsupported**, sin romper el resto |
| `08_captura.png` | Imagen | **unsupported** (imágenes fuera de alcance) |
| `09_pdf_renombrado.pdf` | Texto plano con extensión `.pdf` | **unsupported**: dice ser PDF pero su contenido no lo es |
| `10_Detalle_incidencia_informe_mensual.docx` | Word con una tabla | Convertido: la tabla conserva sus columnas y filas |

Además comprueba que: el servicio **envió las credenciales** correctas a Jira en cada descarga; la redirección se
resolvió; el ticket bruto y el ejecutado quedaron registrados; **cada adjunto omitido dejó un error anotado** en la
ejecución (4 en total); y que **con una contraseña incorrecta** todos los adjuntos quedan como `download_failed` sin romper
el ticket (segunda prueba).

**Qué verás y cómo leerlo:**

```text
PASS src/__tests__/e2e/attachments.e2e.test.ts
  E2E: ticket con adjuntos -> servicio -> Mongo (Jira falso)
    √ converts the supported attachments and skips the rest without breaking the ticket (1678 ms)
    √ marks every attachment as download_failed when Jira rejects the credentials (93 ms)
    ○ skipped discards a hostile xlsx as too_large without blocking the main thread

Test Suites: 1 passed, 1 total
Tests:       1 skipped, 2 passed, 3 total
```

- `√` = prueba superada. Entre paréntesis, lo que tardó.
- `○ skipped` = el caso del Excel hostil, **desactivado a propósito**: tarda unos 10 s y consume memoria adrede. Se activa en A3.
- **Está bien si:** `2 passed` y ningún `failed`. El `1 skipped` es lo normal.

## A3. Lo mismo, más el Excel hostil (tarda unos 15 s)

```powershell
cd "$RAIZ\bkt-integration-service"
$env:E2E_HOSTILE = '1'; npm run test:e2e; Remove-Item Env:E2E_HOSTILE
```

**Qué mide.** La **defensa frente a un fichero malicioso**. Se genera un Excel de unos 6,5 MB comprimidos que al abrirse
ocupan ~80 MB de XML repetitivo, diseñado para agotar la memoria. La prueba exige tres cosas a la vez:

1. El adjunto se descarta como **`too_large`** (el hilo aparte que lo analizaba se detuvo al llegar al límite de memoria).
2. El servicio **no se bloquea**: un "latido" que se mide cada 0,1 s no se detiene más de 1,5 s (si el análisis corriera
   en el hilo principal, el servicio quedaría congelado ~15 s).
3. El resto del flujo sigue funcionando (el ticket se guarda y responde `201`).

**Qué verás:** `Tests: 3 passed, 3 total` (ahora el hostil también corre). La última parte del comando
(`Remove-Item Env:E2E_HOSTILE`) desactiva la variable para que el siguiente `npm run test:e2e` vuelva a saltarlo.

## A4. Tests del trigger

```powershell
cd "$RAIZ\bkt-jira-triggers"
npm test -- --runInBand
```

**Qué mide.** La parte de Jira/Forge, sin Jira real: que el trigger monta bien el aviso (`payload`) con adjuntos,
descripción, prioridad, componentes y responsable; que descarta adjuntos sin nombre o con dirección inválida; que **nunca
escribe en el registro nombres de fichero, direcciones ni datos personales** (solo contadores); y cómo reacciona ante
errores HTTP del servicio.

```text
Test Suites: 5 passed, 5 total
Tests:       48 passed, 48 total
```

**Está bien si:** ambos `passed` igualan al `total`.

## A5. Tests de los analizadores del preflight

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node --test
```

**Qué mide.** Que las funciones del paso B1 interpretan bien las salidas de Forge y ngrok. Se alimentan con textos de
ejemplo, **incluido el error real que nos pasó** (la URL con `https://` repetido que causó el `403` en `BFC-23/24/25`)
y comprueba que lo detectan. No toca ningún servicio.

```text
ℹ pass 7        ← 7 comprobaciones de las funciones, todas bien
ℹ fail 0
```

---

# Nivel B. Prueba real contra Jira

**Antes necesitas:** el servicio y su Mongo en Docker, ngrok en marcha y la sesión de Forge iniciada. Si no están, mira la
guía `contexto_para_proyectos\pruebas_manuales\Pruebas_manuales_adjuntos_trigger_a_markdown.md` (apartados 5.2 y 5.3).
Para arrancar ngrok con el dominio fijo del proyecto:

```powershell
ngrok http 8000 --url=antacid-tibia-trembling.ngrok-free.dev
```

## B1. Comprobaciones previas (solo lectura)

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node preflight.js
```

**Qué mide.** Si el entorno está listo **antes de gastar un ticket**. No crea, cambia ni despliega nada y no imprime
ninguna clave.

```text
PASS  Servicio y Mongo - /health 200, base de datos conectada        ← el servicio responde y tiene su base de datos
PASS  Variable de Forge: URL del servicio - antacid-...ngrok-free.dev ← la URL que usa el trigger está bien escrita
PASS  Variables de Forge: clave y cabecera - presentes               ← existen la clave y la cabecera (solo se mira el nombre)
PASS  Tunel ngrok - antacid-...ngrok-free.dev -> http://localhost:8000 ← ngrok está abierto, es el mismo dominio que Forge y apunta al servicio
PASS  Trigger instalado - pablodefranchi.atlassian.net v26 (Up-to-date) ← el trigger está instalado en Jira
PASS  Token de Jira - GET /rest/api/3/myself -> 200                  ← el token de Jira es válido
Todo en orden: se puede crear el ticket de prueba.
```

**Está bien si:** las 6 líneas dicen `PASS`. Si alguna dice `FAIL`, justo debajo aparece `->` con qué hacer; no sigas hasta
corregirla (el comando termina con código 1). Una nota final recuerda una limitación: Forge solo aplica sus variables al
**desplegar**, y la CLI no puede decir qué URL usa el despliegue activo; si todo está en `PASS` y aun así el trigger
recibe un `403`, hay que revisar `npm run logs` y valorar un `forge deploy` (requiere autorización).

## B2. Crear el ticket con los 10 adjuntos (único paso manual)

**Cuándo hacerlo.** Justo después de B1, cuando las 6 líneas de `preflight.js` salgan en `PASS` y el mensaje diga
`Todo en orden: se puede crear el ticket de prueba`. **No lo hagas antes**: si el entorno no está listo, el ticket se
gasta sin probar nada. Y **no esperes más de la cuenta** entre B1 y este paso (si cierras ngrok o cambias algo, repite B1).
Cuando termines, apunta la clave del ticket y sigue con B3.

**Qué mide.** Es el disparador de la prueba real: crear un ticket **con los 10 adjuntos subidos en el mismo formulario
de creación** (el trigger los lee en ese momento). Por eso este paso es manual: la API de Jira no permite adjuntar al
crear, y si los ficheros se suben después de crear el ticket, el trigger puede no verlos. **No crees el ticket primero
y adjunte después**; hay que adjuntar los 10 ficheros antes de pulsar **Crear**.

**Qué hacer en la pantalla de Jira (resumen visual):**

```text
1. Pulsar [Crear]  →  2. Escribir el resumen  →  3. Arrastrar los 10 ficheros al formulario
   →  4. Esperar a que terminen las vistas previas  →  5. Pulsar [Crear]  →  6. Apuntar la clave (BFC-NN)
```

1. Abre la carpeta de los ficheros:

```powershell
explorer "$RAIZ\contexto_para_proyectos\pruebas_manuales\documentos_prueba"
```

2. En Jira (proyecto BFC) pulsa **Crear** y escribe un resumen (por ejemplo `[PRUEBA E2E] adjuntos`).
3. Arrastra al formulario los 10 ficheros (todos menos `LEEME.md` y `prueba_aislamiento_excel_hostil.js`):
   `01_incidencia_pdf.pdf`, `02_incidencias_excel.xlsx`, `03_revision_powerpoint.pptx`, `04_configuracion.json`,
   `05_notas.md`, `06_notas_sin_extension`, `07_excel_corrupto.xlsx`, `08_captura.png`, `09_pdf_renombrado.pdf` y
   `10_Detalle_incidencia_informe_mensual.docx`.
4. Espera a que terminen las vistas previas y pulsa **Crear**. Apunta la clave del ticket (por ejemplo `BFC-30`).

## B3. Verificar en Mongo (cambia `BFC-30` por tu clave)

```powershell
cd "$RAIZ\bkt-integration-service\e2e"
node verify.js BFC-30 --timeout 600
```

**Qué mide.** Lo que **realmente guardó el servicio** para ese ticket en Mongo: compara cada uno de los 10 adjuntos con
`expected.json` (la misma tabla del paso A2). Espera hasta 600 s a que el ticket llegue y es de solo lectura. Forge puede tardar varios minutos en entregar el evento real de Jira; un fallo con el timeout corto no significa necesariamente que el servicio este roto.

```text
PASS  01_incidencia_pdf.pdf - convertido (383 caracteres)   ← se convirtió a Markdown; salieron 383 caracteres y contiene lo esperado
...
PASS  06_notas_sin_extension - unsupported                  ← se omitió, tal como se esperaba
...
Todo coincide con expected.json (10 adjuntos).
```

- `convertido (N caracteres)`: el adjunto pasó a Markdown y contiene los fragmentos que debía (títulos, tablas...).
- `unsupported`: el adjunto se omitió **y debía omitirse** (fichero corrupto, imagen, tipo sin firma conocida o renombrado).
- **Está bien si:** 10 líneas `PASS` y la frase final. **Si no:** cada `FAIL` dice qué difiere (por ejemplo `se omitió
  (download_failed)` o `faltan fragmentos`). Si dice `no tiene attachedDocuments`, revisa la traza de Forge, la traza del servicio y que el verificador este mirando el mismo Mongo que usa el contenedor arrancado: ve a B4.

## B4. Ver la traza del trigger en Forge

```powershell
cd "$RAIZ\bkt-jira-triggers"
npm run logs
```

**Qué mide.** Qué hizo el trigger **dentro de Forge** (que no se ve desde Mongo). Para tu ticket debe aparecer:

```text
Invocaciones            1     ← el trigger se disparó una vez
Tickets                 BFC-30
Enviados y aceptados    1     ← el servicio respondió 201 (lo aceptó)
Enviados con fallo      0     ← ningún error HTTP (un 403 aparecería aquí)
Titulos en claro        0     ← correcto: el registro no contiene el título del ticket (privacidad)
```

---

## Si algo falla

| Síntoma | Qué significa y qué hacer |
|---|---|
| `npx jest` falla con "ran out of memory" | Se agotó la memoria del equipo durante un test de límite de memoria; cierra aplicaciones y repite, y si persiste avisa |
| `preflight.js` → `Servicio y Mongo` FAIL | El servicio o su Mongo no están en marcha: levantar los contenedores |
| `preflight.js` → `Tunel ngrok` FAIL | ngrok no está abierto o apunta a otro dominio/puerto: arrancarlo con el comando de la parte B |
| `preflight.js` → variable de Forge con `https://` repetido | Es el error que causó el `403` de `BFC-23/24/25`: corregir la variable y volver a desplegar (requiere autorización; guía, 5.3) |
| `preflight.js` → `Token de Jira` 401 | El token caducó: regenerarlo y actualizar el `.env` del servicio |
| `verify.js` → "no tiene attachedDocuments" | Revisar `npm run logs`, la traza del servicio y que Mongo/contenedor coincidan; puede ser trigger, timing o verificador mirando otra colección |
| `verify.js` → algún adjunto `FAIL` | El servicio convirtió distinto a lo esperado: abrir el ticket en Mongo o revisar el log del servicio |

## Ficheros de esta carpeta y variables opcionales

| Fichero | Para qué |
|---|---|
| `preflight.js` | Comprobaciones previas (B1), solo lectura |
| `lib.js` | Funciones puras de `preflight.js` (leen las tablas de Forge y la API de ngrok) |
| `preflight.test.js` | Pruebas de `lib.js` con salidas de ejemplo (A5) |
| `verify.js` + `expected.json` | Verificación en Mongo (B3) y resultado esperado de los 10 adjuntos |

Variables opcionales de `preflight.js`: `E2E_SERVICE_URL` (por defecto `http://127.0.0.1:8000`), `E2E_SERVICE_CONTAINER`
(por defecto `bkt-integration-service`), `E2E_TRIGGERS_DIR` (por defecto `../../bkt-jira-triggers`) y `E2E_FORGE_ENV` (por
defecto `development`). De `verify.js`: `E2E_MONGO_CONTAINER` (por defecto `bkt-integration-service-mongo-1`).

No despliega, no cambia variables de Forge, no escribe en Jira y no imprime secretos: el token de Jira se prueba
**dentro** del contenedor con sus propias variables y Mongo se consulta con las credenciales del propio contenedor.

Verificado el 2 de octubre con `BFC-29`: preflight 6 de 6, ticket creado desde el navegador con los 10 adjuntos,
`verify.js` 10 de 10 en 1 s y traza de Forge con 1 invocación aceptada y 0 fallos.

---

## Hacer que corran solas al subir código (CI de GitLab)

Hoy ningún repo tiene CI: las pruebas se lanzan a mano con los pasos de arriba. Para que GitLab las ejecute en cada
subida, hay que crear un fichero `.gitlab-ci.yml` en la raíz de cada repo. **Sin probar todavía en GitLab**: la primera
vez, subirlo a una rama de trabajo y mirar **Build → Pipelines**. Solo el nivel A (`npx jest` y los tests del trigger)
vale para CI; `preflight.js` y `verify.js` dependen de este equipo (ngrok, Forge, Mongo local) y no.

`bkt-integration-service/.gitlab-ci.yml` (Node 22, pnpm; imagen Debian, no Alpine, porque Mongo en memoria no
funciona en Alpine):

```yaml
image: node:22-bookworm

stages: [test]

variables:
  PNPM_HOME: "$CI_PROJECT_DIR/.pnpm-store"
  MONGOMS_DOWNLOAD_DIR: "$CI_PROJECT_DIR/.cache/mongodb-binaries"

cache:
  key:
    files: [pnpm-lock.yaml]
  paths:
    - .pnpm-store
    - .cache/mongodb-binaries

tests:
  stage: test
  script:
    - corepack enable
    - pnpm install --frozen-lockfile
    - pnpm typecheck
    - pnpm lint
    - pnpm test
    - pnpm openapi:check
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH
```

`bkt-jira-triggers/.gitlab-ci.yml` (Node 24, npm):

```yaml
image: node:24-bookworm

stages: [test]

cache:
  key:
    files: [package-lock.json]
  paths: [.npm]

tests:
  stage: test
  script:
    - npm ci --cache .npm --prefer-offline
    - npm run typecheck
    - npm run lint
    - npm test -- --runInBand
  rules:
    - if: $CI_PIPELINE_SOURCE == "merge_request_event"
    - if: $CI_COMMIT_BRANCH
```

Después: subir el fichero a la rama de trabajo (clon limpio, `git add .gitlab-ci.yml`, sin tocar `main`) y abrir
**Build → Pipelines** en GitLab. Verde = los tests pasan; rojo = pulsar el trabajo `tests` para ver el log. Para
obligar a que pase antes de fusionar: **Settings → Merge requests → Pipelines must succeed** (requiere permisos de
mantenedor). Problemas típicos del primer pipeline: no hay *runner* disponible (el trabajo queda "pending": pedir al
equipo de plataforma el runner y su `tags:`), o el runner no tiene salida a internet para descargar el binario de
`mongod` que usa Mongo en memoria.
