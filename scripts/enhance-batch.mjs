#!/usr/bin/env node
/**
 * enhance-batch.mjs — Paso opcional después de drive-ingest.
 *
 * Toma las fotos con quality_score < 4 del catálogo, las pasa por:
 *   1) Gemini 2.5 Flash Image edit (mejora gastronómica)
 *   2) Replicate Real-ESRGAN x4 (upscale a 4K)
 * y actualiza la columna storage_enhanced con la URL de la versión pulida.
 *
 * USO:
 *   node enhance-batch.mjs [--limit 20]
 */

import crypto from 'node:crypto';
import fetch from 'node-fetch';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const {
  GEMINI_API_KEY,
  REPLICATE_API_TOKEN,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
} = process.env;

for (const k of ['GEMINI_API_KEY','REPLICATE_API_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[k]) { console.error(`Missing env var: ${k}`); process.exit(1); }
}

const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const LIMIT = Number(process.argv.find(a => a.startsWith('--limit='))?.split('=')[1]
                    || process.argv[process.argv.indexOf('--limit') + 1]
                    || 50);

const ENHANCE_PROMPT = `Transform this into a professional restaurant food photograph while keeping the exact same dish, ingredients and composition identical. Apply:
- Dramatic studio lighting with warm backlight
- Moody dark restaurant ambiance, rustic background
- Enhanced color saturation, warmer tones
- Crisp sharp focus, clean background without distracting elements
- Visible texture of ingredients, sauce drizzle, fresh herbs
- Subtle steam/vapor effect if the dish is hot
- Bon Appetit magazine aesthetic, hyperrealistic food photography
- DO NOT change the type of food or add/remove ingredients
- Output format: high quality JPEG, sharp focus
`;

async function geminiEnhance(imageUrl) {
  const imgRes = await fetch(imageUrl);
  const buf = Buffer.from(await imgRes.arrayBuffer());
  const mimeType = imgRes.headers.get('content-type') || 'image/jpeg';

  const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash-image' });
  const result = await model.generateContent([
    { inlineData: { mimeType, data: buf.toString('base64') } },
    { text: ENHANCE_PROMPT },
  ]);

  // La respuesta de gemini-2.5-flash-image contiene una parte con inlineData (la imagen generada).
  const parts = result.response.candidates?.[0]?.content?.parts || [];
  const imgPart = parts.find(p => p.inlineData);
  if (!imgPart) throw new Error('Gemini did not return an image part');
  return Buffer.from(imgPart.inlineData.data, 'base64');
}

async function realEsrganUpscale(imageBuffer) {
  // Replicate prediction: nightmareai/real-esrgan
  const createRes = await fetch('https://api.replicate.com/v1/predictions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${REPLICATE_API_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      version: '42fed1c4974146d4d2414e2be2c5277c7fcf05fcc3a73abf41610695738c1d7b', // real-esrgan
      input: {
        image: 'data:image/jpeg;base64,' + imageBuffer.toString('base64'),
        scale: 4,
        face_enhance: false,
      },
    }),
  });
  const pred = await createRes.json();
  if (!pred.id) throw new Error(`Replicate error: ${JSON.stringify(pred)}`);

  let status = pred;
  while (status.status === 'starting' || status.status === 'processing') {
    await new Promise(r => setTimeout(r, 2000));
    const r = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_API_TOKEN}` },
    });
    status = await r.json();
  }
  if (status.status !== 'succeeded') throw new Error(`Replicate failed: ${status.error}`);

  const outUrl = Array.isArray(status.output) ? status.output[0] : status.output;
  const outRes = await fetch(outUrl);
  return Buffer.from(await outRes.arrayBuffer());
}

async function uploadEnhanced(path, buffer) {
  const { error } = await supabase.storage
    .from('dishes-enhanced')
    .upload(path, buffer, { contentType: 'image/jpeg', upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from('dishes-enhanced').getPublicUrl(path);
  return data.publicUrl;
}

async function main() {
  console.log(`🪄 Enhancing up to ${LIMIT} dishes with quality_score < 4 and no storage_enhanced...`);
  const { data: dishes, error } = await supabase
    .from('dishes')
    .select('id,name,storage_original,quality_score,storage_enhanced')
    .lt('quality_score', 4)
    .is('storage_enhanced', null)
    .limit(LIMIT);
  if (error) throw error;
  console.log(`   Found ${dishes.length} dishes to enhance.`);

  let ok = 0, fail = 0;
  for (const d of dishes) {
    try {
      console.log(`\n→ ${d.name} (id=${d.id.slice(0,8)}..., quality=${d.quality_score})`);
      const enhanced = await geminiEnhance(d.storage_original);
      console.log('  ✓ gemini enhanced');
      const upscaled = await realEsrganUpscale(enhanced);
      console.log('  ✓ real-esrgan x4 upscaled');
      const url = await uploadEnhanced(`${d.id}.jpg`, upscaled);
      await supabase.from('dishes').update({ storage_enhanced: url }).eq('id', d.id);
      console.log(`  ✓ saved ${url}`);
      ok++;
    } catch (e) {
      console.error(`  ✗ ${e.message}`);
      fail++;
    }
  }
  console.log(`\n================ REPORT ================\nOK: ${ok}\nFAIL: ${fail}\n========================================`);
}

main().catch(e => { console.error(e); process.exit(1); });
