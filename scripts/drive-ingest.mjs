#!/usr/bin/env node
/**
 * drive-ingest.mjs — Script ONE-SHOT que corre LOCAL en tu Mac.
 *
 * Descarga todas las fotos del folder de Google Drive del usuario,
 * convierte HEIC a JPG, las clasifica con Gemini Vision, genera embeddings
 * con OpenAI, y las sube a Supabase Storage + tabla dishes.
 *
 * NO corre en un VPS. NO forma parte del bot en runtime.
 * Solo se ejecuta 1 vez al inicio, y luego cuando agregues fotos nuevas.
 *
 * USO:
 *   1) cd ~/montaña\ Dorada/scripts
 *   2) npm install
 *   3) cp .env.example .env    (y llenar las credenciales)
 *   4) node drive-ingest.mjs
 *
 * REQUISITOS:
 *   - Node.js 20+
 *   - Cuenta Google con acceso al Drive folder
 *   - Supabase project creado con schema.sql ya aplicado
 *   - API keys: Google (Drive + Gemini), OpenAI, Supabase
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { google } from 'googleapis';
import sharp from 'sharp';
import heicConvert from 'heic-convert';
import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { createClient } from '@supabase/supabase-js';
import 'dotenv/config';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ----------------------------------------------------------------------------
// Configuración desde .env
// ----------------------------------------------------------------------------
const {
  DRIVE_FOLDER_ID,
  GOOGLE_SERVICE_ACCOUNT_JSON,   // ruta al JSON de service account con acceso al Drive
  GEMINI_API_KEY,
  OPENAI_API_KEY,
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  TMP_DIR = '/tmp/montana-ingest',
} = process.env;

for (const k of ['DRIVE_FOLDER_ID','GOOGLE_SERVICE_ACCOUNT_JSON','GEMINI_API_KEY','OPENAI_API_KEY','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY']) {
  if (!process.env[k]) {
    console.error(`Missing env var: ${k}`);
    process.exit(1);
  }
}

fs.mkdirSync(TMP_DIR, { recursive: true });

// ----------------------------------------------------------------------------
// Clientes
// ----------------------------------------------------------------------------
const auth = new google.auth.GoogleAuth({
  keyFile: GOOGLE_SERVICE_ACCOUNT_JSON,
  scopes: ['https://www.googleapis.com/auth/drive.readonly'],
});
const drive = google.drive({ version: 'v3', auth });
const gemini = new GoogleGenerativeAI(GEMINI_API_KEY);
const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const VISION_MODEL = 'gemini-2.5-flash';
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ----------------------------------------------------------------------------
// Paso 1: Listar archivos del folder del Drive
// ----------------------------------------------------------------------------
async function listDriveFiles(folderId) {
  const files = [];
  let pageToken;
  do {
    const res = await drive.files.list({
      q: `'${folderId}' in parents and trashed=false`,
      fields: 'nextPageToken, files(id,name,mimeType,size)',
      pageSize: 1000,
      pageToken,
    });
    files.push(...(res.data.files || []));
    pageToken = res.data.nextPageToken;
  } while (pageToken);
  return files;
}

// ----------------------------------------------------------------------------
// Paso 2: Descargar archivo a buffer
// ----------------------------------------------------------------------------
async function downloadFile(fileId) {
  const res = await drive.files.get(
    { fileId, alt: 'media' },
    { responseType: 'arraybuffer' },
  );
  return Buffer.from(res.data);
}

// ----------------------------------------------------------------------------
// Paso 3: Convertir HEIC a JPG si hace falta
// ----------------------------------------------------------------------------
async function normalizeToJpg(buffer, filename) {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.heic') || lower.endsWith('.heif')) {
    const jpgBuffer = await heicConvert({
      buffer,
      format: 'JPEG',
      quality: 0.92,
    });
    return Buffer.from(jpgBuffer);
  }
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) {
    return buffer;
  }
  if (lower.endsWith('.png') || lower.endsWith('.webp')) {
    return await sharp(buffer).jpeg({ quality: 92 }).toBuffer();
  }
  throw new Error(`Unsupported format: ${filename}`);
}

// ----------------------------------------------------------------------------
// Paso 4: Clasificar con Gemini Vision
// ----------------------------------------------------------------------------
const CLASSIFICATION_PROMPT = `Analiza esta foto de un plato de restaurante peruano/criollo (Montaña Dorada, especializado en asados, mariscos, parrilladas, ceviches, alitas, costillas y platos criollos).

Devuelve EXCLUSIVAMENTE un JSON con esta estructura exacta:

{
  "es_foto_de_comida": true|false,
  "plato_detectado": "nombre oficial en español (ej: ají de gallina, langostinos empanizados, costillas BBQ, parrillada mixta, ceviche de mariscos, lomo saltado, cordon bleu, alitas BBQ)",
  "categoria": "asados | mariscos | parrilladas | ceviches | alitas | costillas | platos_criollos | cortes | arroces | ensaladas | postres | bebidas | otros",
  "ingredientes_visibles": ["lista","de","ingredientes"],
  "descripcion_rica": "descripción de 2-3 oraciones rica en keywords para búsqueda semántica (incluir ingredientes, técnica, acompañamientos, colores, apariencia)",
  "calidad_fotografica": 1-5,
  "tiene_marca_agua": true|false,
  "notas": "cualquier observación relevante (ej: plato muy oscuro, foto movida, ambiente del local visible)"
}

Si la foto NO es de comida (ej: logo del restaurante, uniforme, foto del local, staff), pon "es_foto_de_comida": false y rellena el resto con null excepto "notas".

No agregues NADA fuera del JSON.`;

async function classifyWithGemini(jpgBuffer) {
  const model = gemini.getGenerativeModel({ model: VISION_MODEL });
  const result = await model.generateContent([
    {
      inlineData: {
        mimeType: 'image/jpeg',
        data: jpgBuffer.toString('base64'),
      },
    },
    { text: CLASSIFICATION_PROMPT },
  ]);
  const text = result.response.text();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`Gemini did not return JSON: ${text.slice(0,200)}`);
  return JSON.parse(jsonMatch[0]);
}

// ----------------------------------------------------------------------------
// Paso 5: Generar embedding con OpenAI
// ----------------------------------------------------------------------------
async function embed(text) {
  const r = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text,
  });
  return r.data[0].embedding;
}

// ----------------------------------------------------------------------------
// Paso 6: Subir a Supabase Storage
// ----------------------------------------------------------------------------
async function uploadToBucket(bucket, pathInBucket, buffer, contentType='image/jpeg') {
  const { error } = await supabase.storage.from(bucket).upload(pathInBucket, buffer, {
    contentType,
    upsert: true,
  });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(pathInBucket);
  return data.publicUrl;
}

// ----------------------------------------------------------------------------
// Paso 7: Insertar/actualizar en tabla dishes
// ----------------------------------------------------------------------------
async function upsertDish(dish) {
  const { data, error } = await supabase
    .from('dishes')
    .upsert(dish, { onConflict: 'id' })
    .select()
    .single();
  if (error) throw error;
  return data;
}

// ----------------------------------------------------------------------------
// Main
// ----------------------------------------------------------------------------
async function main() {
  console.log('🔎 Listing Drive folder...');
  const files = await listDriveFiles(DRIVE_FOLDER_ID);
  console.log(`   Found ${files.length} files.`);

  const imageFiles = files.filter(f => /^image\/|heic|heif/i.test(f.mimeType) ||
                                       /\.(jpg|jpeg|png|webp|heic|heif)$/i.test(f.name));
  const skipped = files.length - imageFiles.length;
  console.log(`   ${imageFiles.length} images, ${skipped} non-image (videos/etc) skipped.`);

  const report = { processed: 0, skipped_non_food: 0, errors: 0, cost_estimate_usd: 0 };

  for (const f of imageFiles) {
    try {
      console.log(`\n→ ${f.name} (${f.mimeType})`);

      // Cache local para no re-descargar si re-ejecutas
      const cachePath = path.join(TMP_DIR, f.id + '.jpg');
      let jpgBuffer;
      if (fs.existsSync(cachePath)) {
        jpgBuffer = fs.readFileSync(cachePath);
        console.log('  [cache hit]');
      } else {
        const buf = await downloadFile(f.id);
        jpgBuffer = await normalizeToJpg(buf, f.name);
        fs.writeFileSync(cachePath, jpgBuffer);
        console.log(`  downloaded + normalized (${jpgBuffer.length} bytes)`);
      }

      // Clasificar
      const meta = await classifyWithGemini(jpgBuffer);
      report.cost_estimate_usd += 0.002;  // ~rough estimate
      if (!meta.es_foto_de_comida) {
        console.log(`  ✗ not food (${meta.notas || 'n/a'}) → skipping dish table`);
        // pero sí lo subimos a brand-lifestyle si es staff/local
        if (meta.notas && /(local|staff|uniforme|ambiente|fachada|interior)/i.test(meta.notas)) {
          const url = await uploadToBucket('brand-lifestyle', `${f.id}.jpg`, jpgBuffer);
          console.log(`  ✓ uploaded to brand-lifestyle: ${url}`);
        }
        report.skipped_non_food++;
        continue;
      }

      console.log(`  ✓ ${meta.plato_detectado} (categoria=${meta.categoria}, calidad=${meta.calidad_fotografica}/5)`);

      // Subir original
      const originalUrl = await uploadToBucket('dishes-original', `${f.id}.jpg`, jpgBuffer);

      // Embedding
      const embText = `${meta.plato_detectado}. ${meta.descripcion_rica} Ingredientes: ${(meta.ingredientes_visibles || []).join(', ')}. Categoría: ${meta.categoria}.`;
      const embedding = await embed(embText);

      // Upsert dish
      const dishId = crypto.createHash('sha256').update(f.id).digest('hex').slice(0, 32);
      const uuid = [dishId.slice(0,8), dishId.slice(8,12), '4'+dishId.slice(13,16), '8'+dishId.slice(17,20), dishId.slice(20,32)].join('-');

      await upsertDish({
        id: uuid,
        name: meta.plato_detectado,
        category: meta.categoria,
        tags: meta.ingredientes_visibles || [],
        description: embText,
        quality_score: meta.calidad_fotografica || 3,
        source: 'drive',
        storage_original: originalUrl,
        storage_enhanced: null,  // se llenará en la fase de enhance opcional
        embedding,
        metadata: {
          drive_file_id: f.id,
          drive_name: f.name,
          heic_origin: /\.heic$/i.test(f.name),
          gemini_meta: meta,
          ingested_at: new Date().toISOString(),
        },
      });

      console.log(`  ✓ upserted dish ${uuid}`);
      report.processed++;

    } catch (err) {
      console.error(`  ✗ ERROR in ${f.name}: ${err.message}`);
      report.errors++;
    }
  }

  console.log('\n\n================ REPORT ================');
  console.log(JSON.stringify(report, null, 2));
  console.log('========================================\n');
  console.log('Siguiente paso (opcional): correr `node enhance-batch.mjs` para mejorar las fotos con calidad < 4.');
}

main().catch(e => { console.error(e); process.exit(1); });
