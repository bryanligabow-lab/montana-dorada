import { env } from '../env';

/**
 * Envía un texto por WhatsApp vía Evolution API a un número o grupo puntual.
 * No-op si faltan credenciales o no hay destino. `numero` puede ser un
 * número de teléfono o un JID de grupo (…@g.us). Si se omite, cae al grupo
 * global configurado por entorno (compatibilidad con instalaciones viejas).
 */
export async function sendWhatsApp(text: string, numero?: string): Promise<boolean> {
  const { url, key, instance, group } = env.evolution;
  const destino = numero || group;
  if (!url || !key || !instance || !destino) return false;
  try {
    const res = await fetch(`${url.replace(/\/$/, '')}/message/sendText/${instance}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: key },
      body: JSON.stringify({ number: destino, text }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
