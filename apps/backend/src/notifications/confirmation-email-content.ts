import { displayFirstName } from './registration-summary';

export interface ConfirmationEmailPass {
  name: string;
  /** Selected competition names, in start order; may be empty. */
  competitions: string[];
}

/** What the confirmation email shows. Built from the database when sending (#179 D4). */
export interface ConfirmationEmailInput {
  firstName: string | null;
  fullName: string;
  eventName: string;
  /** IANA time zone the event date is shown in. */
  eventTimeZone: string;
  eventStartsAt: Date | null;
  folio: string;
  passes: ConfirmationEmailPass[];
  /**
   * What an online buyer paid (#239): the passes and the service charge of the approved payment's
   * checkout. Null for cash and manual registrations, which show no amounts.
   */
  payment: { passesCents: number; serviceChargeCents: number } | null;
}

export interface ConfirmationEmailContent {
  subject: string;
  html: string;
  text: string;
}

/**
 * Renders the Spanish confirmation email (#179 D4). Amounts appear only in the payment summary of an
 * online purchase with a service charge (#239); it never shows payment ids, the payment method or
 * the buyer's address. Every interpolated value is escaped in the HTML body,
 * because names come from buyers and admins. The HTML uses inline styles and no external assets.
 */
export function buildConfirmationEmail(input: ConfirmationEmailInput): ConfirmationEmailContent {
  const name = displayFirstName(input.firstName, input.fullName);
  const eventName = singleLine(input.eventName);
  const date = eventDate(input.eventStartsAt, input.eventTimeZone);
  const subject = `Tu inscripción a ${eventName} está confirmada · Folio ${singleLine(input.folio)}`;
  return { subject, text: textBody(input, name, date), html: htmlBody(input, name, date) };
}

const ENTRANCE_LINE = 'Muestra este folio en la entrada del evento para recibir tu acceso.';

const MXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });

/** Payment summary rows, or none when nothing was charged on top of the passes. */
function paymentRows(input: ConfirmationEmailInput): [string, string][] {
  const payment = input.payment;
  if (!payment || payment.serviceChargeCents <= 0) return [];
  const total = payment.passesCents + payment.serviceChargeCents;
  return [
    ['Pases', MXN.format(payment.passesCents / 100)],
    ['Cargo por servicio', MXN.format(payment.serviceChargeCents / 100)],
    ['Total pagado', `${MXN.format(total / 100)} MXN`],
  ];
}

function textBody(input: ConfirmationEmailInput, name: string, date: string | null): string {
  const lines = [
    `Hola, ${name}:`,
    '',
    `Tu inscripción a ${input.eventName} está confirmada. ¡Gracias por ser parte!`,
    '',
  ];
  if (date) lines.push(`Fecha: ${date}`, '');
  lines.push(`Tu folio: ${input.folio}`, ENTRANCE_LINE, '', 'Tus pases:');
  for (const pass of input.passes) {
    lines.push(`- ${pass.name}`);
    if (pass.competitions.length > 0) lines.push(`  Competencias: ${pass.competitions.join(', ')}`);
  }
  const rows = paymentRows(input);
  if (rows.length > 0)
    lines.push('', 'Resumen de pago:', ...rows.map(([label, amount]) => `${label}: ${amount}`));
  lines.push('', `¡Nos vemos en ${input.eventName}!`);
  return lines.join('\n');
}

function htmlBody(input: ConfirmationEmailInput, name: string, date: string | null): string {
  const event = escapeHtml(input.eventName);
  const passes = input.passes
    .map((pass) => {
      const competitions =
        pass.competitions.length > 0
          ? `<br><span style="color:#555555;font-size:14px;">Competencias: ${escapeHtml(pass.competitions.join(', '))}</span>`
          : '';
      return `<li style="margin:0 0 8px;"><strong>${escapeHtml(pass.name)}</strong>${competitions}</li>`;
    })
    .join('');
  const rows = paymentRows(input);
  const summary =
    rows.length > 0
      ? [
          '<p style="margin:0 0 8px;font-weight:bold;">Resumen de pago</p>',
          '<table role="presentation" style="width:100%;margin:0 0 16px;border-collapse:collapse;">',
          ...rows.map(
            ([label, amount], index) =>
              `<tr${index === rows.length - 1 ? ' style="font-weight:bold;border-top:1px solid #dddddd;"' : ''}><td style="padding:4px 0;">${escapeHtml(label)}</td><td style="padding:4px 0;text-align:right;">${escapeHtml(amount)}</td></tr>`,
          ),
          '</table>',
        ].join('\n')
      : '';
  const dateLine = date
    ? `<p style="margin:0 0 16px;"><strong>Fecha:</strong> ${escapeHtml(date)}</p>`
    : '';
  return [
    '<!doctype html>',
    '<html lang="es"><head><meta charset="utf-8"></head>',
    '<body style="margin:0;padding:24px;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;color:#1a1a1a;line-height:1.5;">',
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:24px;">',
    `<p style="margin:0 0 16px;">Hola, ${escapeHtml(name)}:</p>`,
    `<p style="margin:0 0 16px;">Tu inscripción a <strong>${event}</strong> está confirmada. ¡Gracias por ser parte!</p>`,
    dateLine,
    '<div style="margin:0 0 16px;padding:16px;border-radius:12px;background:#1a1a1a;color:#ffffff;">',
    '<p style="margin:0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">Tu folio</p>',
    `<p style="margin:4px 0 8px;font-family:'Courier New',monospace;font-size:32px;font-weight:bold;letter-spacing:2px;">${escapeHtml(input.folio)}</p>`,
    `<p style="margin:0;font-size:14px;">${ENTRANCE_LINE}</p>`,
    '</div>',
    '<p style="margin:0 0 8px;font-weight:bold;">Tus pases</p>',
    `<ul style="margin:0 0 16px;padding-left:20px;">${passes}</ul>`,
    summary,
    `<p style="margin:0;">¡Nos vemos en ${event}!</p>`,
    '</div>',
    '</body></html>',
  ].join('\n');
}

/** The event start in its own time zone, or null when it has none or the zone is invalid. */
function eventDate(startsAt: Date | null, timeZone: string): string | null {
  if (!startsAt) return null;
  try {
    return new Intl.DateTimeFormat('es-MX', {
      dateStyle: 'full',
      timeStyle: 'short',
      timeZone,
    }).format(startsAt);
  } catch {
    return null;
  }
}

function singleLine(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}
