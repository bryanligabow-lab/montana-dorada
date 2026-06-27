import { env } from '../env';

/**
 * Envía un texto por WhatsApp vía Evolution API (al grupo configurado).
 * No-op si faltan credenciales. `number` puede ser un JID de grupo (…@g.us).
 */
export async function sendWhatsApp(text: string): Promise<boolean> {
  const { url, key, instance, group } = env.evolution;
  if (!url || !key || !instance || !group) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: group, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
