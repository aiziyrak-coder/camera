import { Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import PublicLayout from './layouts/PublicLayout';
import AdminLayout from './layouts/AdminLayout';
import RequireAuth from './components/RequireAuth';
import RequirePermission from './components/RequirePermission';
import LoginPage from './pages/admin/LoginPage';
import ResetPasswordPage from './pages/admin/ResetPasswordPage';
import { PageSkeleton } from './components/ui/Skeleton';
import { lazyPage } from './lib/lazyPage';

// Har sahifa alohida JS bo'lagi sifatida faqat ochilganda yuklanadi.
// Ilgari barcha sahifalar (grafik, PDF, video kutubxonalari bilan) bitta
// ~1.7 MB faylda edi va login'dan keyingi birinchi ekran shuni kutardi.
// lazyPage deploydan keyin eskirgan bo'lak so'ralsa sahifani bir marta
// qayta yuklaydi.
const MonitoringPage = lazyPage(() => import('./pages/public/MonitoringPage'));
const EnrollmentPage = lazyPage(() => import('./pages/public/EnrollmentPage'));
const DashboardPage = lazyPage(() => import('./pages/admin/DashboardPage'));
const StudentsStaffPage = lazyPage(() => import('./pages/admin/StudentsStaffPage'));
const OrgStructurePage = lazyPage(() => import('./pages/admin/OrgStructurePage'));
const CamerasZonesPage = lazyPage(() => import('./pages/admin/CamerasZonesPage'));
const AIModulesPage = lazyPage(() => import('./pages/admin/AIModulesPage'));
const UsersRolesPage = lazyPage(() => import('./pages/admin/UsersRolesPage'));
const SystemLogPage = lazyPage(() => import('./pages/admin/SystemLogPage'));
const ReportsPage = lazyPage(() => import('./pages/admin/ReportsPage'));
const EventsPage = lazyPage(() => import('./pages/admin/EventsPage'));
const AttendancePage = lazyPage(() => import('./pages/admin/AttendancePage'));
const TeachingPage = lazyPage(() => import('./pages/admin/TeachingPage'));
const PresencePage = lazyPage(() => import('./pages/admin/PresencePage'));

export default function App() {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Routes>
        <Route element={<PublicLayout />}>
          {/* Monitoring devori endi tizimga kirishni talab qiladi. Auditda
              aniqlangan: token'siz ham 107 ta kameraning jonli tasviri
              ko'rinardi — koridorlar, xonalar, kirish joylari internetdan
              kira olgan har kimga ochiq edi.

              Ro'yxatdan o'tish sahifasi ATAYLAB ochiq qoladi: u aynan hali
              hisobi yo'q odam o'z yuzini yuborishi uchun mo'ljallangan. */}
          <Route element={<RequireAuth />}>
            <Route path="/" element={<MonitoringPage />} />
          </Route>
          <Route path="/royxatdan-otish" element={<EnrollmentPage />} />
        </Route>

        <Route path="/admin/login" element={<LoginPage />} />
        <Route path="/admin/reset-password" element={<ResetPasswordPage />} />

        <Route element={<RequireAuth />}>
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="events" element={<EventsPage />} />
            <Route path="students-staff" element={<StudentsStaffPage />} />
            <Route path="attendance" element={<AttendancePage />} />
            <Route path="presence" element={<PresencePage />} />
            <Route path="teaching" element={<TeachingPage />} />
            <Route path="org-structure" element={<OrgStructurePage />} />
            <Route path="cameras" element={<CamerasZonesPage />} />
            <Route path="ai-modules" element={<AIModulesPage />} />
            <Route path="reports" element={<ReportsPage />} />
            <Route element={<RequirePermission permission="manageRoles" />}>
              <Route path="users-roles" element={<UsersRolesPage />} />
            </Route>
            <Route element={<RequirePermission permission="systemSettings" />}>
              <Route path="system-log" element={<SystemLogPage />} />
            </Route>
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
