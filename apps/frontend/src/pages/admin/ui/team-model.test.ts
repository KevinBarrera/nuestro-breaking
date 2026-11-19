import type { TeamMember } from '@/entities/admin-team';
import { describe, expect, it } from 'vitest';
import {
  accessLines,
  accessSummary,
  expiryHint,
  filterTeam,
  memberActions,
  memberInitials,
  memberStatus,
  teamCountText,
  teamCounts,
} from './team-model';

const now = new Date('2026-10-11T12:00:00.000Z');

const member = (overrides: Partial<TeamMember> = {}): TeamMember => ({
  id: 'u1',
  displayName: 'Ana',
  email: 'ana@example.org',
  status: 'active',
  access: { kind: 'global' },
  invitation: null,
  ...overrides,
});

describe('accessSummary', () => {
  it('names all events or the chosen events', () => {
    expect(accessSummary({ kind: 'global' })).toBe('Todos los eventos');
    expect(
      accessSummary({
        kind: 'events',
        events: [
          { id: 'a', name: 'Preliminares' },
          { id: 'b', name: 'Final' },
        ],
      }),
    ).toBe('Preliminares, Final');
    expect(accessSummary({ kind: 'events', events: [] })).toBe('Sin eventos');
    expect(accessSummary({ kind: 'none' })).toBe('Sin acceso');
  });
});

describe('expiryHint', () => {
  it('counts whole days, then hours, then under an hour', () => {
    expect(expiryHint('2026-10-14T12:00:00.000Z', now)).toBe('Vence en 3 días');
    expect(expiryHint('2026-10-12T13:00:00.000Z', now)).toBe('Vence en 1 día');
    expect(expiryHint('2026-10-12T11:00:00.000Z', now)).toBe('Vence en 23 horas');
    expect(expiryHint('2026-10-11T13:00:00.000Z', now)).toBe('Vence en 1 hora');
    expect(expiryHint('2026-10-11T12:30:00.000Z', now)).toBe('Vence en menos de 1 hora');
  });
});

describe('memberStatus', () => {
  it('labels each status, including expired and missing links', () => {
    expect(memberStatus(member(), now)).toEqual({ label: 'Activo', tone: 'success' });
    expect(memberStatus(member({ status: 'deactivated' }), now)).toEqual({
      label: 'Desactivado',
      tone: 'neutral',
    });
    expect(
      memberStatus(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false },
        }),
        now,
      ),
    ).toEqual({ label: 'Invitación pendiente', tone: 'warning', hint: 'Vence en 2 días' });
    expect(
      memberStatus(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-10T12:00:00.000Z', expired: true },
        }),
        now,
      ),
    ).toEqual({ label: 'Invitación vencida', tone: 'warning', hint: 'Genera un enlace nuevo' });
    expect(memberStatus(member({ status: 'pending' }), now)).toEqual({
      label: 'Invitación cancelada',
      tone: 'warning',
      hint: 'Genera un enlace nuevo',
    });
    expect(memberStatus(member({ status: 'no_access', access: { kind: 'none' } }), now)).toEqual({
      label: 'Sin acceso',
      tone: 'neutral',
      hint: 'Usa «Cambiar acceso» para darle eventos',
    });
  });
});

describe('memberActions', () => {
  it('offers the actions each status allows', () => {
    expect(memberActions(member(), false, now)).toEqual([
      'change-access',
      'regenerate',
      'deactivate',
    ]);
    expect(
      memberActions(
        member({
          status: 'pending',
          invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false },
        }),
        false,
        now,
      ),
    ).toEqual(['regenerate', 'change-access', 'cancel-invitation', 'deactivate']);
    expect(memberActions(member({ status: 'pending' }), false, now)).toEqual([
      'regenerate',
      'change-access',
      'deactivate',
    ]);
    expect(memberActions(member({ status: 'deactivated' }), false, now)).toEqual([
      'reactivate',
      'change-access',
    ]);
  });

  it('offers access back, but no new link, to a member without access (#213 D9)', () => {
    const none = member({ status: 'no_access', access: { kind: 'none' } });
    expect(memberActions(none, false, now)).toEqual(['change-access', 'deactivate']);
    expect(
      memberActions(
        { ...none, invitation: { expiresAt: '2026-10-13T12:00:00.000Z', expired: false } },
        false,
        now,
      ),
    ).toEqual(['change-access', 'cancel-invitation', 'deactivate']);
    expect(memberActions(none, true, now)).toEqual([]);
  });

  it("offers no actions on the person's own row (D9)", () => {
    expect(memberActions(member(), true, now)).toEqual([]);
    expect(memberActions(member({ status: 'pending' }), true, now)).toEqual([]);
    expect(memberActions(member({ status: 'deactivated' }), true, now)).toEqual([]);
  });
});

