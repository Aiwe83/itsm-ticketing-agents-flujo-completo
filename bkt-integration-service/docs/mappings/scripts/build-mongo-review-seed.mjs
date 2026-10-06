import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const contextRef = 'pilot-local';
const meshId = 'REVIEW-NOT-OPERATIONAL';
const databaseName = 'integration-service';
const collectionName = 'mapping_catalog_review';
const updatedAt = '2026-08-14T00:00:00.000Z';

const sources = {
  catalog: 'docs/mappings/contexts/pilot-local/catalog.json',
  alta: 'docs/mappings/contexts/pilot-local/alta-data-matrix.md',
  solucion: 'docs/mappings/contexts/pilot-local/solucion-data-matrix.md',
  impacto: 'docs/mappings/contexts/pilot-local/impacto-data-matrix.md',
  imputacion: 'docs/mappings/contexts/pilot-local/imputacion-timeentries.md',
  modelReference: 'docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md',
  exampleTicket: 'docs/mappings/modelo_de_datos_mappeos_nuevos/ejemplo_ticket.json',
};

const outputPath =
  'docs/mappings/evidence/pilot-local/mapping-catalog-review-seed.js';

function readText(relativePath) {
  const fullPath = path.join(repoRoot, relativePath);
  return readFileSync(fullPath, 'utf8');
}

function readJson(relativePath) {
  return JSON.parse(readText(relativePath));
}

function slug(value) {
  return String(value ?? 'sin-valor')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function baseDoc(docType, generatedFrom) {
  return {
    docType,
    meshId,
    contextRef,
    generatedFrom,
    updatedAt,
  };
}

function decisionFromEvidence(evidence) {
  if (!evidence) {
    return 'pending-validation';
  }

  return evidence.confidence === 'confirmed' ? 'confirmed' : 'pending-validation';
}

function mappingFieldDoc(mapping, index) {
  const target = mapping.targetField ?? `target-${index}`;
  const source = mapping.sourceField ?? `source-${index}`;

  return {
    _id: `field:${contextRef}:mapping:${slug(target)}:${slug(source)}`,
    ...baseDoc('field', sources.catalog),
    section: 'Catalogo confirmado',
    formField: mapping.description ?? target,
    sourceField: source,
    targetField: target,
    decision: decisionFromEvidence(mapping._evidence),
    engineBlocked: false,
    evidence: mapping._evidence ?? {
      source: 'catalog.json',
      confidence: 'pending-validation',
      notes: 'Entrada sin evidencia documental explicita.',
    },
    futureMapping: {
      sourceField: source,
      targetField: target,
      transformer: mapping.transformer,
      required: Boolean(mapping.required),
      description: mapping.description,
      options: mapping.options ?? {},
    },
  };
}

function coverageFieldDoc(entry, group, index) {
  const target = entry.targetField ?? entry.target ?? 'pending';
  const formField = entry.formField ?? entry.sourceField ?? target;
  const decision = entry.decision ?? 'pending-validation';

  return {
    _id: `field:${contextRef}:${slug(group)}:${slug(formField)}:${index}`,
    ...baseDoc('field', sources.catalog),
    section: group,
    formField,
    sourceField: entry.sourceField ?? entry.candidateSourceField ?? null,
    targetField: target,
    decision,
    engineBlocked: Boolean(entry.engineBlocked),
    evidence: {
      source: entry.sourceField ? 'catalog.json' : 'functional-model',
      confidence: decision === 'confirmed' ? 'confirmed' : 'pending-validation',
      notes: entry.notes ?? entry.reason ?? 'Pendiente de validar con evidencia Jira.',
    },
    ...(decision === 'confirmed' && entry.sourceField
      ? {
          futureMapping: {
            sourceField: entry.sourceField,
            targetField: target,
            transformer: 'copy',
            required: Boolean(entry.required),
            description: entry.notes ?? `Mapping futuro para ${formField}.`,
            options: {},
          },
        }
      : {}),
  };
}

function parseMarkdownMatrix(relativePath, sectionName) {
  const text = readText(relativePath);
  const rows = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line.startsWith('|') || line.includes('---')) {
      continue;
    }

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim().replace(/^`|`$/g, ''));

    if (cells[0] === 'Campo funcional') {
      continue;
    }

    if (cells.length >= 7) {
      rows.push({
        section: sectionName,
        formField: cells[0],
        modelField: cells[1].replace(/`/g, ''),
        jiraEvidence: cells[2],
        targetField: cells[3].replace(/`/g, ''),
        evidenceAvailable: cells[4],
        decision: cells[5],
        engineBlocked: cells[6].toLowerCase() === 'true',
        reason: cells[7] ?? '',
      });
    }
  }

  return rows;
}

