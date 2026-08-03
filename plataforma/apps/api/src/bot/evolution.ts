import { env } from '../env';

/**
 * Manejo de la instancia de Evolution API dedicada al CHATBOT (env.evolution.botInstance).
 * Es una instancia separada de la de notificaciones/reportes: se empareja con un número
 * de WhatsApp propio del bot, no con el de la empresa.
 */

function base(): { url: string; key: string; instance: string } | null {
  const { url, key, botInstance } = env.evolution;
  if (!url || !key || !botInstance) return null;
  return { url: url.replace(/\/$/, ''), key, instance: botInstance };
}

async function evo(path: string, init?: RequestInit): Promise<Response | null> {
  const cfg = base();
  if (!cfg) return null;
  try {
    return await fetch(`${cfg.url}${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', apikey: cfg.key, ...(init?.headers ?? {}) },
    });
  } catch {
    return null;
  }
}

export interface BotEstado {
  /** Hay EVOLUTION_URL/KEY configurados en el entorno. */
  configurado: boolean;
  instancia: string;
  /** 'open' (conectado) | 'connecting' | 'close' | 'no_creada' | 'desconocido'. */
  estado: string;
  /** Número emparejado (si está conectado). */
  numero: string | null;
}

/** Estado actual de la instancia del bot (y su número emparejado, si lo hay). */
export async function estadoBot(): Promise<BotEstado> {
  const cfg = base();
  if (!cfg) return { configurado: false, instancia: '', estado: 'desconocido', numero: null };

  const res = await evo(`/instance/connectionState/${cfg.instance}`);
  if (!res) return { configurado: true, instancia: cfg.instance, estado: 'desconocido', numero: null };
  if (res.status === 404) return { configurado: true, instancia: cfg.instance, estado: 'no_creada', numero: null };

  let estado = 'desconocido';
  try {
    const data = (await res.json()) as { instance?: { state?: string } };
    estado = data.instance?.state ?? 'desconocido';
  } catch {
    /* respuesta rara: se queda 'desconocido' */
  }

  // El número emparejado sale de fetchInstances (Evolution v2: shape plano).
  let numero: string | null = null;
  const list = await evo(`/instance/fetchInstances?instanceName=${encodeURIComponent(cfg.instance)}`);
  if (list?.ok) {
    try {
      const arr = (await list.json()) as { name?: string; number?: string | null; ownerJid?: string | null }[];
      const inst = arr.find((i) => i.name === cfg.instance);
      numero = inst?.number || (inst?.ownerJid ? inst.ownerJid.split('@')[0]! : null);
    } catch {
      /* sin número */
    }
  }
  return { configurado: true, instancia: cfg.instance, estado, numero };
}

/** Registra (idempotente) el webhook de mensajes entrantes hacia esta API. */
export async function registrarWebhookBot(): Promise<boolean> {
  const cfg = base();
  if (!cfg) return false;
  const res = await evo(`/webhook/set/${cfg.instance}`, {
    method: 'POST',
    body: JSON.stringify({
      webhook: {
        enabled: true,
        url: `${env.publicApiUrl.replace(/\/$/, '')}/api/bot/webhook?secret=${cfg.key}`,
        events: ['MESSAGES_UPSERT'],
        byEvents: false,
        base64: false,
      },
    }),
  });
  return !!res?.ok;
}

/**
 * Prepara la conexión del bot: crea la instancia si no existe, registra el webhook y
 * devuelve el QR (base64) para emparejar el número. Si ya está conectado, no hay QR.
 */
export async function conectarBot(): Promise<{ estado: string; qr: string | null; pairingCode: string | null }> {
  const cfg = base();
  if (!cfg) return { estado: 'desconocido', qr: null, pairingCode: null };

  // Crea la instancia si aún no existe (idempotente: 403/409 si ya está).
  const st = await estadoBot();
  if (st.estado === 'no_creada') {
    await evo('/instance/create', {
      method: 'POST',
      body: JSON.stringify({ instanceName: cfg.instance, integration: 'WHATSAPP-BAILEYS', qrcode: false }),
    });
  }
  await registrarWebhookBot();

  const res = await evo(`/instance/connect/${cfg.instance}`);
  if (!res?.ok) return { estado: (await estadoBot()).estado, qr: null, pairingCode: null };
  try {
    const data = (await res.json()) as { base64?: string; code?: string; pairingCode?: string; instance?: { state?: string } };
    if (data.instance?.state === 'open') return { estado: 'open', qr: null, pairingCode: null };
    return { estado: 'connecting', qr: data.base64 ?? null, pairingCode: data.pairingCode ?? null };
  } catch {
    return { estado: 'desconocido', qr: null, pairingCode: null };
  }
}

/** Cierra la sesión de WhatsApp del bot (habrá que volver a escanear el QR). */
export async function desconectarBot(): Promise<boolean> {
  const cfg = base();
  if (!cfg) return false;
  const res = await evo(`/instance/logout/${cfg.instance}`, { method: 'DELETE' });
  return !!res?.ok;
}

/** Envía un texto DESDE la instancia del bot (no desde la de notificaciones). */
export async function enviarTextoBot(numero: string, text: string): Promise<boolean> {
  const cfg = base();
  if (!cfg || !numero) return false;
  const res = await evo(`/message/sendText/${cfg.instance}`, {
    method: 'POST',
    body: JSON.stringify({ number: numero, text }),
  });
  return !!res?.ok;
}
