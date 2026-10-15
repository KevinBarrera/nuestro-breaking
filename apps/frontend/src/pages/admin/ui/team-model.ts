import type { TeamAccess, TeamInvitation, TeamMember } from '@/entities/admin-team';

// Pure view logic for the Equipo screen (#214).

export function accessSummary(access: TeamAccess): string {
  if (access.kind === 'global') return 'Todos los eventos';
  if (access.kind === 'none') return 'Sin acceso';
  if (access.events.length === 0) return 'Sin eventos';
  return access.events.map((event) => event.name).join(', ');
}

const hourMs = 60 * 60 * 1000;

export function expiryHint(expiresAt: string, now: Date): string {
  const hours = Math.floor((Date.parse(expiresAt) - now.getTime()) / hourMs);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    return `Vence en ${days} ${days === 1 ? 'día' : 'días'}`;
  }
  if (hours >= 1) return `Vence en ${hours} ${hours === 1 ? 'hora' : 'horas'}`;
  return 'Vence en menos de 1 hora';
}

// Whether a link still works. The backend flag wins when it says expired; it is computed when
// the list was read, so the clock also closes a link at its expiry instant. Status and actions
// both use this, so a link shown as pending can always be cancelled and vice versa.
export function invitationOpen(invitation: TeamInvitation | null, now: Date): boolean {
  return (
    invitation !== null && !invitation.expired && Date.parse(invitation.expiresAt) > now.getTime()
  );
}

export type StatusTone = 'success' | 'warning' | 'neutral';
export type StatusView = { label: string; tone: StatusTone; hint?: string };

export function memberStatus(member: TeamMember, now: Date): StatusView {
  if (member.status === 'active') return { label: 'Activo', tone: 'success' };
  if (member.status === 'deactivated') return { label: 'Desactivado', tone: 'neutral' };
  if (member.status === 'no_access')
    return {
      label: 'Sin acceso',
      tone: 'neutral',
      hint: 'Usa «Cambiar acceso» para darle eventos',
    };
  const { invitation } = member;
  if (invitation && invitationOpen(invitation, now))
    return {
      label: 'Invitación pendiente',
      tone: 'warning',
      hint: expiryHint(invitation.expiresAt, now),
    };
  return {
    label: invitation ? 'Invitación vencida' : 'Invitación cancelada',
    tone: 'warning',
    hint: 'Genera un enlace nuevo',
  };
}

export type MemberAction =
  'regenerate' | 'cancel-invitation' | 'change-access' | 'deactivate' | 'reactivate';

// The person's own row offers no actions (#214 D9). The backend refuses self changes and self
// deactivation; it still accepts a self recovery link (D8), but the panel leaves that to another
// global admin.
export function memberActions(member: TeamMember, isSelf: boolean, now: Date): MemberAction[] {
  if (isSelf) return [];
  if (member.status === 'deactivated') return ['reactivate', 'change-access'];
  // Without access a new link would only set a password that cannot sign in (#213 D9); the
  // backend refuses it, so access comes back first.
  const actions: MemberAction[] = member.status === 'no_access' ? [] : ['regenerate'];
  if (
    (member.status === 'pending' || member.status === 'no_access') &&
    invitationOpen(member.invitation, now)
  )
    actions.push('cancel-invitation');
  actions.push('change-access', 'deactivate');
  return actions;
}
