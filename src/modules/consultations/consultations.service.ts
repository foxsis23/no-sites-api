import nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';
import type { SmtpConfig } from '../../config.js';

export interface ConsultationInput {
  name: string;
  phone: string;
  bank: string;
  role: string;
  message: string;
}

let transporter: Transporter | null = null;

function getTransporter(smtp: SmtpConfig): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.port === 465,
      auth: { user: smtp.user, pass: smtp.pass },
    });
  }
  return transporter;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export async function sendConsultationEmail(
  smtp: SmtpConfig,
  recipient: string,
  input: ConsultationInput,
  sourceDomain: string | null,
): Promise<void> {
  const rows: ReadonlyArray<readonly [string, string]> = [
    ["Ім'я", input.name],
    ['Телефон', input.phone],
    ['Банк', input.bank],
    ['Хто ви', input.role],
    ['Проблема', input.message],
  ];

  const subjectSuffix = sourceDomain ? ` — ${sourceDomain}` : '';
  const heading = `Нова заявка на консультацію${
    sourceDomain ? ` (${escapeHtml(sourceDomain)})` : ''
  }`;

  const html = `<h2>${heading}</h2>
<table cellpadding="6" style="border-collapse:collapse">
${rows
  .map(
    ([label, value]) =>
      `<tr><td style="font-weight:bold;vertical-align:top">${escapeHtml(
        label,
      )}</td><td>${escapeHtml(value).replace(/\n/g, '<br>')}</td></tr>`,
  )
  .join('\n')}
</table>`;

  const text = rows.map(([label, value]) => `${label}: ${value}`).join('\n');

  await getTransporter(smtp).sendMail({
    from: smtp.from,
    to: recipient,
    subject: `Заявка на консультацію${subjectSuffix}`,
    text,
    html,
  });
}