function matrixFieldDoc(entry, relativePath, index) {
  const target =
    !entry.targetField ||
    entry.targetField.toLowerCase() === 'pendiente' ||
    entry.targetField.toLowerCase() === 'pending'
      ? null
      : entry.targetField;
  const sourceField =
    entry.jiraEvidence?.startsWith('fields.') || entry.jiraEvidence === 'key'
      ? entry.jiraEvidence
      : null;
  const decision = entry.decision || 'pending-validation';

  return {
    _id: `field:${contextRef}:matrix:${slug(entry.section)}:${slug(entry.formField)}:${index}`,
    ...baseDoc('field', relativePath),
    section: entry.section,
    formField: entry.formField,
    modelField: entry.modelField,
    sourceField,
    targetField: target,
    decision,
    engineBlocked: entry.engineBlocked,
    evidence: {
      source: relativePath,
      confidence: entry.evidenceAvailable === 'si' ? 'confirmed' : 'pending-validation',
      notes: entry.reason,
    },
    ...(decision === 'confirmed' && sourceField && target
      ? {
          futureMapping: {
            sourceField,
            targetField: target,
            transformer: 'copy',
            required: false,
            description: `Mapping futuro para ${entry.formField}.`,
            options: {},
          },
        }
      : {}),
  };
}

function modelReferenceDoc(relativePath, title, extra = {}) {
  const text = readText(relativePath);

  return {
    _id: `model-reference:${contextRef}:${slug(title)}`,
    ...baseDoc('model-reference', relativePath),
    title,
    sourcePath: relativePath,
    lineCount: text.split(/\r?\n/).length,
    summary: 'Referencia documental disponible en Git para revisar el modelo funcional.',
    ...extra,
  };
}

// Parte el modelo funcional por sus cabeceras `# SECCION N - Titulo`. Cada seccion
// se emite despues como un documento propio CON su texto, para poder leer el modelo
// entero desde Compass sin abrir el fichero .md.
function splitModelSections(relativePath) {
  const lines = readText(relativePath).split(/\r?\n/);
  const sections = [];
  let current = null;

  for (const line of lines) {
    const heading = /^#\s+SECCI[ÓO]N\s+(\d+)\s*[—–-]\s*(.+?)\s*$/u.exec(line);

    if (heading) {
      if (current) {
        sections.push(current);
      }
      current = { number: Number(heading[1]), title: heading[2], lines: [] };
      continue;
    }

    if (current) {
      current.lines.push(line);
    }
  }

  if (current) {
    sections.push(current);
  }

  return sections;
}

function modelSectionDoc(section, relativePath) {
  const body = section.lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();

  return {
    _id: `model-reference:${contextRef}:seccion-${section.number}-${slug(section.title)}`,
    ...baseDoc('model-reference', relativePath),
    title: `Seccion ${section.number} - ${section.title}`,
    sectionNumber: section.number,
    sectionTitle: section.title,
    sourcePath: relativePath,
    lineCount: section.lines.length,
    summary: `Texto funcional completo de la seccion ${section.number} (${section.title}).`,
    body,
  };
}

