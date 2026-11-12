import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import MinimalLayout from './layouts/MinimalLayout';
import { RequireAuth, RequirePermission } from './layouts/guards';
import { legacyRedirect } from './layouts/legacyRoutes';
import { ALL_NAV_ITEMS, ROLE_HOME, homeForRole, isPathAllowedForRole } from './layouts/shell/navConfig';
import LoginPage from './pages/admin/LoginPage';
import ResetPasswordPage from './pages/admin/ResetPasswordPage';
import { useAuth } from './lib/auth';
import { usePermissions } from './lib/permissions';
import { lazyPage } from './lib/lazyPage';
import { ButtonLink, EmptyState, PageSkeleton, ThemeProvider } from './ui';
import { FileQuestion } from 'lucide-react';

// Har sahifa alohida JS bo'lagi sifatida faqat ochilganda yuklanadi.
// lazyPage deploydan keyin eskirgan bo'lak so'ralsa sahifani bir marta
// qayta yuklaydi.
const EnrollmentPage = lazyPage(() => import('./pages/public/EnrollmentPage'));

// Platforma 2026-11-12 da tozalandi: faqat yuzlar bazasi (reestr, ochiq
// ro'yxatdan o'tish), HEMIS integratsiyasi, Telegram bildirishnomalari va
// foydalanuvchilar qoldi. Qolgan hammasi yangidan quriladi.
const SystemPage = lazyPage(() => import('./pages/settings/SystemPage'));
const PrivacyPage = lazyPage(() => import('./pages/settings/PrivacyPage'));
const StudentsStaffPage = lazyPage(() => import('./pages/admin/StudentsStaffPage'));
const OrgStructurePage = lazyPage(() => import('./pages/admin/OrgStructurePage'));
const NotificationsPage = lazyPage(() => import('./pages/admin/NotificationsPage'));
const UsersRolesPage = lazyPage(() => import('./pages/admin/UsersRolesPage'));

/** Eski /admin/* havolalari (xatcho'p, e-mail, Telegram) — yangi manzilga. */
function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={legacyRedirect(pathname, search, hash)} replace />;
}

/** / — foydalanuvchiga ochiq birinchi menyu bo'limiga. */
function HomeRedirect() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const roleHome = ROLE_HOME[role as keyof typeof ROLE_HOME];
  if (roleHome) return <Navigate to={roleHome} replace />;
  const first = ALL_NAV_ITEMS.find(
    (item) =>
      (!item.permission || can(item.permission, role)) &&
      (!item.anyOf || item.anyOf.some((key) => can(key, role))) &&
      isPathAllowedForRole(role, item.to),
  );
  return <Navigate to={first?.to ?? '/tuzilma'} replace />;
}

/** /sozlamalar — foydalanuvchiga ochiq birinchi sozlama bo'limiga. */
function SettingsIndex() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const first = ALL_NAV_ITEMS.find(
    (item) =>
      item.to.startsWith('/sozlamalar/') &&
      (!item.permission || can(item.permission, role)) &&
      isPathAllowedForRole(role, item.to),
  );
  return <Navigate to={first?.to ?? homeForRole(role)} replace />;
}

/** Mavjud bo'lmagan manzil.
 *
 *  Ilgari bu yerda `<Navigate to="/" replace />` turardi: xato yozilgan
 *  yoki eskirgan havola foydalanuvchini hech qanday izohsiz bosh
 *  sahifaga tashlardi — u esa havolani ishladi deb o'ylab, nega boshqa
 *  sahifa ochilganini tushunmay qolardi (cheklangan rolda esa ustiga
 *  yana bir yo'naltirish qo'shilardi). Endi nima bo'lganini aytamiz. */
function NotFound() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  return (
    <EmptyState
      icon={FileQuestion}
      title="Sahifa topilmadi"
      description={`"${pathname}" manzili mavjud emas. Havola eskirgan yoki xato yozilgan bo'lishi mumkin — chap menyudan kerakli bo'limni tanlang.`}
      action={
        <ButtonLink variant="primary" to={homeForRole(role)}>
          Bosh sahifaga
        </ButtonLink>
      }
    />
  );
}

function Minimal() {
  return <MinimalLayout variant="center" />;
}

function PublicPage() {
  return <MinimalLayout variant="page" />;
}

export default function App() {
  return (
    <ThemeProvider>
      <Suspense fallback={<div className="p-6"><PageSkeleton /></div>}>
        <Routes>
          {/* Tizimga kirmasdan: kirish, parolni tiklash. */}
          <Route element={<Minimal />}>
            <Route path="/kirish" element={<LoginPage />} />
            <Route path="/parolni-tiklash" element={<ResetPasswordPage />} />
          </Route>
          {/* Ro'yxatdan o'tish ATAYLAB ochiq: hali hisobi yo'q odam o'z yuzini yuboradi. */}
          <Route element={<PublicPage />}>
            <Route path="/royxatdan-otish" element={<EnrollmentPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            <Route path="/" element={<HomeRedirect />} />
            <Route element={<AppShell />}>
              <Route element={<RequirePermission permission="registerPeople" />}>
                <Route path="/reestr" element={<StudentsStaffPage />} />
              </Route>
              <Route path="/tuzilma" element={<OrgStructurePage />} />

              <Route path="/sozlamalar" element={<SettingsIndex />} />
              <Route element={<RequirePermission permission="manageNotifications" />}>
                <Route path="/sozlamalar/bildirishnomalar" element={<NotificationsPage />} />
              </Route>
              <Route element={<RequirePermission permission="manageRoles" />}>
                <Route path="/sozlamalar/foydalanuvchilar" element={<UsersRolesPage />} />
              </Route>
              <Route element={<RequirePermission permission="systemSettings" />}>
                <Route path="/sozlamalar/tizim" element={<SystemPage />} />
              </Route>
              <Route element={<RequirePermission permission="managePrivacy" />}>
                <Route path="/sozlamalar/maxfiylik" element={<PrivacyPage />} />
              </Route>
              {/* Noma'lum manzil — qobiq ichida, menyu joyida qoladi.
                  Tizimga kirmagan foydalanuvchi esa RequireAuth orqali
                  /kirish'ga (qaytish manzili bilan) tushadi. */}
              <Route path="*" element={<NotFound />} />
            </Route>
          </Route>

          <Route path="/admin/*" element={<LegacyRedirect />} />
          <Route path="/admin" element={<LegacyRedirect />} />
        </Routes>
      </Suspense>
    </ThemeProvider>
  );
}
