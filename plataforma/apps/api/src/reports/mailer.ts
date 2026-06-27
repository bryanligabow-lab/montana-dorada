import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env';

let transporter: Transporter | null = null;

function getTransporter(): Transporter | null {
  if (!env.smtp.host) return null;
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.port === 465,
      auth: env.smtp.user ? { user: env.smtp.user, pass: env.smtp.pass } : undefined,
    });
  }
  return transporter;
}

export async function sendMail(opts: {
  to: string[];
  subject: string;
  html: string;
  text?: string;
}): Promise<boolean> {
  const t = getTransporter();
  if (!t || opts.to.length === 0) return false;
  await t.sendMail({
    from: env.mailFrom,
    to: opts.to.join(','),
    subject: opts.subject,
    html: opts.html,
    text: opts.text,
  });
  return true;
}