// Las notas del modelo (`## Notas de la seccion N`) son el contenido con mas valor
// para revisar: explican por que un campo no es un mapping directo. Se emiten ademas
// como gotcha propios para poder filtrarlos sueltos, sin dejar de estar en `body`.
function modelNoteGotchas(sections, relativePath) {
  const docs = [];

  for (const section of sections) {
    const body = section.lines.join('\n');
    const notesStart = body.search(/^##\s+Notas de la secci[óo]n/imu);

    if (notesStart === -1) {
      continue;
    }

    const bullets = body
      .slice(notesStart)
      .split(/\r?\n/)
      .slice(1)
      .filter((line) => /^\s*-\s+\S/.test(line));

    bullets.forEach((line, index) => {
      const message = line.replace(/^\s*-\s+/, '').trim();
      const label = /^\*\*(.+?)\*\*/u.exec(message);
      const title = label ? label[1].trim() : `Nota ${index + 1}`;

      docs.push(
        gotchaDoc(
          `seccion-${section.number}-nota-${index + 1}`,
          title,
          message,
          relativePath,
          {
            scope: 'functional',
            sectionNumber: section.number,
            sectionTitle: section.title,
          },
        ),
      );
    });
  }

  return docs;
}

function gotchaDoc(id, title, message, sourcePath, extra = {}) {
  return {
    _id: `gotcha:${contextRef}:${slug(id)}`,
    ...baseDoc('gotcha', sourcePath),
    title,
    message,
    scope: 'design',
    ...extra,
  };
}

function sanitizeExample(value, key = '') {
  if (Array.isArray(value)) {
    return value.map((item, index) => sanitizeExample(item, `${key}.${index}`));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([entryKey, entryValue]) => [
        entryKey,
        sanitizeExample(entryValue, entryKey),
      ]),
    );
  }

  if (typeof value !== 'string') {
    return value;
  }

  const loweredKey = key.toLowerCase();

  if (loweredKey.includes('email')) {
    return 'usuario@example.invalid';
  }

  if (loweredKey.includes('accountid')) {
    return 'account-example';
  }

  if (loweredKey === 'displayname') {
    return 'Usuario de ejemplo';
  }

  if (loweredKey === 'summary') {
    return 'Ticket de ejemplo sanitizado para revisar mappings';
  }

  if (
    [
      'description',
      'actualresult',
      'expectedresult',
      'stepstoreproduce',
      'errormessage',
      'functionalsolutiondescription',
      'executedstatement',
      'informationrequestedfromreporter',
    ].includes(loweredKey)
  ) {
    return 'Texto sanitizado para demo del modelo de datos.';
  }

  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, 'usuario@example.invalid')
    .replace(/bankinter/gi, 'organizacion-ejemplo')
    .replace(/proveedor-externo/gi, 'proveedor-ejemplo');
}

function exampleTicketDoc() {
  const example = readJson(sources.exampleTicket);
  const sanitized = sanitizeExample(example);

  sanitized.id = 'example-ticket-id';
  sanitized.key = 'EXAMPLE-001';

  return {
    _id: `example-ticket:${contextRef}:example-001`,
    ...baseDoc('example-ticket', sources.exampleTicket),
    title: 'Ticket de ejemplo sanitizado',
    ticket: sanitized,
  };
}

function assertNoForbiddenContent(docs) {
  const serialized = JSON.stringify(docs);
  const legacyStatusTarget = ['content', 'statusSp'].join('.');

  if (serialized.includes(legacyStatusTarget)) {
    throw new Error('Forbidden legacy status target detected');
  }

  for (const doc of docs) {
    if (doc.meshId !== meshId) {
      throw new Error(`Unexpected meshId in ${doc._id}: ${doc.meshId}`);
    }
  }

  const sensitivePatterns = [/@bankinter\./i, /@proveedor-/i];
  for (const pattern of sensitivePatterns) {
    if (pattern.test(serialized)) {
      throw new Error(`Sensitive value detected by pattern ${pattern}`);
    }
  }
}

