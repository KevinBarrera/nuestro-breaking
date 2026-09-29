import { AdminEventFoundationPage, AdminPage } from '@/pages/admin';
import { DancerPage } from '@/pages/dancer';
import { NotFoundPage } from '@/pages/not-found';
import { routes } from '@/shared/config';
import { Route, Routes } from 'react-router';
import { AdminSessionBoundary } from './admin-session-boundary';
import { RoleAreaBoundary } from './role-area-boundary';

export function AppRouter() {
  return (
    <Routes>
      <Route element={<AdminSessionBoundary />}>
        <Route path={routes.admin} element={<AdminPage />} />
        <Route path={routes.adminEventFoundation} element={<AdminEventFoundationPage />} />
      </Route>
      <Route element={<RoleAreaBoundary allowedRoles={['dancer'] as const} />}>
        <Route path={routes.dancer} element={<DancerPage />} />
      </Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
