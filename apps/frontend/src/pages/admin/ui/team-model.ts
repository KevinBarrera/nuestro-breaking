import type { TeamAccess, TeamInvitation, TeamMember } from '@/entities/admin-team';

// Pure view logic for the Equipo screen (#214).

export function accessSummary(access: TeamAccess): string {
  if (access.kind === 'global') return 'Todos los eventos';
  if (access.kind === 'none') return 'Sin acceso';
  if (access.events.length === 0) return 'Sin eventos';
  return access.events.map((event) => event.name).join(', ');
}

// The table's Acceso cell: the access, then a short line with its scope or how many events.
export function accessLines(access: TeamAccess): { main: string; sub: string } {
  const main = accessSummary(access);
  if (access.kind === 'global') return { main, sub: 'Incluye eventos nuevos y el equipo' };
  if (access.kind === 'none' || access.events.length === 0) return { main, sub: '' };
  const count = access.events.length;
  return { main, sub: `${count} ${count === 1 ? 'evento' : 'eventos'}` };
}

export function memberInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0))
    .join('')
    .toUpperCase();
}

export type TeamFilter = 'all' | TeamMember['status'];
export type TeamCounts = Record<TeamFilter, number>;

export function teamCounts(members: TeamMember[]): TeamCounts {
  const counts: TeamCounts = {
    all: members.length,
    active: 0,
    pending: 0,
    deactivated: 0,
    no_access: 0,
  };
  for (const member of members) counts[member.status] += 1;
  return counts;
}

const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

// Search and the status chips run over the loaded list: name, email or the access text, ignoring
// case and accents.
export function filterTeam(members: TeamMember[], query: string, filter: TeamFilter): TeamMember[] {
  const needle = fold(query.trim());
  return members.filter((member) => {
    if (filter !== 'all' && member.status !== filter) return false;
    if (!needle) return true;
    const haystack = `${member.displayName} ${member.email} ${accessSummary(member.access)}`;
    return fold(haystack).includes(needle);
  });
}

export function teamCountText(shown: number, total: number): string {
  const people = `${total} ${total === 1 ? 'persona' : 'personas'}`;
  return shown === total ? people : `Mostrando ${shown} de ${people}`;
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
  // A pending invitation leads with its new link. Without access a new link would only set a
  // password that cannot sign in (#213 D9); the backend refuses it, so access comes back first.
  const actions: MemberAction[] =
    member.status === 'active'
      ? ['change-access', 'regenerate']
      : member.status === 'pending'
        ? ['regenerate', 'change-access']
        : ['change-access'];
  if (member.status !== 'active' && invitationOpen(member.invitation, now))
    actions.push('cancel-invitation');
  actions.push('deactivate');
  return actions;
}
