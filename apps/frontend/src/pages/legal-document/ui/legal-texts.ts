import type { LegalDocumentKey } from '@/shared/config';

// Placeholder texts (#180): they only say what each final document will cover. The organizer
// delivers the final texts before launch (#182); publishing one changes its version in both apps.
export const legalTexts: Record<LegalDocumentKey, string[]> = {
  rules: [
    'El reglamento oficial describirá las reglas de participación del evento: categorías, formato de las competencias, conducta esperada y criterios de los jueces.',
    'Al aceptarlo antes de pagar, confirmas que lo leíste y que participarás conforme a él.',
  ],
  privacy: [
    'El aviso de privacidad explicará quién es responsable de tus datos personales, para qué se usan (tu inscripción, tu acceso al evento y los avisos sobre tu compra), con quién se comparten y cómo ejercer tus derechos sobre ellos.',
    'Al aceptarlo antes de pagar, autorizas el uso de tus datos para esos fines.',
  ],
  cancellation: [
    'La política de cancelación explicará qué pasa con tu inscripción si no puedes asistir o si el evento cambia.',
    'Las compras en línea de este evento no tienen reembolso.',
  ],
};
