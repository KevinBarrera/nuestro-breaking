import { adminCapableRoles } from '@/entities/session';
import { AdminPage } from '@/pages/admin';
import { DancerPage } from '@/pages/dancer';
import { NotFoundPage } from '@/pages/not-found';
import { routes } from '@/shared/config';
import { Route, Routes } from 'react-router';
import { RoleAreaBoundary } from './role-area-boundary';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<RoleAreaBoundary allowedRoles={adminCapableRoles} />}>
        <Route path={routes.admin} element={<AdminPage />} />
      </Route>
      <Route element={<RoleAreaBoundary allowedRoles={['dancer'] as const} />}>
        <Route path={routes.dancer} element={<DancerPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
