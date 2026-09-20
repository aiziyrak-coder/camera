import { Suspense } from 'react';
import { Navigate, Route, Routes, useLocation, useSearchParams } from 'react-router-dom';
import AppShell from './layouts/AppShell';
import MinimalLayout from './layouts/MinimalLayout';
import { RequireAuth, RequirePermission, RequireRole } from './layouts/guards';
import PreviewPage from './pages/dev/PreviewPage';
import { legacyRedirect } from './layouts/legacyRoutes';
import { ALL_NAV_ITEMS, homeForRole } from './layouts/shell/navConfig';
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

// Yangi sahifalar (2-bosqichda to'ldiriladi).
const SituationPage = lazyPage(() => import('./pages/situation/SituationPage'));
const FacultiesPage = lazyPage(() => import('./pages/students/FacultiesPage'));
const FacultyPage = lazyPage(() => import('./pages/students/FacultyPage'));
const GroupPage = lazyPage(() => import('./pages/students/GroupPage'));
const KafedrasPage = lazyPage(() => import('./pages/teachers/KafedrasPage'));
const KafedraPage = lazyPage(() => import('./pages/teachers/KafedraPage'));
const PersonPage = lazyPage(() => import('./pages/person/PersonPage'));
const WorkHoursPage = lazyPage(() => import('./pages/settings/WorkHoursPage'));
const SystemPage = lazyPage(() => import('./pages/settings/SystemPage'));
const StyleGuidePage = lazyPage(() => import('./pages/settings/StyleGuidePage'));

// Mavjud sahifalar — yangi manzillarda, 2-bosqichda dizayn tizimiga ko'chiriladi.
const EventsPage = lazyPage(() => import('./pages/admin/EventsPage'));
const HisobotPage = lazyPage(() => import('./pages/admin/HisobotPage'));
const VideoWallPage = lazyPage(() => import('./pages/admin/VideoWallPage'));
const StudentsStaffPage = lazyPage(() => import('./pages/admin/StudentsStaffPage'));
const OrgStructurePage = lazyPage(() => import('./pages/admin/OrgStructurePage'));
const CamerasZonesPage = lazyPage(() => import('./pages/admin/CamerasZonesPage'));
const AIModulesPage = lazyPage(() => import('./pages/admin/AIModulesPage'));
const NotificationsPage = lazyPage(() => import('./pages/admin/NotificationsPage'));
const IntegrationsPage = lazyPage(() => import('./pages/admin/IntegrationsPage'));
const UsersRolesPage = lazyPage(() => import('./pages/admin/UsersRolesPage'));
const PrivacyPage = lazyPage(() => import('./pages/admin/PrivacyPage'));
const WallScreenPage = lazyPage(() => import('./pages/wall/WallScreenPage'));

/** Eski /admin/* havolalari (xatcho'p, e-mail, Telegram) — yangi manzilga. */
function LegacyRedirect() {
  const { pathname, search, hash } = useLocation();
  return <Navigate to={legacyRedirect(pathname, search, hash)} replace />;
}

/** `/videodevor?view=<id>` — ikkinchi monitor uchun ochilgan eski havola:
 *  menyusiz to'liq ekran sahifasiga. */
function VideoWallRoute() {
  const [params] = useSearchParams();
  if (params.get('view')) return <Navigate to={`/videodevor/ekran?${params.toString()}`} replace />;
  return <VideoWallPage />;
}

