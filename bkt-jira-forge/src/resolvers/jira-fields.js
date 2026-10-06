/**
 * IDs y opciones reales de los campos personalizados del proyecto KAN.
 * Obtenidos via API /rest/api/3/issue/createmeta/KAN/issuetypes/10001
 */
export const FIELDS = {
  urgente:           'customfield_10125', // multicheckboxes — value "Si" id=10093
  comoSeReproduce:   'customfield_10126', // textarea
  impacto:           'customfield_10127', // cascadingselect
  alertasRegistradas:'customfield_10128', // cascadingselect
  clientesAfectados: 'customfield_10129', // cascadingselect
  aplicacionAfectada:'customfield_10130', // cascadingselect
  inactividad:       'customfield_10131', // cascadingselect
  otrosCriterios:    'customfield_10132', // cascadingselect
  segmentosAfectados:'customfield_10133', // cascadingselect (1 valor, no array)
  resolucionAI:      'customfield_10134', // textarea
  tipoIA:            'customfield_13101', // text — tipo incidencia clasificador
  prioridadIA:       'customfield_13102', // text — prioridad P1-P4 clasificador
  slaIA:             'customfield_13103', // text — etiqueta SLA con fecha vencimiento
};

// Opciones por ID — más fiable que buscar por nombre
export const OPTIONS = {
  impacto: { 'Critico': '10094', 'Alto': '10095', 'Medio': '10096', 'Bajo': '10097' },
  alertas: { 'Menos de 20': '10098', 'Más de 20': '10099' },
  clientes: { 'Menos de 300': '10100', 'Más de 300': '10101' },
  aplicacion: {
    'Core Banking': '10102', 'Core banking': '10102',
    'Card Management': '10103', 'Card managment': '10103',
    'Payment Gateway': '10104', 'Payment gateway': '10104',
    'Auth Service': '10105', 'Auth service': '10105',
    'SEPA Gateway': '10106', 'SEPA gateway': '10106',
    'Fraud Detection': '10107', 'Fraud detection': '10107',
    'Mobile App': '10108', 'Mobile app': '10108',
    'Banca Online': '10109', 'Banca online': '10109',
    'Otras': '10110',
  },
  segmentos: {
    'Banca Personal': '10116', 'Banca personal': '10116',
    'Particulares': '10117',
    'Corporativa': '10118',
    'Banca Privada': '10119', 'Banca privada': '10119',
    'Empresas': '10120',
    'PYMES': '10121', 'Pymes': '10121',
    'Extranjeros': '10122',
  },
};

// Normaliza el impacto del LLM al valor exacto de Jira
export function normalizarImpacto(raw) {
  if (!raw) return null;
  const r = raw.toLowerCase().trim();
  if (r.includes('critico') || r.includes('crítico')) return 'Critico';
  if (r.includes('alto'))   return 'Alto';
  if (r.includes('bajo'))   return 'Bajo';
  if (r.includes('medio'))  return 'Medio';
  return null;
}

// Busca el primer segmento válido en la lista
export function resolverSegmento(raw) {
  if (!raw) return null;
  const partes = raw.split(',').map(s => s.trim());
  for (const p of partes) {
    const id = OPTIONS.segmentos[p] ||
               Object.entries(OPTIONS.segmentos).find(([k]) =>
                 k.toLowerCase() === p.toLowerCase())?.[1];
    if (id) return id;
  }
  return null;
}

/**
 * Calcula el nivel de impacto según los criterios del manual.
 */
export function calcularImpacto({ alertas, clientes, inactividad, otrosCriterios }) {
  const muchasAlertas  = alertas  === 'Más de 20';
  const muchosClientes = clientes === 'Más de 300';

  if ((muchasAlertas || muchosClientes) && inactividad && otrosCriterios) return 'Critico';
  if (muchasAlertas && muchosClientes && (inactividad || otrosCriterios))  return 'Critico';
  if ((muchasAlertas || muchosClientes) && (inactividad || otrosCriterios)) return 'Alto';
  if (muchasAlertas && muchosClientes)                                       return 'Alto';
  if (!muchasAlertas && !muchosClientes && inactividad && otrosCriterios)   return 'Alto';
  if (!muchasAlertas && !muchosClientes && !inactividad && !otrosCriterios) return 'Bajo';
  return 'Medio';
}
