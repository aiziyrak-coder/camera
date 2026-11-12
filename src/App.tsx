import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import Shell, { RequireAuth, RequirePermission, useNav } from './shell';
import { Spinner } from './kit';
import { lazyPage } from './lib/lazyPage';
import LoginPage from './pages/Login';

const ResetPasswordPage = lazyPage(() => import('./pages/ResetPassword'));
const EnrollPage = lazyPage(() => import('./pages/enroll/Enroll'));
const FacesPage = lazyPage(() => import('./pages/Faces'));
const HemisPage = lazyPage(() => import('./pages/Hemis'));
const TelegramPage = lazyPage(() => import('./pages/Telegram'));
const UsersPage = lazyPage(() => import('./pages/Users'));

/** Bosh sahifa — foydalanuvchiga ochiq birinchi bo'lim. */
function Home() {
  const nav = useNav();
  return nav.length ? <Navigate to={nav[0].to} replace /> : null;
}

/** Eski manzillar (xatcho'plar, Telegram xabarlaridagi havolalar). */
const OLD_PATHS: Record<string, string> = {
  '/reestr': '/yuzlar',
  '/tuzilma': '/yuzlar',
  '/sozlamalar/tizim': '/hemis',
  '/sozlamalar/bildirishnomalar': '/telegram',
  '/sozlamalar/foydalanuvchilar': '/foydalanuvchilar',
};

function NotFound() {
  const { pathname } = useLocation();
  const target = OLD_PATHS[pathname];
  return <Navigate to={target ?? '/'} replace />;
}

export default function App() {
  return (
    <Suspense fallback={<Spinner />}>
      <Routes>
        <Route path="/kirish" element={<LoginPage />} />
        <Route path="/parolni-tiklash" element={<ResetPasswordPage />} />
        {/* Ochiq sahifa: hisobi yo'q odam o'z yuzini o'zi kiritadi. */}
        <Route path="/royxatdan-otish" element={<EnrollPage />} />

        <Route element={<RequireAuth />}>
          <Route element={<Shell />}>
            <Route path="/" element={<Home />} />
            <Route
              path="/yuzlar"
              element={
                <RequirePermission permission="registerPeople">
                  <FacesPage />
                </RequirePermission>
              }
            />
            <Route
              path="/hemis"
              element={
                <RequirePermission permission="manageIntegrations">
                  <HemisPage />
                </RequirePermission>
              }
            />
            <Route
              path="/telegram"
              element={
                <RequirePermission permission="manageNotifications">
                  <TelegramPage />
                </RequirePermission>
              }
            />
            <Route
              path="/foydalanuvchilar"
              element={
                <RequirePermission permission="manageRoles">
                  <UsersPage />
                </RequirePermission>
              }
            />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Route>
      </Routes>
    </Suspense>
  );
}
