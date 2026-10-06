// Source script: docs/mappings/scripts/build-mongo-review-seed.mjs
// Source of truth: Git. MongoDB collection: integration-service.mapping_catalog_review
// Safe to run multiple times. This script never calls drop().

const dbName = 'integration-service';
const collectionName = 'mapping_catalog_review';
const reviewMeshId = 'REVIEW-NOT-OPERATIONAL';
const docs = [
  {
    "_id": "field:pilot-local:mapping:itsmticketid:key",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Clave de incidencia de Jira usada como referencia interna del ticket.",
    "sourceField": "key",
    "targetField": "itsmTicketId",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example",
      "confidence": "confirmed",
      "notes": "Los ejemplos de Jira incluyen key y el ejemplo de mapping asigna key a itsmTicketId."
    },
    "futureMapping": {
      "sourceField": "key",
      "targetField": "itsmTicketId",
      "transformer": "copy",
      "required": true,
      "description": "Clave de incidencia de Jira usada como referencia interna del ticket.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:mapping:tickettype:fields-issuetype-name",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Nombre del tipo de incidencia de Jira usado como tipo interno del ticket.",
    "sourceField": "fields.issuetype.name",
    "targetField": "ticketType",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example | functional-form",
      "confidence": "confirmed",
      "notes": "The Jira examples include fields.issuetype.name and the Datos basicos form confirms this as Tipo de incidencia."
    },
    "futureMapping": {
      "sourceField": "fields.issuetype.name",
      "targetField": "ticketType",
      "transformer": "copy",
      "required": false,
      "description": "Nombre del tipo de incidencia de Jira usado como tipo interno del ticket.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:mapping:content-issuedescription:fields-description",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Descripción principal de Jira copiada en la descripción interna del ticket.",
    "sourceField": "fields.description",
    "targetField": "content.issueDescription",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example | translated-ticket-example",
      "confidence": "confirmed",
      "notes": "Los ejemplos en bruto y traducido contienen el valor de description, y el ejemplo de mapping define este destino."
    },
    "futureMapping": {
      "sourceField": "fields.description",
      "targetField": "content.issueDescription",
      "transformer": "copy",
      "required": false,
      "description": "Descripción principal de Jira copiada en la descripción interna del ticket.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:mapping:content-title:fields-summary",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Título visible o referencia del ticket interno.",
    "sourceField": "fields.summary",
    "targetField": "content.title",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example | translated-ticket-example",
      "confidence": "confirmed",
      "notes": "El endpoint requiere fields.summary y el ejemplo de mapping lo asigna a content.title."
    },
    "futureMapping": {
      "sourceField": "fields.summary",
      "targetField": "content.title",
      "transformer": "copy",
      "required": true,
      "description": "Título visible o referencia del ticket interno.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:mapping:content-status:fields-status-name",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Nombre actual del estado de Jira copiado al campo interno de estado.",
    "sourceField": "fields.status.name",
    "targetField": "content.status",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example | translated-ticket-example",
      "confidence": "confirmed",
      "notes": "La implementación actual y los ejemplos usan content.status."
    },
    "futureMapping": {
      "sourceField": "fields.status.name",
      "targetField": "content.status",
      "transformer": "copy",
      "required": false,
      "description": "Nombre actual del estado de Jira copiado al campo interno de estado.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:mapping:content-severitylevel:fields-priority-name",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Catalogo confirmado",
    "formField": "Nombre de la prioridad de Jira copiado al nivel interno de severidad.",
    "sourceField": "fields.priority.name",
    "targetField": "content.severityLevel",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "ticket-example | mapping-example | translated-ticket-example",
      "confidence": "confirmed",
      "notes": "El ticket de ejemplo contiene priority.name y el ejemplo traducido lo guarda como severityLevel. Esto va separado de los campos de urgencia de negocio hasta que se valide."
    },
    "futureMapping": {
      "sourceField": "fields.priority.name",
      "targetField": "content.severityLevel",
      "transformer": "copy",
      "required": false,
      "description": "Nombre de la prioridad de Jira copiado al nivel interno de severidad.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:pais-afectado:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Pais afectado",
    "sourceField": null,
    "targetField": "content.affectedCountry",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "No se añade ningún mapping hasta confirmar el campo real de Jira y los valores permitidos de país."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:tipo-de-incidencia:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Tipo de incidencia",
    "sourceField": "fields.issuetype.name",
    "targetField": "ticketType",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "confirmed",
      "notes": "Cubierto por el mapping actual de tipo de incidencia."
    },
    "futureMapping": {
      "sourceField": "fields.issuetype.name",
      "targetField": "ticketType",
      "transformer": "copy",
      "required": false,
      "description": "Cubierto por el mapping actual de tipo de incidencia.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:solicitante:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Solicitante",
    "sourceField": null,
    "targetField": "content.requestorId",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía reporter, creator u otro campo de solicitante."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:empresa:3",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Empresa",
    "sourceField": null,
    "targetField": "content.requestorCompany",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía este campo o si se obtiene de los datos del solicitante."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:departamento:4",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Departamento",
    "sourceField": null,
    "targetField": "content.requestorDepartment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía este campo o si se obtiene de los datos del solicitante."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:centro:5",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Centro",
    "sourceField": null,
    "targetField": "content.requestorCenter",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía este campo o si se obtiene de los datos del solicitante."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:direccion-general:6",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Direccion general",
    "sourceField": null,
    "targetField": "content.requestorDivision",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía este campo o si se obtiene de los datos del solicitante."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:fecha-hora-apertura:7",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Fecha / hora apertura",
    "sourceField": null,
    "targetField": "content.openedAt",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "fields.created es solo un candidato hasta que negocio lo confirme."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:compromiso-de-resolucion:8",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Compromiso de resolucion",
    "sourceField": null,
    "targetField": "content.resolutionCommitment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hay que confirmar si Jira envía este valor o si se calcula mediante reglas de SLA."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:aplicacion-afectada:9",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Aplicacion afectada",
    "sourceField": null,
    "targetField": "content.affectedApplication",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta el campo real de Jira y el catálogo de aplicaciones."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:entorno:10",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Entorno",
    "sourceField": null,
    "targetField": "content.environment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "customfield_10147.value se observó como candidato de tipo opción, pero su significado funcional no está confirmado."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:responsable-de-la-empresa-externa:11",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Responsable de la empresa externa",
    "sourceField": null,
    "targetField": "content.externalCompanyResponsible",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Puede ser assignee o una regla derivada de la aplicación y del entorno."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:en-garantia-de-proyecto:12",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "En garantia de proyecto",
    "sourceField": null,
    "targetField": "content.projectWarranty",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "customfield_10152.value se observó como candidato de tipo sí/no, pero su significado funcional no está confirmado."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:codigo-proyecto:13",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Codigo proyecto",
    "sourceField": null,
    "targetField": "content.projectCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta el campo real de Jira y validar el formato esperado."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:es-urgente:14",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Es Urgente",
    "sourceField": null,
    "targetField": "content.isUrgent",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "No debe asumirse que equivale a la prioridad de Jira."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:motivo-de-urgencia:15",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Motivo de urgencia",
    "sourceField": null,
    "targetField": "content.urgencyReason",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar el origen y puede aplicar solo cuando se marque como urgente."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:grado-de-urgencia:16",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Grado de urgencia",
    "sourceField": null,
    "targetField": "content.urgencyLevel",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta validar la escala funcional de urgencia y su separación de severityLevel."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:referencia:17",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Referencia",
    "sourceField": "fields.summary",
    "targetField": "content.title",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "confirmed",
      "notes": "Cubierto por el mapping actual de summary a title."
    },
    "futureMapping": {
      "sourceField": "fields.summary",
      "targetField": "content.title",
      "transformer": "copy",
      "required": false,
      "description": "Cubierto por el mapping actual de summary a title.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:descripcion:18",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Descripcion",
    "sourceField": "fields.description",
    "targetField": "content.issueDescription",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "confirmed",
      "notes": "Cubierto por el mapping actual de description."
    },
    "futureMapping": {
      "sourceField": "fields.description",
      "targetField": "content.issueDescription",
      "transformer": "copy",
      "required": false,
      "description": "Cubierto por el mapping actual de description.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:resultado-obtenido:19",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Resultado obtenido",
    "sourceField": null,
    "targetField": "content.actualResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si es un campo separado o si forma parte de description."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:resultado-esperado:20",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Resultado esperado",
    "sourceField": null,
    "targetField": "content.expectedResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si es un campo separado o si forma parte de description."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:reproduccion-del-problema:21",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Reproduccion del problema",
    "sourceField": null,
    "targetField": "content.reproductionSteps",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si es un campo separado o si forma parte de description."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:mensaje-de-error-literal:22",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Mensaje de error literal",
    "sourceField": null,
    "targetField": "content.errorMessage",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si es un campo separado o si forma parte de description."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:codigo-de-error:23",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Codigo de error",
    "sourceField": null,
    "targetField": "content.errorCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si es un campo separado o si forma parte de description."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:adjuntos:24",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Adjuntos",
    "sourceField": null,
    "targetField": "content.attachedDocuments",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Attachments are processed by the attachment flow and are not regular field mappings."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:hora-del-incidente:25",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Hora del incidente",
    "sourceField": null,
    "targetField": "content.incidentTime",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta confirmar si llega como campo separado de Jira o si se deriva de otra fecha."
    }
  },
  {
    "_id": "field:pilot-local:datos-basicos:usuario-o-numero-de-persona-afectada:26",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Datos basicos",
    "formField": "Usuario o numero de persona afectada",
    "sourceField": null,
    "targetField": "content.affectedUser",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Hace falta el campo real de Jira y el formato de valor esperado."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:pais-afectado:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Pais afectado",
    "sourceField": null,
    "targetField": "content.affectedCountry",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The real Jira source field and allowed values are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:solicitante:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Solicitante",
    "sourceField": null,
    "targetField": "content.requestorId",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The requester could come from reporter, creator, or another Jira field. Modelo funcional nuevo (json_modelo_datos _1.md) confirma que reporter y creator son campos nativos de Jira, pero eso no resuelve cual de los dos usar ni que representacion de persona necesita el consumidor (accountId, displayName o email)."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:empresa:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Empresa",
    "sourceField": null,
    "targetField": "content.requestorCompany",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be sent by Jira or obtained from requester data."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:departamento:3",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Departamento",
    "sourceField": null,
    "targetField": "content.requestorDepartment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be sent by Jira or obtained from requester data."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:centro:4",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Centro",
    "sourceField": null,
    "targetField": "content.requestorCenter",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be sent by Jira or obtained from requester data."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:direccion-general:5",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Direccion general",
    "sourceField": null,
    "targetField": "content.requestorDivision",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be sent by Jira or obtained from requester data."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fecha-hora-apertura:6",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Fecha / hora apertura",
    "sourceField": null,
    "targetField": "content.openedAt",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "fields.created is only a candidate until business validates it. Modelo funcional nuevo confirma created como campo nativo de Jira; ademas de la validacion de negocio, sigue pendiente documentar formato y zona horaria antes de poder confirmarlo."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:compromiso-de-resolucion:7",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Compromiso de resolucion",
    "sourceField": null,
    "targetField": "content.resolutionCommitment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be calculated by SLA rules instead of copied from the payload."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:aplicacion-afectada:8",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Aplicacion afectada",
    "sourceField": null,
    "targetField": "content.affectedApplication",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The real Jira field and application catalog are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:entorno:9",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Entorno",
    "sourceField": "fields.customfield_10147.value",
    "targetField": "content.environment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Observed value shape only; field name and functional meaning are not confirmed. CONFLICTO SIN RESOLVER: el modelo funcional nuevo marca Entorno como campo NATIVO de Jira (fields.environment), un origen distinto de este candidato customfield_10147. Hay dos posibles sourceField para el mismo destino; no confirmar ninguno hasta verificar contra un payload real cual usa este Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:responsable-de-la-empresa-externa:10",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Responsable de la empresa externa",
    "sourceField": null,
    "targetField": "content.externalCompanyResponsible",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It may be assignee or a rule by application and environment."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:en-garantia-de-proyecto:11",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "En garantia de proyecto",
    "sourceField": "fields.customfield_10152.value",
    "targetField": "content.projectWarranty",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Observed yes/no shape only; field name and functional meaning are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:codigo-proyecto:12",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Codigo proyecto",
    "sourceField": null,
    "targetField": "content.projectCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The real Jira field and expected format are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:es-urgente:13",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Es Urgente",
    "sourceField": null,
    "targetField": "content.isUrgent",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Business urgency must not be inferred from Jira priority without validation."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:motivo-de-urgencia:14",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Motivo de urgencia",
    "sourceField": null,
    "targetField": "content.urgencyReason",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The real Jira field and conditional rule are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:grado-de-urgencia:15",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Grado de urgencia",
    "sourceField": null,
    "targetField": "content.urgencyLevel",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The functional urgency scale is not confirmed and is separate from severityLevel. AVISO: el modelo funcional nuevo mapea Grado de urgencia directamente a priority, el mismo campo Jira ya confirmado como content.severityLevel. No fusionar: este catalogo trata urgencia y severidad como conceptos distintos hasta que negocio decida lo contrario explicitamente."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:resultado-obtenido:16",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Resultado obtenido",
    "sourceField": null,
    "targetField": "content.actualResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate field or inside description."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:resultado-esperado:17",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Resultado esperado",
    "sourceField": null,
    "targetField": "content.expectedResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate field or inside description."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:reproduccion-del-problema:18",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Reproduccion del problema",
    "sourceField": null,
    "targetField": "content.reproductionSteps",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate field or inside description."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:mensaje-de-error-literal:19",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Mensaje de error literal",
    "sourceField": null,
    "targetField": "content.errorMessage",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate field or inside description."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:codigo-de-error:20",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Codigo de error",
    "sourceField": null,
    "targetField": "content.errorCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate field or inside description."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:hora-del-incidente:21",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Hora del incidente",
    "sourceField": null,
    "targetField": "content.incidentTime",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "It is unknown whether this arrives as a separate Jira field or is derived from another date."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:usuario-o-numero-de-persona-afectada:22",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Usuario o numero de persona afectada",
    "sourceField": null,
    "targetField": "content.affectedUser",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "The real Jira source field and value format are not confirmed."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fields-assignee-displayname:23",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "fields.assignee.displayName",
    "sourceField": "fields.assignee.displayName",
    "targetField": "content.technicianInfo.lastName",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "pending-validation",
      "notes": "El mapping existía como ejemplo, pero la representación de persona y el contrato del consumidor no están confirmados. Modelo funcional nuevo confirma assignee como campo nativo de Jira; sigue sin resolver cual de las tres subrutas (displayName/accountId/emailAddress) usar."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fields-assignee-accountid:24",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "fields.assignee.accountId",
    "sourceField": "fields.assignee.accountId",
    "targetField": "content.technicianInfo.userId",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "pending-validation",
      "notes": "El mapping existía como ejemplo, pero la representación de persona y el contrato del consumidor no están confirmados. Modelo funcional nuevo confirma assignee como campo nativo de Jira; sigue sin resolver cual de las tres subrutas (displayName/accountId/emailAddress) usar."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fields-assignee-emailaddress:25",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "fields.assignee.emailAddress",
    "sourceField": "fields.assignee.emailAddress",
    "targetField": "content.technicianInfo.email",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "pending-validation",
      "notes": "El mapping existía como ejemplo, pero la disponibilidad y el contrato del consumidor no están confirmados. Modelo funcional nuevo confirma assignee como campo nativo de Jira; sigue sin resolver cual de las tres subrutas (displayName/accountId/emailAddress) usar."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fields-components:26",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "fields.components",
    "sourceField": "fields.components",
    "targetField": "content.groupId",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "pending-validation",
      "notes": "El mapping existía como ejemplo, pero la forma del componente Jira y la regla de extracción no están confirmadas."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:id-interno:27",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "ID interno",
    "sourceField": null,
    "targetField": "internal.id",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Es identificador interno del modelo; no hay sourceField Jira confirmado. Modelo funcional nuevo aporta un candidato: el campo nativo id de Jira (numero interno del issue, distinto de key). Falta confirmar de negocio si internal.id debe reflejar ese id de Jira o es un identificador propio del servicio, dado que itsmTicketId ya usa key."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:multiidioma:28",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Multiidioma",
    "sourceField": null,
    "targetField": "content.locale",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega desde Jira o se deriva."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:resolucion-jira:29",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Resolucion Jira",
    "sourceField": null,
    "targetField": "content.jiraResolution",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Puede venir de fields.resolution.name, pero falta decision funcional. Modelo funcional nuevo confirma resolution como campo nativo de Jira y la ruta sigue el mismo patron que status.name/priority.name ya confirmados; es el candidato mas cerca de poder confirmarse, solo pendiente de decision de negocio."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:fecha-de-resolucion:30",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Fecha de resolucion",
    "sourceField": null,
    "targetField": "content.resolutionDate",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "fields.resolutiondate es candidato; falta validar formato, zona horaria y destino. Modelo funcional nuevo confirma resolutionDate como campo nativo de Jira, pero eso no resuelve el hueco de formato/zona horaria/destino ya identificado."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:quien-da-el-alta:31",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Quien da el alta",
    "sourceField": null,
    "targetField": "content.createdByUser",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Campo de persona pendiente de contrato interno. Modelo funcional nuevo confirma creator como campo nativo de Jira, pero sigue sin resolver que representacion de persona usar ni si el origen real es creator o reporter."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:responsable-externo:32",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Responsable externo",
    "sourceField": null,
    "targetField": "content.externalOwner",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Puede ser campo Jira o regla derivada; falta evidencia."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:informados-externos:33",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Informados externos",
    "sourceField": null,
    "targetField": "content.externalWatchers",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Jira no separa externos e internos sin regla adicional."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:responsable-interno:34",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Responsable interno",
    "sourceField": null,
    "targetField": "content.internalOwner",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta campo real o regla de derivacion."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:informados-internos:35",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Informados internos",
    "sourceField": null,
    "targetField": "content.internalWatchers",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Jira no separa externos e internos sin regla adicional."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:regla-sla:36",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Regla SLA",
    "sourceField": null,
    "targetField": "content.slaCalendarType",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar origen."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:descripcion-funcional-de-la-solucion-final:37",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Descripcion funcional de la solucion final",
    "sourceField": null,
    "targetField": "content.functionalSolutionDescription",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta customfield Jira confirmado."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:tipo-de-solucion:38",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Tipo de solucion",
    "sourceField": null,
    "targetField": "content.solutionType",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:clasificacion-del-problema:39",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Clasificacion del problema",
    "sourceField": null,
    "targetField": "content.problemClassification",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:causa:40",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Causa",
    "sourceField": null,
    "targetField": "content.rootCause.cause",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:componente-afectado:41",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Componente afectado",
    "sourceField": null,
    "targetField": "content.rootCause.affectedComponent",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:condicion-disparadora:42",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Condicion disparadora",
    "sourceField": null,
    "targetField": "content.rootCause.triggerCondition",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:resultado-observado:43",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Resultado observado",
    "sourceField": null,
    "targetField": "content.rootCause.observedOutcome",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:sentencia-ejecutada:44",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Sentencia ejecutada",
    "sourceField": null,
    "targetField": "content.executedStatement",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira y regla de tratamiento de contenido sensible."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:informacion-demandada-al-usuario:45",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Informacion demandada al usuario",
    "sourceField": null,
    "targetField": "content.informationRequestedFromReporter",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:alertas-registradas:46",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Alertas registradas",
    "sourceField": null,
    "targetField": "content.registeredAlertsRange",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:clientes-afectados:47",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Clientes afectados",
    "sourceField": null,
    "targetField": "content.affectedCustomersRange",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:perdidas-de-datos-bajo-criterio-cida:48",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Perdidas de datos bajo criterio CIDA",
    "sourceField": null,
    "targetField": "content.cidaDataLossCriteria",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar forma Jira y transformador."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:paises-afectados:49",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Paises afectados",
    "sourceField": null,
    "targetField": "content.impactedCountries",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:impacto-economico:50",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Impacto economico",
    "sourceField": null,
    "targetField": "content.hasEconomicImpact",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega como booleano u opcion."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:inactividad:51",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Inactividad",
    "sourceField": null,
    "targetField": "content.inactivity",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:segmento-de-clientes-afectados:52",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Segmento de clientes afectados",
    "sourceField": null,
    "targetField": "content.affectedCustomerSegments",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:nivel-de-impacto:53",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Nivel de impacto",
    "sourceField": null,
    "targetField": "content.impactLevel",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:candidatos-pendientes:indicador-de-servicio-critico:54",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Candidatos pendientes",
    "formField": "Indicador de servicio critico",
    "sourceField": null,
    "targetField": "content.isCriticalService",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega como booleano u opcion."
    }
  },
  {
    "_id": "field:pilot-local:campos-excluidos:fields-attachment:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Campos excluidos",
    "formField": "fields.attachment",
    "sourceField": "fields.attachment",
    "targetField": "content.attachedDocuments",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "catalog.json",
      "confidence": "pending-validation",
      "notes": "Los adjuntos se procesan por el flujo de adjuntos y no son mappings normales."
    }
  },
  {
    "_id": "field:pilot-local:campos-excluidos:content-diagnostic:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Campos excluidos",
    "formField": "content.diagnostic",
    "sourceField": null,
    "targetField": "content.diagnostic",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "El contenido de diagnóstico se genera después de la entrada de Jira y no debe mapearse desde el payload inicial."
    }
  },
  {
    "_id": "field:pilot-local:campos-excluidos:content-resolution:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Campos excluidos",
    "formField": "content.resolution",
    "sourceField": null,
    "targetField": "content.resolution",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "El contenido de resolución se genera después de la entrada de Jira y no debe mapearse desde el payload inicial."
    }
  },
  {
    "_id": "field:pilot-local:bloqueados-por-motor:cambios-tecnicos-efectuados:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Bloqueados por motor",
    "formField": "Cambios tecnicos efectuados",
    "sourceField": null,
    "targetField": "content.modifiedComponents",
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Requiere fan-out de array de objetos; el motor actual solo procesa mappings planos."
    }
  },
  {
    "_id": "field:pilot-local:bloqueados-por-motor:pruebas-realizadas:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Bloqueados por motor",
    "formField": "Pruebas realizadas",
    "sourceField": null,
    "targetField": "content.performedTests",
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Requiere fan-out de array de objetos; el motor actual solo procesa mappings planos."
    }
  },
  {
    "_id": "field:pilot-local:bloqueados-por-motor:imputacion:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Bloqueados por motor",
    "formField": "Imputacion",
    "sourceField": null,
    "targetField": "timeEntries[]",
    "decision": "blocked",
    "engineBlocked": true,
    "evidence": {
      "source": "functional-model",
      "confidence": "pending-validation",
      "notes": "Coleccion hija basada en worklogs; queda fuera de mappings y pendingCandidates cargables."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:id-interno:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "ID interno",
    "modelField": "id",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Es identificador interno del modelo, no se confirma como campo Jira de entrada."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:clave-visible:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Clave visible",
    "modelField": "key",
    "sourceField": "key",
    "targetField": "itsmTicketId",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Ya existe mapping confirmado en `catalog.json`."
    },
    "futureMapping": {
      "sourceField": "key",
      "targetField": "itsmTicketId",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Clave visible.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:pais-afectado:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Pais afectado",
    "modelField": "affectedCountry",
    "sourceField": null,
    "targetField": "content.affectedCountry",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta metadata Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:multiidioma:3",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Multiidioma",
    "modelField": "locale",
    "sourceField": null,
    "targetField": "content.locale",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega desde Jira o se deriva."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:tipo-de-incidencia:4",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Tipo de incidencia",
    "modelField": "issueType",
    "sourceField": "fields.issuetype.name",
    "targetField": "ticketType",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Ya existe mapping confirmado en `catalog.json`."
    },
    "futureMapping": {
      "sourceField": "fields.issuetype.name",
      "targetField": "ticketType",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Tipo de incidencia.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:referencia:5",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Referencia",
    "modelField": "summary",
    "sourceField": "fields.summary",
    "targetField": "content.title",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Ya existe mapping confirmado en `catalog.json`."
    },
    "futureMapping": {
      "sourceField": "fields.summary",
      "targetField": "content.title",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Referencia.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:descripcion:6",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Descripcion",
    "modelField": "description",
    "sourceField": "fields.description",
    "targetField": "content.issueDescription",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Ya existe mapping confirmado en `catalog.json`."
    },
    "futureMapping": {
      "sourceField": "fields.description",
      "targetField": "content.issueDescription",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Descripcion.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:adjuntos-informativos:7",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Adjuntos informativos",
    "modelField": "infoAttachments",
    "sourceField": "fields.attachment` candidato",
    "targetField": "content.attachedDocuments",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Los adjuntos van por el flujo especializado de adjuntos, no por mapping regular."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:estado:8",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Estado",
    "modelField": "status",
    "sourceField": "fields.status.name",
    "targetField": "content.status",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Ya existe mapping confirmado con el destino actual de estado."
    },
    "futureMapping": {
      "sourceField": "fields.status.name",
      "targetField": "content.status",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Estado.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:resolucion-jira:9",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Resolucion Jira",
    "modelField": "resolution",
    "sourceField": "fields.resolution.name` candidato",
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede ser estado Jira o resultado posterior; falta decision funcional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:fecha-de-resolucion:10",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Fecha de resolucion",
    "modelField": "resolutionDate",
    "sourceField": "fields.resolutiondate` candidato",
    "targetField": "content.resolutionDate",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar formato, zona horaria y destino interno final."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:solicitante:11",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Solicitante",
    "modelField": "reporter",
    "sourceField": "fields.reporter.*` candidato",
    "targetField": "content.requestorId",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta decidir si se guarda ID, nombre o email."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:quien-da-el-alta:12",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Quien da el alta",
    "modelField": "creator",
    "sourceField": "fields.creator.*` candidato",
    "targetField": "content.createdByUser",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Campo de persona pendiente de contrato interno."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:empresa:13",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Empresa",
    "modelField": "company",
    "sourceField": null,
    "targetField": "content.requestorCompany",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede venir de Jira o derivarse del solicitante."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:departamento:14",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Departamento",
    "modelField": "department",
    "sourceField": null,
    "targetField": "content.requestorDepartment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta evidencia Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:centro:15",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Centro",
    "modelField": "site",
    "sourceField": null,
    "targetField": "content.requestorCenter",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta evidencia Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:direccion-general:16",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Direccion general",
    "modelField": "division",
    "sourceField": null,
    "targetField": "content.requestorDivision",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta evidencia Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:aplicacion-afectada:17",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Aplicacion afectada",
    "modelField": "affectedApplication",
    "sourceField": null,
    "targetField": "content.affectedApplication",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede parecerse a components, pero no se confirma sin catalogo funcional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:entorno:18",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Entorno",
    "modelField": "environment",
    "sourceField": null,
    "targetField": "content.environment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Se observo forma de opcion, pero falta nombre funcional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:responsable-externo:19",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Responsable externo",
    "modelField": "externalOwner",
    "sourceField": null,
    "targetField": "content.externalOwner",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede ser regla por aplicacion y entorno."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:tecnico-asignado:20",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Tecnico asignado",
    "modelField": "assignee",
    "sourceField": "fields.assignee.*` candidato",
    "targetField": "content.technicianInfo",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Persona pendiente de contrato interno."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:informados-externos:21",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Informados externos",
    "modelField": "externalWatchers",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Jira no separa externos e internos sin regla adicional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:responsable-interno:22",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Responsable interno",
    "modelField": "internalOwner",
    "sourceField": null,
    "targetField": "content.internalOwner",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real o regla de derivacion."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:informados-internos:23",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Informados internos",
    "modelField": "internalWatchers",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Jira no separa externos e internos sin regla adicional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:es-urgente:24",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Es Urgente",
    "modelField": "isUrgent",
    "sourceField": null,
    "targetField": "content.isUrgent",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "No se deduce de prioridad Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:motivo-de-urgencia:25",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Motivo de urgencia",
    "modelField": "urgencyReason",
    "sourceField": null,
    "targetField": "content.urgencyReason",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real y regla de obligatoriedad."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:grado-de-urgencia-tecnico:26",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Grado de urgencia tecnico",
    "modelField": "priority",
    "sourceField": "fields.priority.name",
    "targetField": "content.severityLevel",
    "decision": "confirmed",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "confirmed",
      "notes": "Mapping confirmado, separado de urgencia de negocio."
    },
    "futureMapping": {
      "sourceField": "fields.priority.name",
      "targetField": "content.severityLevel",
      "transformer": "copy",
      "required": false,
      "description": "Mapping futuro para Grado de urgencia tecnico.",
      "options": {}
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:en-garantia-de-proyecto:27",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "En garantia de proyecto",
    "modelField": "isProjectWarranty",
    "sourceField": null,
    "targetField": "content.projectWarranty",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "El valor SI no confirma el significado funcional."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:codigo-proyecto:28",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Codigo proyecto",
    "modelField": "warrantyProjectCode",
    "sourceField": null,
    "targetField": "content.projectCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira y formato."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:descripcion-codigo-proyecto:29",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Descripcion codigo proyecto",
    "modelField": "warrantyProjectName",
    "sourceField": null,
    "targetField": "content.projectName",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:fecha-hora-apertura:30",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Fecha / hora apertura",
    "modelField": "created",
    "sourceField": "fields.created` candidato",
    "targetField": "content.openedAt",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar que negocio quiere la fecha de creacion Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:compromiso-de-resolucion:31",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Compromiso de resolucion",
    "modelField": "resolutionCommitmentAt",
    "sourceField": null,
    "targetField": "content.resolutionCommitment",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede calcularse por SLA, no copiarse."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:regla-sla:32",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Regla SLA",
    "modelField": "slaCalendarType",
    "sourceField": null,
    "targetField": "content.slaCalendarType",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar origen."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:hora-del-incidente:33",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Hora del incidente",
    "modelField": "incidentOccurredAt",
    "sourceField": null,
    "targetField": "content.incidentTime",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:resultado-obtenido:34",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Resultado obtenido",
    "modelField": "actualResult",
    "sourceField": null,
    "targetField": "content.actualResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede estar embebido en descripcion."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:resultado-esperado:35",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Resultado esperado",
    "modelField": "expectedResult",
    "sourceField": null,
    "targetField": "content.expectedResult",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede estar embebido en descripcion."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:reproduccion-del-problema:36",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Reproduccion del problema",
    "modelField": "stepsToReproduce",
    "sourceField": null,
    "targetField": "content.reproductionSteps",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede estar embebido en descripcion."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:mensaje-de-error-literal:37",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Mensaje de error literal",
    "modelField": "errorMessage",
    "sourceField": null,
    "targetField": "content.errorMessage",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:codigo-de-error:38",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Codigo de error",
    "modelField": "errorCode",
    "sourceField": null,
    "targetField": "content.errorCode",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:alta:usuario-afectado:39",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Alta",
    "formField": "Usuario afectado",
    "modelField": "affectedUser",
    "sourceField": null,
    "targetField": "content.affectedUser",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/alta-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Persona o numero pendiente de contrato interno."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:descripcion-funcional-de-la-solucion-final:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Descripcion funcional de la solucion final",
    "modelField": "functionalSolutionDescription",
    "sourceField": null,
    "targetField": "content.functionalSolutionDescription",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Puede ser dato del tecnico en Jira, pero falta ruta real."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:tipo-de-solucion:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Tipo de solucion",
    "modelField": "solutionType",
    "sourceField": null,
    "targetField": "content.solutionType",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:clasificacion-del-problema:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Clasificacion del problema",
    "modelField": "problemClassification",
    "sourceField": null,
    "targetField": "content.problemClassification",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta campo real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:origen-del-error:3",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Origen del error",
    "modelField": "rootCause",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Objeto anidado; requiere decidir si se descompone en campos simples."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:causa:4",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Causa",
    "modelField": "rootCause.cause",
    "sourceField": null,
    "targetField": "content.rootCause.cause",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:componente-afectado:5",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Componente afectado",
    "modelField": "rootCause.affectedComponent",
    "sourceField": null,
    "targetField": "content.rootCause.affectedComponent",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:condicion-disparadora:6",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Condicion disparadora",
    "modelField": "rootCause.triggerCondition",
    "sourceField": null,
    "targetField": "content.rootCause.triggerCondition",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:resultado-observado:7",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Resultado observado",
    "modelField": "rootCause.observedOutcome",
    "sourceField": null,
    "targetField": "content.rootCause.observedOutcome",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:cambios-tecnicos-efectuados:8",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Cambios tecnicos efectuados",
    "modelField": "modifiedComponents[]",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "El motor actual no hace fan-out de arrays de objetos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:componente-modificado:9",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Componente modificado",
    "modelField": "modifiedComponents[].componentName",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Depende del soporte futuro de colecciones hijas o transformer especial."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:version-del-elemento:10",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Version del elemento",
    "modelField": "modifiedComponents[].componentVersion",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Depende del soporte futuro de colecciones hijas o transformer especial."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:tipo-de-componente-modificado:11",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Tipo de componente modificado",
    "modelField": "modifiedComponents[].componentType",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Depende del soporte futuro de colecciones hijas o transformer especial."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:pruebas-realizadas:12",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Pruebas realizadas",
    "modelField": "performedTests[]",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "El motor actual no hace fan-out de arrays de objetos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:prueba-realizada:13",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Prueba realizada",
    "modelField": "performedTests[].testDescription",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Depende del soporte futuro de colecciones hijas o transformer especial."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:resultado-de-la-prueba:14",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Resultado de la prueba",
    "modelField": "performedTests[].testResult",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": true,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Depende del soporte futuro de colecciones hijas o transformer especial."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:sentencia-ejecutada:15",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Sentencia ejecutada",
    "modelField": "executedStatement",
    "sourceField": null,
    "targetField": null,
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira y regla de tratamiento de contenido sensible."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:informacion-demandada-al-usuario:16",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Informacion demandada al usuario",
    "modelField": "informationRequestedFromReporter",
    "sourceField": null,
    "targetField": "content.informationRequestedFromReporter",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta ruta real Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:adjuntos-de-solucion:17",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Adjuntos de solucion",
    "modelField": "resolutionAttachments",
    "sourceField": "fields.attachment` candidato",
    "targetField": "content.attachedDocuments o lista futura separada",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Los adjuntos se procesan por flujo especializado y falta decidir si habra lista dual."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:diagnostico-interno:18",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Diagnostico interno",
    "modelField": "content.diagnostic",
    "sourceField": null,
    "targetField": "content.diagnostic",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Se genera despues del intake Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:solucion:resolucion-interna:19",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Solucion",
    "formField": "Resolucion interna",
    "modelField": "content.resolution",
    "sourceField": null,
    "targetField": "content.resolution",
    "decision": "excluded",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/solucion-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Se genera despues del intake Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:alertas-registradas:0",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Alertas registradas",
    "modelField": "registeredAlertsRange",
    "sourceField": null,
    "targetField": "content.registeredAlertsRange",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:clientes-afectados:1",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Clientes afectados",
    "modelField": "affectedCustomersRange",
    "sourceField": null,
    "targetField": "content.affectedCustomersRange",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:perdidas-de-datos-bajo-criterio-cida:2",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Perdidas de datos bajo criterio CIDA",
    "modelField": "cidaDataLossCriteria[]",
    "sourceField": null,
    "targetField": "content.cidaDataLossCriteria",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Array de valores; falta confirmar forma Jira y transformador."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:paises-afectados:3",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Paises afectados",
    "modelField": "impactedCountries[]",
    "sourceField": null,
    "targetField": "content.impactedCountries",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Array de valores; falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:impacto-economico:4",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Impacto economico",
    "modelField": "hasEconomicImpact",
    "sourceField": null,
    "targetField": "content.hasEconomicImpact",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega como booleano u opcion."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:inactividad:5",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Inactividad",
    "modelField": "inactivity[]",
    "sourceField": null,
    "targetField": "content.inactivity",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Array de valores; falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:segmento-de-clientes-afectados:6",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Segmento de clientes afectados",
    "modelField": "affectedCustomerSegments[]",
    "sourceField": null,
    "targetField": "content.affectedCustomerSegments",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Array de valores; falta confirmar forma Jira."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:nivel-de-impacto:7",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Nivel de impacto",
    "modelField": "impactLevel",
    "sourceField": null,
    "targetField": "content.impactLevel",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta desplegable Jira y valores permitidos."
    }
  },
  {
    "_id": "field:pilot-local:matrix:impacto:indicador-de-servicio-critico:8",
    "docType": "field",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "section": "Impacto",
    "formField": "Indicador de servicio critico",
    "modelField": "isCriticalService",
    "sourceField": null,
    "targetField": "content.isCriticalService",
    "decision": "pending-validation",
    "engineBlocked": false,
    "evidence": {
      "source": "docs/mappings/contexts/pilot-local/impacto-data-matrix.md",
      "confidence": "pending-validation",
      "notes": "Falta confirmar si llega como booleano u opcion."
    }
  },
  {
    "_id": "model-reference:pilot-local:catalogo-jira-a-modelo-interno",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Catalogo Jira a modelo interno",
    "sourcePath": "docs/mappings/contexts/pilot-local/catalog.json",
    "lineCount": 749,
    "summary": "Referencia documental disponible en Git para revisar el modelo funcional.",
    "schemaVersion": 1,
    "catalogStatus": "proposal"
  },
  {
    "_id": "model-reference:pilot-local:seccion-1-alta-de-la-incidencia",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Seccion 1 - Alta de la incidencia",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia",
    "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "lineCount": 82,
    "summary": "Texto funcional completo de la seccion 1 (Alta de la incidencia).",
    "body": "## 1.1 Identificación y clasificación\n\n```\n(id interno)                        -> id (nativo)\n(clave visible)                     -> key (nativo)\nPaís afectado                       -> affectedCountry\n(multiidioma)                       -> locale\nTipo de incidencia                  -> issueType (nativo)\nReferencia                          -> summary (nativo)\nDescripción                         -> description (nativo)\nAdjuntos                            -> infoAttachments (~ nativo)\n(estado)                            -> status (nativo)\n(resolución)                        -> resolution (nativo)\n(fecha de resolución)               -> resolutionDate (nativo)\n```\n\n## 1.2 Solicitante y organización\n\n```\nSolicitante                         -> reporter (nativo)\n(quien da el alta)                  -> creator (nativo)\nEmpresa                             -> company (~ nativo)\nDepartamento                        -> department\nCentro                              -> site\nDirección general                   -> division\n```\n\n## 1.3 Aplicación, entorno y asignación\n\n```\nAplicación afectada                 -> affectedApplication (~ nativo)\nEntorno                             -> environment (nativo)\nResponsable de la empresa externa   -> externalOwner\n(técnico asignado)                  -> assignee (nativo)\nInformados externos                 -> externalWatchers (~ nativo)\nResponsable Bankinter               -> internalOwner\nInformados Bankinter                -> internalWatchers (~ nativo)\n```\n\n## 1.4 Urgencia y proyecto\n\n```\nEs Urgente                          -> isUrgent\nMotivo                              -> urgencyReason\nGrado de urgencia                   -> priority (nativo)\nEn garantía de proyecto             -> isProjectWarranty\nCódigo proyecto                     -> warrantyProjectCode\nDescripción del código de proyecto  -> warrantyProjectName\n```\n\n## 1.5 Fechas y SLA\n\n```\nFecha / hora apertura               -> created (nativo)\nCompromiso de resolución            -> resolutionCommitmentAt (~ nativo)\n(regla de cálculo del SLA)          -> slaCalendarType\nHora del incidente                  -> incidentOccurredAt\n```\n\n## 1.6 Detalle técnico del error\n\n```\nResultado obtenido                  -> actualResult\nResultado esperado                  -> expectedResult\nReproducción del problema           -> stepsToReproduce\nMensaje de error literal            -> errorMessage\nCódigo de error                     -> errorCode\nUsuario o nº de persona con error   -> affectedUser\n```\n\n## Notas de la sección 1\n\n- **company** → Jira Service Management tiene `organizations`, pero es un concepto de cliente/CSAT, no de estructura interna. Valorar si encaja.\n- **affectedApplication** → podría mapearse a `components`, aunque los componentes son por proyecto y aquí la aplicación es un catálogo transversal.\n- **externalWatchers / internalWatchers** → Jira tiene `watchers` (nativo), pero es una única lista sin distinguir externos de internos. Si necesitas la distinción, hacen falta dos campos propios y sincronizar `watchers` como agregado.\n- **resolutionCommitmentAt** → el SLA *Time to resolution* de JSM cubre el cálculo; `duedate` (nativo) sería la alternativa, pero solo guarda fecha, sin hora.\n- **infoAttachments / resolutionAttachments** → Jira tiene una única lista `attachment` por issue. Al separarlos en dos campos, hay que resolver la convivencia: o bien un flag/etiqueta por adjunto sobre la lista nativa, o bien dos campos propios y `attachment` como agregado.\n- **externalOwner vs. assignee** → `externalOwner` sale de la parametrización `(aplicación, entorno)` y se recalcula al cambiarlas; es el destino de enrutado. `assignee` (nativo) es el técnico que trabaja la incidencia en cada momento y puede reasignarse libremente. Se inicializa a `externalOwner` en el alta. Simétrico a `internalOwner`.\n\n---"
  },
  {
    "_id": "model-reference:pilot-local:seccion-2-solucion",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Seccion 2 - Solución",
    "sectionNumber": 2,
    "sectionTitle": "Solución",
    "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "lineCount": 24,
    "summary": "Texto funcional completo de la seccion 2 (Solución).",
    "body": "```\nDescr. funcional de la solución final -> functionalSolutionDescription\nTipo de solución                    -> solutionType\nClasificación del problema          -> problemClassification\nOrigen del error                    -> rootCause\n  1. La incidencia se produjo porque-> rootCause.cause\n  2. afectando a                    -> rootCause.affectedComponent\n  3. cuando                         -> rootCause.triggerCondition\n  4. provocando                     -> rootCause.observedOutcome\nCambios técnicos efectuados         -> modifiedComponents\n  Componente modificado             -> modifiedComponents[].componentName\n  Versión del elemento              -> modifiedComponents[].componentVersion\n  Tipo de componente modificado     -> modifiedComponents[].componentType\nPruebas realizadas                  -> performedTests\n  Prueba realizada                  -> performedTests[].testDescription\n  Resultado de la prueba            -> performedTests[].testResult\nSentencia ejecutada                 -> executedStatement\nInformación demandada al usuario    -> informationRequestedFromReporter\nAdjuntos                            -> resolutionAttachments\n```\n\n---"
  },
  {
    "_id": "model-reference:pilot-local:seccion-3-impacto",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Seccion 3 - Impacto",
    "sectionNumber": 3,
    "sectionTitle": "Impacto",
    "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "lineCount": 15,
    "summary": "Texto funcional completo de la seccion 3 (Impacto).",
    "body": "```\nAlertas registradas                 -> registeredAlertsRange\nClientes afectados                  -> affectedCustomersRange\nPérdidas de datos bajo criterio CIDA-> cidaDataLossCriteria\nPaíses afectados                    -> impactedCountries\nImpacto económico                   -> hasEconomicImpact\nInactividad                         -> inactivity\nSegmento de clientes afectados      -> affectedCustomerSegments\nNivel de impacto                    -> impactLevel\nIndicador de Servicio Crítico       -> isCriticalService\n```\n\n---"
  },
  {
    "_id": "model-reference:pilot-local:seccion-4-imputacion",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Seccion 4 - Imputación",
    "sectionNumber": 4,
    "sectionTitle": "Imputación",
    "sourcePath": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "lineCount": 21,
    "summary": "Texto funcional completo de la seccion 4 (Imputación).",
    "body": "No es un bloque de campos del ticket, sino una **colección hija**: `timeEntries: TimeEntry[]`,\nuna fila por cada imputación. Mapea casi 1:1 con el `worklog` nativo de Jira.\n\n```\nPersona que imputa                  -> timeEntries[].author (nativo: worklog.author)\n(quien registra por cuenta de otro) -> timeEntries[].updateAuthor (nativo: worklog.updateAuthor)\nAplicación                          -> timeEntries[].application\nTipo                                -> timeEntries[].issueType\nEntorno                             -> timeEntries[].environment\nCaracterística                      -> timeEntries[].workCharacteristic\nFecha y hora de la imputación       -> timeEntries[].started (nativo: worklog.started)\nTiempo dedicado a la incidencia     -> timeEntries[].timeSpentSeconds (nativo: worklog.timeSpentSeconds)\n```\n\n## Notas de la sección 4\n\n- **application / issueType / environment son snapshot**, no referencias vivas al ticket. Si la incidencia se reasigna a otra aplicación, las horas ya imputadas deben seguir contabilizando donde se imputaron.\n- **workCharacteristic también es snapshot**, derivado en el momento de imputar a partir de `isUrgent` e `isProjectWarranty` del ticket.\n- **Tiempo dedicado** → el documento pide horas y minutos; se almacena en segundos (como Jira) y se formatea en presentación.\n- **Imputación por cuenta de un tercero** → solo usuarios Bankinter. Es una regla de permisos, no un campo."
  },
  {
    "_id": "model-reference:pilot-local:imputacion-y-timeentries-bloqueado",
    "docType": "model-reference",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/imputacion-timeentries.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Imputacion y timeEntries bloqueado",
    "sourcePath": "docs/mappings/contexts/pilot-local/imputacion-timeentries.md",
    "lineCount": 37,
    "summary": "Referencia documental disponible en Git para revisar el modelo funcional.",
    "engineBlocked": true
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-1",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "company",
    "message": "**company** → Jira Service Management tiene `organizations`, pero es un concepto de cliente/CSAT, no de estructura interna. Valorar si encaja.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-2",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "affectedApplication",
    "message": "**affectedApplication** → podría mapearse a `components`, aunque los componentes son por proyecto y aquí la aplicación es un catálogo transversal.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-3",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "externalWatchers / internalWatchers",
    "message": "**externalWatchers / internalWatchers** → Jira tiene `watchers` (nativo), pero es una única lista sin distinguir externos de internos. Si necesitas la distinción, hacen falta dos campos propios y sincronizar `watchers` como agregado.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-4",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "resolutionCommitmentAt",
    "message": "**resolutionCommitmentAt** → el SLA *Time to resolution* de JSM cubre el cálculo; `duedate` (nativo) sería la alternativa, pero solo guarda fecha, sin hora.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-5",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "infoAttachments / resolutionAttachments",
    "message": "**infoAttachments / resolutionAttachments** → Jira tiene una única lista `attachment` por issue. Al separarlos en dos campos, hay que resolver la convivencia: o bien un flag/etiqueta por adjunto sobre la lista nativa, o bien dos campos propios y `attachment` como agregado.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-1-nota-6",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "externalOwner vs. assignee",
    "message": "**externalOwner vs. assignee** → `externalOwner` sale de la parametrización `(aplicación, entorno)` y se recalcula al cambiarlas; es el destino de enrutado. `assignee` (nativo) es el técnico que trabaja la incidencia en cada momento y puede reasignarse libremente. Se inicializa a `externalOwner` en el alta. Simétrico a `internalOwner`.",
    "scope": "functional",
    "sectionNumber": 1,
    "sectionTitle": "Alta de la incidencia"
  },
  {
    "_id": "gotcha:pilot-local:seccion-4-nota-1",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "application / issueType / environment son snapshot",
    "message": "**application / issueType / environment son snapshot**, no referencias vivas al ticket. Si la incidencia se reasigna a otra aplicación, las horas ya imputadas deben seguir contabilizando donde se imputaron.",
    "scope": "functional",
    "sectionNumber": 4,
    "sectionTitle": "Imputación"
  },
  {
    "_id": "gotcha:pilot-local:seccion-4-nota-2",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "workCharacteristic también es snapshot",
    "message": "**workCharacteristic también es snapshot**, derivado en el momento de imputar a partir de `isUrgent` e `isProjectWarranty` del ticket.",
    "scope": "functional",
    "sectionNumber": 4,
    "sectionTitle": "Imputación"
  },
  {
    "_id": "gotcha:pilot-local:seccion-4-nota-3",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Tiempo dedicado",
    "message": "**Tiempo dedicado** → el documento pide horas y minutos; se almacena en segundos (como Jira) y se formatea en presentación.",
    "scope": "functional",
    "sectionNumber": 4,
    "sectionTitle": "Imputación"
  },
  {
    "_id": "gotcha:pilot-local:seccion-4-nota-4",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/json_modelo_datos _1.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Imputación por cuenta de un tercero",
    "message": "**Imputación por cuenta de un tercero** → solo usuarios Bankinter. Es una regla de permisos, no un campo.",
    "scope": "functional",
    "sectionNumber": 4,
    "sectionTitle": "Imputación"
  },
  {
    "_id": "gotcha:pilot-local:collection-separation",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Coleccion documental separada",
    "message": "`mapping_catalog_review` no sustituye ni modifica la coleccion operativa `mappings`.",
    "scope": "design"
  },
  {
    "_id": "gotcha:pilot-local:sentinel-mesh",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Mesh no operativo",
    "message": "Todos los documentos usan `REVIEW-NOT-OPERATIONAL` para evitar que se confundan con mappings reales.",
    "scope": "design"
  },
  {
    "_id": "gotcha:pilot-local:status-target",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/catalog.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Estado actual",
    "message": "El destino correcto del estado es `content.status`; no se debe recuperar el nombre legacy de estado.",
    "scope": "design"
  },
  {
    "_id": "gotcha:pilot-local:timeentries-blocked",
    "docType": "gotcha",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/contexts/pilot-local/imputacion-timeentries.md",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Imputacion bloqueada",
    "message": "`timeEntries[]` requiere una coleccion hija o flujo especializado; no se carga como mapping plano.",
    "scope": "design"
  },
  {
    "_id": "example-ticket:pilot-local:example-001",
    "docType": "example-ticket",
    "meshId": "REVIEW-NOT-OPERATIONAL",
    "contextRef": "pilot-local",
    "generatedFrom": "docs/mappings/modelo_de_datos_mappeos_nuevos/ejemplo_ticket.json",
    "updatedAt": "2026-08-14T00:00:00.000Z",
    "title": "Ticket de ejemplo sanitizado",
    "ticket": {
      "id": "example-ticket-id",
      "key": "EXAMPLE-001",
      "issueType": "OPERATIONS_INCIDENT",
      "affectedCountry": "ES",
      "locale": "es-ES",
      "summary": "Ticket de ejemplo sanitizado para revisar mappings",
      "description": "Texto sanitizado para demo del modelo de datos.",
      "status": "RESOLVED",
      "resolution": "FIXED",
      "resolutionDate": "2026-08-03T06:40:00Z",
      "reporter": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "creator": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "company": {
        "id": "BK",
        "name": "organizacion-ejemplo S.A."
      },
      "department": {
        "id": "DEP-0442",
        "name": "Centro de Proceso de Datos"
      },
      "site": {
        "id": "CEN-021",
        "name": "Tres Cantos"
      },
      "division": {
        "id": "DG-07",
        "name": "Dirección General de Tecnología y Operaciones"
      },
      "affectedApplication": {
        "id": "APP-0318",
        "name": "Core Cuentas y Depósitos"
      },
      "environment": "PRO",
      "externalOwner": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "assignee": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "externalWatchers": [
        {
          "accountId": "account-example",
          "displayName": "Usuario de ejemplo",
          "email": "usuario@example.invalid"
        }
      ],
      "internalOwner": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "internalWatchers": [
        {
          "accountId": "account-example",
          "displayName": "Usuario de ejemplo",
          "email": "usuario@example.invalid"
        }
      ],
      "isUrgent": true,
      "urgencyReason": "Incidencia de Explotación",
      "priority": "CRITICAL",
      "isProjectWarranty": true,
      "warrantyProjectCode": "6Q-1234",
      "warrantyProjectName": "Migración motor de liquidación de intereses",
      "created": "2026-08-03T03:05:00Z",
      "incidentOccurredAt": "2026-08-03T02:14:00Z",
      "resolutionCommitmentAt": "2026-08-03T07:05:00Z",
      "slaCalendarType": "NATURAL_HOURS",
      "actualResult": "Texto sanitizado para demo del modelo de datos.",
      "expectedResult": "Texto sanitizado para demo del modelo de datos.",
      "stepsToReproduce": "Texto sanitizado para demo del modelo de datos.",
      "errorMessage": "Texto sanitizado para demo del modelo de datos.",
      "errorCode": "SQLCODE -911 / RC=8",
      "affectedUser": {
        "accountId": "account-example",
        "displayName": "Usuario de ejemplo",
        "email": "usuario@example.invalid"
      },
      "infoAttachments": [
        {
          "id": "att-90114",
          "filename": "consola-controlm-abend.png",
          "mimeType": "image/png",
          "sizeBytes": 284517,
          "uploadedAt": "2026-08-03T03:06:12Z"
        },
        {
          "id": "att-90115",
          "filename": "joblog-BK_LIQ_INT_D01.txt",
          "mimeType": "text/plain",
          "sizeBytes": 1043882,
          "uploadedAt": "2026-08-03T03:07:40Z"
        }
      ],
      "functionalSolutionDescription": "Texto sanitizado para demo del modelo de datos.",
      "solutionType": "JOB_RERUN",
      "problemClassification": "CONTENTION",
      "rootCause": {
        "cause": "el paso LIQPASO3 amplió su ámbito de commit de 5.000 a 50.000 filas en la versión 4.2.0, manteniendo el bloqueo sobre LIQ_MOV más allá de la ventana en la que el online sigue activo",
        "affectedComponent": "job batch BK_LIQ_INT_D01, paso LIQPASO3, sobre la tabla DB2 LIQ_MOV",
        "triggerCondition": "el batch arranca antes de que drene el online de altas de cuenta y ambos compiten por las mismas páginas de datos",
        "observedOutcome": "un interbloqueo resuelto por DB2 con SQLCODE -911, ABEND del batch con RC=8 y ausencia de los apuntes de liquidación del día"
      },
      "modifiedComponents": [
        {
          "componentName": "BK_LIQ_INT_D01 / LIQPASO3",
          "componentVersion": "4.2.1",
          "componentType": "BATCH"
        },
        {
          "componentName": "PKG_LIQUIDACION_INTERESES",
          "componentVersion": "2.8.4",
          "componentType": "DATABASE"
        }
      ],
      "performedTests": [
        {
          "testDescription": "Reejecución completa de BK_LIQ_INT_D01 tras liberar el bloqueo, con el online drenado y el commit revertido a 5.000 filas.",
          "testResult": "OK. Finaliza con RC=0 en 24 minutos, generando 1.842.310 apuntes en LIQ_MOV. Se adjunta pantallazo de Control-M con el proceso terminado correctamente."
        },
        {
          "testDescription": "Cuadre de saldos: consulta comparativa entre LIQ_MOV y el maestro de cuentas para una muestra de 500 cuentas de los segmentos Particulares y Empresas.",
          "testResult": "OK. Las 500 cuentas cuadran sin diferencias. Confirmado por Cristina Vega (Contabilidad) a las 06:35."
        }
      ],
      "executedStatement": "Texto sanitizado para demo del modelo de datos.",
      "informationRequestedFromReporter": "Texto sanitizado para demo del modelo de datos.",
      "resolutionAttachments": [
        {
          "id": "att-90131",
          "filename": "controlm-rerun-ok.png",
          "mimeType": "image/png",
          "sizeBytes": 197340,
          "uploadedAt": "2026-08-03T06:21:55Z"
        },
        {
          "id": "att-90132",
          "filename": "cuadre-saldos-muestra500.xlsx",
          "mimeType": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "sizeBytes": 68204,
          "uploadedAt": "2026-08-03T06:37:10Z"
        }
      ],
      "registeredAlertsRange": "OVER_20",
      "affectedCustomersRange": "OVER_300",
      "cidaDataLossCriteria": [
        "AVAILABILITY",
        "INTEGRITY"
      ],
      "impactedCountries": [
        "ES",
        "PT"
      ],
      "hasEconomicImpact": false,
      "inactivity": [
        "CRITICAL_FUNCTION_OVER_2H"
      ],
      "affectedCustomerSegments": [
        "RETAIL",
        "PERSONAL_BANKING",
        "SME"
      ],
      "impactLevel": "CRITICAL",
      "isCriticalService": true,
      "timeEntries": [
        {
          "id": "wl-55021",
          "author": {
            "accountId": "account-example",
            "displayName": "Usuario de ejemplo",
            "email": "usuario@example.invalid"
          },
          "updateAuthor": {
            "accountId": "account-example",
            "displayName": "Usuario de ejemplo",
            "email": "usuario@example.invalid"
          },
          "application": {
            "id": "APP-0318",
            "name": "Core Cuentas y Depósitos"
          },
          "issueType": "OPERATIONS_INCIDENT",
          "environment": "PRO",
          "workCharacteristic": "URGENT",
          "started": "2026-08-03T03:15:00Z",
          "timeSpentSeconds": 9000
        },
        {
          "id": "wl-55022",
          "author": {
            "accountId": "account-example",
            "displayName": "Usuario de ejemplo",
            "email": "usuario@example.invalid"
          },
          "updateAuthor": {
            "accountId": "account-example",
            "displayName": "Usuario de ejemplo",
            "email": "usuario@example.invalid"
          },
          "application": {
            "id": "APP-0318",
            "name": "Core Cuentas y Depósitos"
          },
          "issueType": "OPERATIONS_INCIDENT",
          "environment": "PRO",
          "workCharacteristic": "PROJECT_WARRANTY",
          "started": "2026-08-03T05:45:00Z",
          "timeSpentSeconds": 3300
        }
      ]
    }
  }
];

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
