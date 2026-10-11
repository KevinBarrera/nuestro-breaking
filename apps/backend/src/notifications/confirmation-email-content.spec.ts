import { buildConfirmationEmail, type ConfirmationEmailInput } from './confirmation-email-content';

const INPUT: ConfirmationEmailInput = {
  firstName: 'Ana',
  fullName: 'Ana López Pérez',
  eventName: 'Los más pesados',
  eventTimeZone: 'America/Mexico_City',
  // 10:00 in Mexico City.
  eventStartsAt: new Date('2026-11-14T16:00:00Z'),
  folio: 'LMP-AB12',
  passes: [
    { name: 'Pase completo Breaking', competitions: ['Breaking 1v1', 'Popping 1v1'] },
    { name: 'Open Styles', competitions: [] },
  ],
};

describe('buildConfirmationEmail', () => {
  it('names the event and the folio in the subject', () => {
    expect(buildConfirmationEmail(INPUT).subject).toBe(
      'Tu inscripción a Los más pesados está confirmada · Folio LMP-AB12',
    );
  });

  it('greets the buyer and lists the event, date, folio, passes and competitions', () => {
    const { text, html } = buildConfirmationEmail(INPUT);

    for (const body of [text, html]) {
      expect(body).toContain('Hola, Ana');
      expect(body).toContain('Los más pesados');
      expect(body).toContain('sábado, 14 de noviembre de 2026');
      expect(body).toContain('10:00');
      expect(body).toContain('LMP-AB12');
      expect(body).toContain('Pase completo Breaking');
      expect(body).toContain('Breaking 1v1, Popping 1v1');
      expect(body).toContain('Open Styles');
      expect(body).toContain('Muestra este folio en la entrada');
    }
  });

  it('shows the date in the event time zone', () => {
    const { text } = buildConfirmationEmail({ ...INPUT, eventTimeZone: 'Europe/Madrid' });

    expect(text).toMatch(/sábado, 14 de noviembre de 2026, 5:00\sp\.\s?m\./u);
  });

  it('lists a pass without competitions without a competitions line', () => {
    const { text } = buildConfirmationEmail({
      ...INPUT,
      passes: [{ name: 'Open Styles', competitions: [] }],
    });

    expect(text).toContain('Open Styles');
    expect(text).not.toContain('Competencias');
  });

  it('uses the first word of the full name when there is no first name', () => {
    const { text, html } = buildConfirmationEmail({
      ...INPUT,
      firstName: null,
      fullName: '  Beto   Ramírez ',
    });

    expect(text).toContain('Hola, Beto:');
    expect(html).toContain('Hola, Beto:');
  });

  it('leaves the date out when the event has none', () => {
    const { text, html } = buildConfirmationEmail({ ...INPUT, eventStartsAt: null });

    expect(text).not.toContain('Fecha');
    expect(html).not.toContain('Fecha');
    expect(text).toContain('LMP-AB12');
  });

  it('leaves the date out when the event time zone is invalid', () => {
    const { text } = buildConfirmationEmail({ ...INPUT, eventTimeZone: 'Not/AZone' });

    expect(text).not.toContain('Fecha');
  });

  it('escapes every interpolated value in the HTML body', () => {
    const { html, text } = buildConfirmationEmail({
      ...INPUT,
      firstName: '<script>alert(1)</script>',
      eventName: 'Tom & "Jerry"',
      folio: "LMP-<b>'",
      passes: [{ name: '<img src=x>', competitions: ['<a href="x">1v1</a>'] }],
    });

    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<a href');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('Tom &amp; &quot;Jerry&quot;');
    expect(html).toContain('LMP-&lt;b&gt;&#39;');
    expect(html).toContain('&lt;a href=&quot;x&quot;&gt;1v1&lt;/a&gt;');
    // The plain-text body is not HTML, so it keeps the values as they are.
    expect(text).toContain('Tom & "Jerry"');
  });

  it('keeps line breaks out of the subject', () => {
    const { subject } = buildConfirmationEmail({ ...INPUT, eventName: 'Los más\r\npesados' });

    expect(subject).toBe('Tu inscripción a Los más pesados está confirmada · Folio LMP-AB12');
  });

  it('never includes payment data, the email address or external assets', () => {
    const { subject, html, text } = buildConfirmationEmail(INPUT);

    for (const body of [subject, html, text]) {
      expect(body).not.toMatch(/\$|MXN|pagad|Mercado Pago|tarjeta|OXXO|SPEI|@/i);
    }
    expect(html).not.toMatch(/<img|<link|https?:\/\//i);
  });
});
