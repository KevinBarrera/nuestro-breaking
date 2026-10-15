import { listTeam, teamFailure, type TeamFailure, type TeamMember } from '@/entities/admin-team';
import { useCallback, useEffect, useState } from 'react';

export type TeamLoadState =
  | { status: 'loading' }
  | { status: 'failed'; failure: TeamFailure }
  | { status: 'ready'; members: TeamMember[] };

// Loads the team with an abortable read; `reload` refetches while keeping the list visible.
export function useTeamLoad(enabled: boolean) {
  const [state, setState] = useState<TeamLoadState>({ status: 'loading' });
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    listTeam(controller.signal)
      .then((members) => {
        if (!controller.signal.aborted) setState({ status: 'ready', members });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) setState({ status: 'failed', failure: teamFailure(error) });
      });
    return () => controller.abort();
  }, [enabled, revision]);

  const reload = useCallback(() => setRevision((value) => value + 1), []);
  return { state, reload };
}