describe('status and actions agree on an expired link', () => {
  const pending = (expiresAt: string, expired: boolean) =>
    member({ status: 'pending', invitation: { expiresAt, expired } });
  const cases = [
    // At the expiry instant the link no longer works, even before the backend flag flips.
    { link: pending(now.toISOString(), false), open: false },
    { link: pending('2026-10-11T12:00:00.001Z', false), open: true },
    // The backend flag wins when it says expired, whatever the clock.
    { link: pending('2026-10-12T12:00:00.000Z', true), open: false },
  ];

  it('shows a pending link only while it can be cancelled', () => {
    for (const { link, open } of cases) {
      expect(memberStatus(link, now).label).toBe(
        open ? 'Invitación pendiente' : 'Invitación vencida',
      );
      expect(memberActions(link, false, now).includes('cancel-invitation')).toBe(open);
    }
  });
});

describe('memberInitials', () => {
  it('takes the first letter of the first two words', () => {
    expect(memberInitials('Jairo Barrera')).toBe('JB');
    expect(memberInitials('  local   admin  ')).toBe('LA');
    expect(memberInitials('Ana María Torres')).toBe('AM');
    expect(memberInitials('Sofía')).toBe('S');
    expect(memberInitials('Élia Ñuñez')).toBe('ÉÑ');
  });
});

describe('accessLines', () => {
  it('names the access and adds a short count or scope line', () => {
    expect(accessLines({ kind: 'global' })).toEqual({
      main: 'Todos los eventos',
      sub: 'Incluye eventos nuevos y el equipo',
    });
    expect(accessLines({ kind: 'events', events: [{ id: 'a', name: 'Final' }] })).toEqual({
      main: 'Final',
      sub: '1 evento',
    });
    expect(
      accessLines({
        kind: 'events',
        events: [
          { id: 'a', name: 'Preliminares' },
          { id: 'b', name: 'Final' },
        ],
      }),
    ).toEqual({ main: 'Preliminares, Final', sub: '2 eventos' });
    expect(accessLines({ kind: 'events', events: [] })).toEqual({ main: 'Sin eventos', sub: '' });
    expect(accessLines({ kind: 'none' })).toEqual({ main: 'Sin acceso', sub: '' });
  });
});

describe('team search and status filter', () => {
  const team = [
    member({ id: 'a', displayName: 'Local Admin', email: 'admin@lmp.mx' }),
    member({
      id: 'b',
      displayName: 'Sofía Méndez',
      email: 'sofia@correo.mx',
      status: 'pending',
      access: { kind: 'events', events: [{ id: 'e1', name: 'Nuestro Breaking 2026' }] },
    }),
    member({ id: 'c', displayName: 'Carla Ruiz', email: 'carla@correo.mx', status: 'deactivated' }),
    member({
      id: 'd',
      displayName: 'Diego',
      email: 'diego@correo.mx',
      status: 'no_access',
      access: { kind: 'none' },
    }),
  ];
  const ids = (list: TeamMember[]) => list.map((entry) => entry.id);

  it('counts each status', () => {
    expect(teamCounts(team)).toEqual({
      all: 4,
      active: 1,
      pending: 1,
      deactivated: 1,
      no_access: 1,
    });
  });

  it('filters by status', () => {
    expect(ids(filterTeam(team, '', 'all'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filterTeam(team, '', 'pending'))).toEqual(['b']);
    expect(ids(filterTeam(team, '', 'no_access'))).toEqual(['d']);
  });

  it('searches name, email and access, ignoring case and accents', () => {
    expect(ids(filterTeam(team, 'sofia', 'all'))).toEqual(['b']);
    expect(ids(filterTeam(team, 'MENDEZ', 'all'))).toEqual(['b']);
    expect(ids(filterTeam(team, 'carla@', 'all'))).toEqual(['c']);
    expect(ids(filterTeam(team, 'nuestro breaking', 'all'))).toEqual(['b']);
    expect(ids(filterTeam(team, 'todos los eventos', 'all'))).toEqual(['a', 'c']);
    expect(ids(filterTeam(team, '  ', 'all'))).toEqual(['a', 'b', 'c', 'd']);
    expect(ids(filterTeam(team, 'sofia', 'active'))).toEqual([]);
  });

  it('describes how many people are shown', () => {
    expect(teamCountText(4, 4)).toBe('4 personas');
    expect(teamCountText(1, 1)).toBe('1 persona');
    expect(teamCountText(2, 7)).toBe('Mostrando 2 de 7 personas');
    expect(teamCountText(0, 1)).toBe('Mostrando 0 de 1 persona');
  });
});
