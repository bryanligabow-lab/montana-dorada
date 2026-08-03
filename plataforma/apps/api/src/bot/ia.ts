import Anthropic from '@anthropic-ai/sdk';
import { env } from '../env';

/**
 * Capa de IA del chatbot: un loop manual de tool-use sobre la Messages API.
 * El modelo (Haiku 4.5 por defecto, configurable con ANTHROPIC_MODEL) interpreta el
 * lenguaje natural y SOLO puede actuar a través de las herramientas que le pasamos.
 */

let client: Anthropic | null = null;
function getClient(): Anthropic | null {
  if (!env.anthropic.apiKey) return null;
  if (!client) client = new Anthropic({ apiKey: env.anthropic.apiKey });
  return client;
}

export function iaConfigurada(): boolean {
  return !!env.anthropic.apiKey;
}

export interface RunIA {
  system: string;
  historial: { role: 'user' | 'assistant'; content: string }[];
  mensaje: string;
  tools: Anthropic.Tool[];
  ejecutar: (name: string, input: Record<string, unknown>) => Promise<string>;
}

const MAX_ITERACIONES = 6;

/** Corre la conversación hasta que el modelo deja de llamar herramientas. Devuelve el texto final. */
export async function correrIA(run: RunIA): Promise<string> {
  const anthropic = getClient();
  if (!anthropic) throw new Error('anthropic_no_configurado');

  const messages: Anthropic.MessageParam[] = [
    ...run.historial.map((h) => ({ role: h.role, content: h.content })),
    { role: 'user' as const, content: run.mensaje },
  ];

  let ultimoTexto = '';
  for (let i = 0; i < MAX_ITERACIONES; i++) {
    const response = await anthropic.messages.create({
      model: env.anthropic.model,
      max_tokens: 1000,
      system: run.system,
      tools: run.tools,
      messages,
    });

    const textos = response.content.filter((b): b is Anthropic.TextBlock => b.type === 'text');
    if (textos.length) ultimoTexto = textos.map((t) => t.text).join('\n').trim();

    if (response.stop_reason !== 'tool_use') break;

    // Ejecuta TODAS las tool calls de este turno y devuelve los resultados en un solo mensaje.
    const toolUses = response.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');
    messages.push({ role: 'assistant', content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      let out: string;
      try {
        out = await run.ejecutar(tu.name, (tu.input ?? {}) as Record<string, unknown>);
      } catch (e) {
        out = `Error interno al ejecutar la herramienta: ${e instanceof Error ? e.message : 'desconocido'}`;
      }
      results.push({ type: 'tool_result', tool_use_id: tu.id, content: out, is_error: out.startsWith('Error') });
    }
    messages.push({ role: 'user', content: results });
  }

  return ultimoTexto || 'Listo. ✅';
}
