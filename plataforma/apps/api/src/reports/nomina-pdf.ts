import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';
import type { NominaRow } from '@asis/shared';

const money = (n: number) => `$${n.toFixed(2)}`;

/** '#43A047' → rgb() de pdf-lib (0-1). Cae a un verde por defecto si el hex es inválido. */
function hexToRgb(hex: string) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m?.[1]) return rgb(0.26, 0.63, 0.28);
  const int = parseInt(m[1], 16);
  return rgb(((int >> 16) & 255) / 255, ((int >> 8) & 255) / 255, (int & 255) / 255);
}

interface Fonts {
  reg: PDFFont;
  bold: PDFFont;
}

interface PdfOpts {
  negocio: string;
  desde: string;
  hasta: string;
  /** Color de marca del negocio (hex) para el encabezado. */
  primary?: string;
}

function encabezado(page: PDFPage, fonts: Fonts, opts: PdfOpts, titulo: string): number {
  const { width, height } = page.getSize();
  const brand = hexToRgb(opts.primary ?? '#43A047');
  page.drawRectangle({ x: 0, y: height - 90, width, height: 90, color: brand });
  page.drawText(opts.negocio, { x: 40, y: height - 45, size: 20, font: fonts.bold, color: rgb(1, 1, 1) });
  page.drawText(titulo, { x: 40, y: height - 68, size: 12, font: fonts.reg, color: rgb(1, 1, 1) });
  page.drawText(`Período: ${opts.desde} a ${opts.hasta}`, {
    x: 40,
    y: height - 84,
    size: 9,
    font: fonts.reg,
    color: rgb(1, 1, 1),
  });
  return height - 120; // y inicial del contenido
}

/** Recibo individual de un empleado (para enviárselo por WhatsApp). */
export async function pdfReciboEmpleado(row: NominaRow, opts: PdfOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([420, 595]); // media carta vertical, cómodo para el celular
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  let y = encabezado(page, fonts, opts, 'Recibo de nómina');

  page.drawText(row.nombre, { x: 40, y, size: 14, font: fonts.bold, color: rgb(0.1, 0.1, 0.1) });
  y -= 16;
  page.drawText(`Código ${row.codigo} · ${row.tipoSueldo === 'FIJO' ? 'sueldo fijo' : 'por día'}`, {
    x: 40,
    y,
    size: 9,
    font: fonts.reg,
    color: rgb(0.45, 0.45, 0.45),
  });
  y -= 28;

  const linea = (label: string, valor: string, resaltar = false) => {
    const f = resaltar ? fonts.bold : fonts.reg;
    const size = resaltar ? 13 : 11;
    page.drawText(label, { x: 40, y, size, font: f, color: rgb(0.2, 0.2, 0.2) });
    page.drawText(valor, {
      x: 380 - fonts.reg.widthOfTextAtSize(valor, size) - (resaltar ? fonts.bold.widthOfTextAtSize(valor, size) - fonts.reg.widthOfTextAtSize(valor, size) : 0),
      y,
      size,
      font: f,
      color: rgb(0.1, 0.1, 0.1),
    });
    y -= resaltar ? 24 : 20;
  };

  linea('Días trabajados', String(row.diasTrabajados));
  linea('Horas extra', `${row.horasExtra} h`);
  linea('Sueldo base', money(row.sueldoBase));
  if (row.pagoHoraExtra > 0) linea('Pago hora extra', `+${money(row.pagoHoraExtra)}`);
  if (row.multaGanada > 0) linea('Bono puntualidad', `+${money(row.multaGanada)}`);
  if (row.multaPagada > 0) linea('Multa por atraso', `-${money(row.multaPagada)}`);
  if (row.multaManual > 0) linea('Multas', `-${money(row.multaManual)}`);
  if (row.anticipos > 0) linea('Anticipos', `-${money(row.anticipos)}`);

  // Línea divisoria y total.
  y -= 4;
  page.drawLine({ start: { x: 40, y: y + 8 }, end: { x: 380, y: y + 8 }, thickness: 1, color: rgb(0.8, 0.8, 0.8) });
  y -= 8;
  linea('TOTAL A RECIBIR', money(row.totalARecibir), true);

  return doc.save();
}

/** Informe completo del período para el dueño: tabla con todos los empleados. */
export async function pdfNominaNegocio(rows: NominaRow[], opts: PdfOpts): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const fonts: Fonts = {
    reg: await doc.embedFont(StandardFonts.Helvetica),
    bold: await doc.embedFont(StandardFonts.HelveticaBold),
  };
  let page = doc.addPage([842, 595]); // A4 horizontal para la tabla
  let y = encabezado(page, fonts, opts, 'Informe de nómina');

  const cols = [
    { x: 40, label: 'Empleado', w: 180 },
    { x: 230, label: 'Días', w: 45 },
    { x: 285, label: 'H. extra', w: 55 },
    { x: 350, label: 'Sueldo', w: 70 },
    { x: 425, label: 'Extra $', w: 60 },
    { x: 495, label: 'Multa', w: 60 },
    { x: 560, label: 'Anticipo', w: 65 },
    { x: 640, label: 'Total', w: 70 },
  ];
  const drawRow = (cells: string[], font: PDFFont, size: number, color = rgb(0.15, 0.15, 0.15)) => {
    cols.forEach((c, i) => {
      const txt = cells[i] ?? '';
      // Números alineados a la derecha (todas menos la primera columna).
      const x = i === 0 ? c.x : c.x + c.w - font.widthOfTextAtSize(txt, size);
      page.drawText(txt, { x, y, size, font, color });
    });
    y -= 18;
  };

  drawRow(cols.map((c) => c.label), fonts.bold, 9, rgb(0.4, 0.4, 0.4));
  page.drawLine({ start: { x: 40, y: y + 10 }, end: { x: 720, y: y + 10 }, thickness: 0.7, color: rgb(0.8, 0.8, 0.8) });
  y -= 4;

  let total = 0;
  for (const r of rows) {
    if (y < 60) {
      page = doc.addPage([842, 595]);
      y = encabezado(page, fonts, opts, 'Informe de nómina (cont.)');
    }
    total += r.totalARecibir;
    const multas = r.multaPagada + r.multaManual;
    drawRow(
      [
        r.nombre.length > 30 ? r.nombre.slice(0, 29) + '…' : r.nombre,
        String(r.diasTrabajados),
        `${r.horasExtra}h`,
        money(r.sueldoBase),
        money(r.pagoHoraExtra),
        multas > 0 ? `-${money(multas)}` : money(0),
        r.anticipos > 0 ? `-${money(r.anticipos)}` : money(0),
        money(r.totalARecibir),
      ],
      fonts.reg,
      9,
    );
  }

  page.drawLine({ start: { x: 40, y: y + 10 }, end: { x: 720, y: y + 10 }, thickness: 1, color: rgb(0.6, 0.6, 0.6) });
  y -= 6;
  page.drawText('TOTAL NÓMINA DEL PERÍODO', { x: 40, y, size: 11, font: fonts.bold, color: rgb(0.1, 0.1, 0.1) });
  const totalTxt = money(total);
  page.drawText(totalTxt, { x: 710 - fonts.bold.widthOfTextAtSize(totalTxt, 12), y, size: 12, font: fonts.bold, color: hexToRgb(opts.primary ?? '#43A047') });

  return doc.save();
}
