import type { UserRole } from '@/entities/session';
import { Outlet } from 'react-router';

type RoleAreaBoundaryProps = {
  allowedRoles: readonly UserRole[];
};

export function RoleAreaBoundary({ allowedRoles }: RoleAreaBoundaryProps) {
  // Authorization is intentionally not implemented until an auth solution is selected.
  return (
    <div data-allowed-roles={allowedRoles.join(',')}>
      <Outlet />
    </div>
  );
}
