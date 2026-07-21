import type { FastifyInstance } from 'fastify';
import { nominaQuerySchema } from '@asis/shared';
import { getDb } from '../db';
import { canAccess } from '../lib/http';
import { writeAudit } from '../lib/audit';
import { calcularNominaNegocio } from '../services/nomina';
import { pdfNominaNegocio, pdfReciboEmpleado } from '../reports/nomina-pdf';
import { sendWhatsAppMedia } from '../reports/whatsapp';
import { sendMail } from '../reports/mailer';

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString('base64');

export async function nominaReportRoutes(app: FastifyInstance): Promise<void> {
  // Enviar el informe completo del período al dueño (WhatsApp de reportes + correos configurados).
  app.post(
    '/api/admin/businesses/:id/nomina/enviar-dueno',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const parsed = nominaQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
      const { from, to } = parsed.data;

      const db = await getDb();
      const res = await calcularNominaNegocio(db, id, from, to);
      if (!res) return reply.code(404).send({ error: 'no_encontrado' });
      const { biz, filas } = res;

      if (!biz.reportWhatsapp.length && !biz.reportEmails.length) {
        return reply.code(400).send({ error: 'sin_destinos' }); // no hay a quién enviar
      }

      const pdf = await pdfNominaNegocio(filas, {
        negocio: biz.nombre,
        desde: from,
        hasta: to,
        primary: biz.branding.primary,
      });
      const fileName = `nomina-${biz.slug}-${from}_a_${to}.pdf`;
      const caption = `📄 Informe de nómina ${biz.nombre} · ${from} a ${to}`;

      let whatsapp = 0;
      for (const numero of biz.reportWhatsapp) {
        if (await sendWhatsAppMedia({ numero, base64: b64(pdf), fileName, caption })) whatsapp++;
      }
      const email = biz.reportEmails.length
        ? await sendMail({
            to: biz.reportEmails,
            subject: caption,
            html: `<p>Adjunto el informe de nómina de <b>${biz.nombre}</b> del período ${from} a ${to}.</p>`,
            attachments: [{ filename: fileName, content: Buffer.from(pdf), contentType: 'application/pdf' }],
          })
        : false;

      await writeAudit(db, {
        businessId: id,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'enviar_informe_dueno',
        entidad: 'nomina',
        detalle: { from, to, whatsapp, email },
      });
      return { whatsapp, email: email ? biz.reportEmails.length : 0 };
    },
  );

  // Enviar a cada empleado su propio recibo de nómina en PDF por WhatsApp (a su teléfono).
  app.post(
    '/api/admin/businesses/:id/nomina/enviar-empleados',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const { id } = req.params as { id: string };
      if (!(await canAccess(req, id))) return reply.code(403).send({ error: 'sin_acceso' });
      const parsed = nominaQuerySchema.safeParse(req.query);
      if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });
      const { from, to } = parsed.data;

      const db = await getDb();
      const res = await calcularNominaNegocio(db, id, from, to);
      if (!res) return reply.code(404).send({ error: 'no_encontrado' });
      const { biz, empleados, filas } = res;

      const telByEmp = new Map(empleados.map((e) => [e.id, e.telefono]));
      let enviados = 0;
      let sinTelefono = 0;
      const activos = filas.filter((f) => empleados.find((e) => e.id === f.employeeId)?.estado === 'ACTIVO');

      for (const fila of activos) {
        const tel = telByEmp.get(fila.employeeId);
        if (!tel) {
          sinTelefono++;
          continue;
        }
        const pdf = await pdfReciboEmpleado(fila, {
          negocio: biz.nombre,
          desde: from,
          hasta: to,
          primary: biz.branding.primary,
        });
        const ok = await sendWhatsAppMedia({
          numero: tel,
          base64: b64(pdf),
          fileName: `recibo-${fila.codigo}-${from}_a_${to}.pdf`,
          caption: `📄 Hola ${fila.nombre}, aquí está tu recibo de nómina (${from} a ${to}). Total a recibir: $${fila.totalARecibir.toFixed(2)}`,
        });
        if (ok) enviados++;
      }

      await writeAudit(db, {
        businessId: id,
        userId: req.user.sub,
        actorNombre: req.user.nombre,
        accion: 'enviar_informe_empleados',
        entidad: 'nomina',
        detalle: { from, to, enviados, sinTelefono },
      });
      return { enviados, sinTelefono, total: activos.length };
    },
  );
}