function buildDocs() {
  const catalog = readJson(sources.catalog);
  const modelSections = splitModelSections(sources.modelReference);

  if (modelSections.length === 0) {
    throw new Error(`No sections parsed from ${sources.modelReference}`);
  }

  const matrixSources = [
    [sources.alta, 'Alta'],
    [sources.solucion, 'Solucion'],
    [sources.impacto, 'Impacto'],
  ];

  const docs = [
    ...(catalog.mappings ?? []).map(mappingFieldDoc),
    ...(catalog.basicDataCoverage ?? []).map((entry, index) =>
      coverageFieldDoc(entry, 'Datos basicos', index),
    ),
    ...(catalog.pendingCandidates ?? []).map((entry, index) =>
      coverageFieldDoc(entry, 'Candidatos pendientes', index),
    ),
    ...(catalog.excludedFields ?? []).map((entry, index) =>
      coverageFieldDoc({ ...entry, decision: 'excluded' }, 'Campos excluidos', index),
    ),
    ...(catalog.engineBlockedCandidates ?? []).map((entry, index) =>
      coverageFieldDoc(entry, 'Bloqueados por motor', index),
    ),
    ...matrixSources.flatMap(([relativePath, sectionName]) =>
      parseMarkdownMatrix(relativePath, sectionName).map((entry, index) =>
        matrixFieldDoc(entry, relativePath, index),
      ),
    ),
    modelReferenceDoc(sources.catalog, 'Catalogo Jira a modelo interno', {
      schemaVersion: catalog.schemaVersion,
      catalogStatus: catalog.status,
    }),
    ...modelSections.map((section) => modelSectionDoc(section, sources.modelReference)),
    modelReferenceDoc(sources.imputacion, 'Imputacion y timeEntries bloqueado', {
      engineBlocked: true,
    }),
    ...modelNoteGotchas(modelSections, sources.modelReference),
    gotchaDoc(
      'collection-separation',
      'Coleccion documental separada',
      '`mapping_catalog_review` no sustituye ni modifica la coleccion operativa `mappings`.',
      sources.catalog,
    ),
    gotchaDoc(
      'sentinel-mesh',
      'Mesh no operativo',
      'Todos los documentos usan `REVIEW-NOT-OPERATIONAL` para evitar que se confundan con mappings reales.',
      sources.catalog,
    ),
    gotchaDoc(
      'status-target',
      'Estado actual',
      'El destino correcto del estado es `content.status`; no se debe recuperar el nombre legacy de estado.',
      sources.catalog,
    ),
    gotchaDoc(
      'timeentries-blocked',
      'Imputacion bloqueada',
      '`timeEntries[]` requiere una coleccion hija o flujo especializado; no se carga como mapping plano.',
      sources.imputacion,
    ),
    exampleTicketDoc(),
  ];

  assertNoForbiddenContent(docs);
  return docs;
}

function buildSeed(docs) {
  return `// Source script: docs/mappings/scripts/build-mongo-review-seed.mjs
// Source of truth: Git. MongoDB collection: ${databaseName}.${collectionName}
// Safe to run multiple times. This script never calls drop().

const dbName = '${databaseName}';
const collectionName = '${collectionName}';
const reviewMeshId = '${meshId}';
const docs = ${JSON.stringify(docs, null, 2)};

if (docs.some((doc) => doc.meshId !== reviewMeshId)) {
  throw new Error('Unexpected meshId found in review seed');
}

const legacyStatusTarget = ['content', 'statusSp'].join('.');
if (JSON.stringify(docs).includes(legacyStatusTarget)) {
  throw new Error('Forbidden legacy status target detected');
}

const reviewDb = db.getSiblingDB(dbName);
const collection = reviewDb.getCollection(collectionName);

const result = collection.bulkWrite(
  docs.map((doc) => ({
    updateOne: {
      filter: { _id: doc._id },
      update: { $set: doc },
      upsert: true,
    },
  })),
  { ordered: true },
);

collection.createIndex({ docType: 1, decision: 1 }, { name: 'docType_1_decision_1' });

printjson({
  database: dbName,
  collection: collectionName,
  result,
  countByDocType: docs.reduce((acc, doc) => {
    acc[doc.docType] = (acc[doc.docType] || 0) + 1;
    return acc;
  }, {}),
});
`;
}

const docs = buildDocs();
const countByDocType = docs.reduce((acc, doc) => {
  acc[doc.docType] = (acc[doc.docType] || 0) + 1;
  return acc;
}, {});

mkdirSync(path.dirname(path.join(repoRoot, outputPath)), { recursive: true });
writeFileSync(path.join(repoRoot, outputPath), buildSeed(docs), 'utf8');

console.log(
  JSON.stringify(
    {
      outputPath,
      total: docs.length,
      countByDocType,
    },
    null,
    2,
  ),
);
