import type { TeamAccess, TeamMember } from '@/entities/admin-team';

// Pure view logic for the Equipo screen (#214).

export function accessSummary(access: TeamAccess): string {
  if (access.kind === 'global') return 'Todos los eventos';
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

export type StatusTone = 'success' | 'warning' | 'neutral';
export type StatusView = { label: string; tone: StatusTone; hint?: string };

export function memberStatus(member: TeamMember, now: Date): StatusView {
  if (member.status === 'active') return { label: 'Activo', tone: 'success' };
  if (member.status === 'deactivated') return { label: 'Desactivado', tone: 'neutral' };
  const { invitation } = member;
  // The backend may report a link as not yet expired a moment before it is; trust the clock too.
  if (invitation && !invitation.expired && Date.parse(invitation.expiresAt) > now.getTime())
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

// The backend refuses self changes and self deactivation, so they are not offered; a person
// may still issue their own recovery link (#214 D8).
export function memberActions(member: TeamMember, isSelf: boolean): MemberAction[] {
  if (member.status === 'deactivated') return isSelf ? [] : ['reactivate', 'change-access'];
  const actions: MemberAction[] = ['regenerate'];
  if (isSelf) return actions;
  if (member.status === 'pending' && member.invitation && !member.invitation.expired)
    actions.push('cancel-invitation');
  actions.push('change-access', 'deactivate');
  return actions;
}
