import { fetch } from '@forge/api';
import { randomUUID } from 'crypto';

const LLM_API_URL = 'https://ia-research-pro.codingbuddy-4282826dce7d155229a320302e775459-0000.eu-de.containers.appdomain.cloud/research/llm/openai/clients';

// El gateway del LLM decodifica el body como UTF-8 estricto (Python) y peta
// si llega un surrogate suelto (típicamente un emoji cortado a la mitad por
// algún .substring() en el camino — logs, snippets, texto ya truncado que
// devolvió el propio LLM, etc). Se limpia justo antes de enviar para blindar
// a todos los llamantes sin tener que perseguir el corte exacto.
function stripLoneSurrogates(str) {
  let out = '';
  for (let i = 0; i < str.length; i++) {
    const code = str.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff) {
      const next = str.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out += str[i] + str[i + 1];
        i++;
      }
      // high surrogate sin su pareja → se descarta
    } else if (code >= 0xdc00 && code <= 0xdfff) {
      // low surrogate suelto (sin high previo) → se descarta
    } else {
      out += str[i];
    }
  }
  return out;
}

function extractContent(data) {
  if (typeof data === 'string') return data;
  if (data.content) return data.content;
  if (data.message) {
    const msg = data.message;
    if (typeof msg === 'string') return msg;
    if (typeof msg === 'object') return msg.content ?? JSON.stringify(msg);
  }
  if (data.choices?.[0]?.message?.content) return data.choices[0].message.content;
  return JSON.stringify(data);
}

export async function callClaude(systemPrompt, userPrompt) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) throw new Error('LLM_API_KEY no configurada en Forge Secrets');

  // El gateway ignora el campo `system` (verificado en forge logs: el modelo
  // responde como si nunca lo hubiera recibido). Se manda igualmente por si
  // algún modelo lo llega a usar, pero el contexto real va SIEMPRE dentro de
  // `message.content`, que es lo único que el backend atiende de verdad.
  const payload = {
    model: 'gpt-5.4-mini',
    user: 'ccastano_Cline@research.com',
    uuid: randomUUID(),
    system: stripLoneSurrogates(systemPrompt || ''),
    message: { role: 'user', content: stripLoneSurrogates(`${systemPrompt}\n\n${userPrompt}`) },
  };

  console.log('[callClaude] payload:', JSON.stringify(payload).substring(0, 300));

  const res = await fetch(LLM_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify(payload),
  });

  const rawText = await res.text();
  console.log('[callClaude] status:', res.status, 'body:', rawText.substring(0, 500));

  if (!res.ok) {
    throw new Error(`LLM API error ${res.status}: ${rawText}`);
  }

  let data;
  try { data = JSON.parse(rawText); } catch { return rawText; }

  const content = extractContent(data);
  if (data.message && typeof data.message === 'string' && !data.choices && !data.content) {
    throw new Error(`LLM API returned error: ${data.message}`);
  }
  return content;
}

export function extractSection(text, sectionName) {
  const regex = new RegExp(
    `${sectionName}[:\\s*]*([\\s\\S]*?)(?=\\n\\d+\\.|\\n[A-ZÁÉÍÓÚÑ_]{3,}:|$)`,
    'i'
  );
  const match = text.match(regex);
  if (!match) return null;
  return match[1].trim().replace(/^[-*]\s*/gm, '') || null;
}