/** /sozlamalar — foydalanuvchiga ochiq birinchi sozlama bo'limiga. */
function SettingsIndex() {
  const { role } = useAuth();
  const { can } = usePermissions();
  const first = ALL_NAV_ITEMS.find((item) => item.to.startsWith('/sozlamalar/') && (!item.permission || can(item.permission, role)));
  return <Navigate to={first?.to ?? '/'} replace />;
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
          {/* Dizayn ko'rigi — faqat ishlab chiqish rejimida (`npm run dev`).
              Ishlab chiqarish yig'masiga tushmaydi. */}
          {import.meta.env.DEV && <Route path="/dev-korik" element={<PreviewPage />} />}
          <Route element={<PublicPage />}>
            <Route path="/royxatdan-otish" element={<EnrollmentPage />} />
          </Route>

          <Route element={<RequireAuth />}>
            {/* Videodevor — ikkinchi monitor uchun menyusiz, to'liq ekran. */}
            <Route element={<RequirePermission permission="viewLive" />}>
              <Route path="/videodevor/ekran" element={<VideoWallPage standalone />} />
            </Route>
            {/* Situatsion markaz devor ekrani — menyusiz. */}
            <Route element={<RequirePermission anyOf={['viewReports', 'manageAttendance']} />}>
              <Route path="/markaz-ekran" element={<WallScreenPage />} />
            </Route>

            <Route element={<AppShell />}>
              <Route path="/" element={<SituationPage />} />

              <Route element={<RequirePermission permission="manageAttendance" />}>
                <Route path="/talabalar" element={<FacultiesPage />} />
                <Route path="/talabalar/fakultet/:facultyId" element={<FacultyPage />} />
                <Route path="/talabalar/guruh/:groupName" element={<GroupPage />} />
                <Route path="/oqituvchilar" element={<KafedrasPage />} />
                <Route path="/oqituvchilar/kafedra/:departmentId" element={<KafedraPage />} />
                <Route path="/shaxs/:personId" element={<PersonPage />} />
              </Route>

              <Route element={<RequirePermission permission="viewLive" />}>
                <Route path="/videodevor" element={<VideoWallRoute />} />
                {/* Olib tashlangan sahifalar (2026-09-19): bo'sh edi, chalg'itardi. */}
                <Route path="/xarita" element={<Navigate to="/videodevor" replace />} />
                <Route path="/darslar" element={<Navigate to="/" replace />} />
              </Route>
              <Route element={<RequirePermission permission="reviewEvents" />}>
                <Route path="/hodisalar" element={<EventsPage />} />
              </Route>
              <Route element={<RequirePermission permission="viewReports" />}>
                <Route path="/hisobotlar" element={<HisobotPage />} />
              </Route>
              <Route element={<RequirePermission permission="registerPeople" />}>
                <Route path="/reestr" element={<StudentsStaffPage />} />
              </Route>
              <Route path="/tuzilma" element={<OrgStructurePage />} />

              <Route path="/sozlamalar" element={<SettingsIndex />} />
              <Route element={<RequirePermission permission="editCameraLocation" />}>
                <Route path="/sozlamalar/kameralar" element={<CamerasZonesPage />} />
              </Route>
              <Route element={<RequirePermission permission="configureAi" />}>
                <Route path="/sozlamalar/ai" element={<AIModulesPage />} />
              </Route>
              <Route element={<RequirePermission permission="manageNotifications" />}>
                <Route path="/sozlamalar/bildirishnomalar" element={<NotificationsPage />} />
              </Route>
              <Route element={<RequirePermission permission="manageIntegrations" />}>
                <Route path="/sozlamalar/integratsiyalar" element={<IntegrationsPage />} />
              </Route>
              <Route element={<RequirePermission permission="manageRoles" />}>
                <Route path="/sozlamalar/foydalanuvchilar" element={<UsersRolesPage />} />
              </Route>
              <Route element={<RequirePermission permission="managePrivacy" />}>
                <Route path="/sozlamalar/maxfiylik" element={<PrivacyPage />} />
              </Route>
              <Route element={<RequirePermission permission="manageAttendance" />}>
                <Route path="/sozlamalar/ish-vaqti" element={<WorkHoursPage />} />
              </Route>
              <Route element={<RequirePermission permission="systemSettings" />}>
                <Route path="/sozlamalar/tizim" element={<SystemPage />} />
              </Route>
              {/* Uslub qo'llanmasi — menyuda yo'q, faqat ko'rib chiqish uchun. */}
              <Route element={<RequireRole roles={['super-admin']} />}>
                <Route path="/sozlamalar/ui" element={<StyleGuidePage />} />
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
