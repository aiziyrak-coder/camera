export type CameraStatus = 'live' | 'offline';

/** Backenddagi GET /api/public/cameras javobiga mos — jismoniy kamera
 * (bino/zona/holat) haqidagi ma'lumot. Kameraning aynan qaysi fakultet/kurs/
 * guruh darsini ko'rsatib turgani haqida sxemada hech qanday bog'lanish
 * yo'q, shuning uchun bu yerda ham yo'q (ilgari mock ma'lumot buni
 * o'ylab topgan edi). */
export interface CameraFeed {
  id: string;
  name: string;
  building: string;
  zone: string;
  status: CameraStatus;
  /** Backend video-gateway tomonidan beriladigan HLS (.m3u8) yoki MP4/WebM manzil. Bo'sh bo'lsa — placeholder ko'rsatiladi. */
  streamUrl?: string;
  /** Kafedra nomi; biriktirilmagan bo'lsa bo'sh satr. */
  department?: string;
  /** Kamera tarmoqda javob beryapti, lekin tasvir kelyaptimi. `status`
      bilan qo'shilmaydi: "erishib bo'lmaydi" va "erishiladi, lekin
      tasvirsiz" — operator uchun ikki xil nosozlik. */
  hasVideo?: boolean;
  /** Qavat raqami; belgilanmagan bo'lsa null (backend `Camera.floor`). */
  floor?: number | null;
}

/** GET /api/public/campus — bitta qavat kesimi. `floor: null` qavati
 * belgilanmagan kameralar guruhi: ular yo'qolib qolmasligi kerak. */
export interface CampusFloor {
  floor: number | null;
  label: string;
  cameras: number;
  live: number;
  offline: number;
  noVideo: number;
  eventsToday: number;
}

/** Bitta bino kesimi. `id: ''` — binoga biriktirilmagan kameralar. */
export interface CampusBuilding {
  id: string;
  name: string;
  floors: CampusFloor[];
  cameras: number;
  live: number;
  offline: number;
  noVideo: number;
  eventsToday: number;
}

/** Butun kampus kesimi — Video Monitoring Markazining birinchi ekrani.
 * Kameralar ro'yxati bu yerda YO'Q: u faqat qavat tanlanganda yuklanadi,
 * shuning uchun sahifa ochilishi 100+ kamerada ham yengil qoladi. */
export interface Campus {
  buildings: CampusBuilding[];
  cameras: number;
  live: number;
  offline: number;
  noVideo: number;
  eventsToday: number;
  generatedAt: string;
}

/** Backenddagi GET /api/public/cameras/{id}/live-detection javobiga mos —
 * kadrda hozir topilgan bitta yuz haqida ma'lumot (chegara chizig'i,
 * agar tanilsa ismi, ko'z holati). */
export interface DetectedFace {
  bbox: [number, number, number, number];
  personName?: string | null;
  asleep: boolean;
}

export interface LiveDetectionResult {
  frameWidth: number;
  frameHeight: number;
  faces: DetectedFace[];
}

/** GET /api/public/cameras/{id}/analysis-status — oxirgi fon AI sweep. */
export interface CameraAnalysisStatus {
  lastSweepAt?: string | null;
  secondsAgo?: number | null;
  faceCount: number;
  modules: string[];
  eventsRaised: number;
}

export interface AttendanceStats {
  totalStudents: number;
  present: number;
  absent: number;
  late: number;
  sleepIncidents: number;
  violations: number;
  liveCameras: number;
  offlineCameras: number;
  buildings: string[];
  /** Kafedralar, har biri o'z binosi bilan — filtr bosqichma-bosqich
      ishlashi uchun: bino tanlanganda faqat o'sha binoning kafedralari. */
  departments?: { name: string; building: string }[];
}

export interface TopStudent {
  id: string;
  name: string;
  group: string;
  attendanceRate: number;
}

export interface StudentStaffRecord {
  id: string;
  fullName: string;
  type: 'talaba' | 'xodim';
  faculty: string;
  groupOrPosition: string;
  biometricsStatus: 'tasdiqlangan' | 'kutilmoqda' | 'yoq';
  initials: string;
  biometricPhotoUrl?: string | null;
  /** Faqat talabada — groupOrPosition "2-kurs, DI-1625" dan ajratilgan. */
  course?: number | null;
  group?: string | null;
  /** "14.09.2026 13:57" — yuz tasdiqlangan payt (Toshkent vaqti). */
  confirmedLabel?: string | null;
  /** Ochiq sahifada o'zini o'zi ro'yxatdan o'tkazgan. */
  selfRegistered?: boolean;
  /** Yuzi yuborilgan, administrator qarorini kutmoqda — kameralar hali tanimaydi. */
  awaitingApproval?: boolean;
}

/** Tahrirlash oynasi — ro'yxatda yuborilmaydigan shaxsiy identifikatorlar bilan. */
export interface StudentStaffDetail extends StudentStaffRecord {
  pinfl: string | null;
  passportSeries: string | null;
  passportNumber: string | null;
}

/** "Aniqlash" oynasi — odam yuzini aniq qachon tasdiqlagani.
 *  Vaqt maydonlari serverda Toshkent vaqtida formatlanadi. */
export interface BiometricsConfirmation extends StudentStaffRecord {
  confirmedAt: string | null;
  confirmedDate: string | null;
  confirmedWeekday: string | null;
  confirmedTime: string | null;
  /** tizim — tasdiqlashda yozilgan; rasm — yuz rasmi saqlangan paytdan
   *  tiklangan; nomalum — vaqtni aniqlab bo'lmadi; tasdiqlanmagan. */
  source: 'tizim' | 'rasm' | 'nomalum' | 'tasdiqlanmagan';
}

export interface Faculty {
  id: string;
  name: string;
  courseCount: number;
  studentCount: number;
}

export interface StudentGroup {
  id: string;
  name: string;
  faculty: string;
  course: number;
  studentCount: number;
}

/** Yuzni tasdiqlash qamrovi — bitta fakultet kesimida. */
export interface BiometricsFacultyRow {
  faculty: string;
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  /** null — guruhda odam yo'q. "0%" bilan aralashtirmaslik uchun ataylab. */
  percent: number | null;
}

/** O'qituvchilar kuzatuvi — app/routers/presence.py */
export type LessonRelation = 'oz_darsi' | 'boshqa_dars' | 'darsi_boshqa_joyda' | 'darsdan_tashqari' | 'jadval_yoq';

export interface LessonLink {
  relation: LessonRelation;
  label: string;
  subject?: string | null;
  groupName?: string | null;
  teacher?: string | null;
  startsAt?: string | null;
  endsAt?: string | null;
}

export interface PresenceVisitItem {
  camera: string;
  building: string;
  zone: string;
  cameraRole: string;
  firstSeen: string;
  lastSeen: string;
  durationMinutes: number;
  sightings: number;
  lesson: LessonLink;
}

export interface ScheduledLesson {
  subject: string;
  groupName: string;
  startsAt: string;
  endsAt: string;
  camera: string | null;
  building: string | null;
  attended: boolean;
  arrivedAt: string | null;
  late: boolean;
}

export interface PersonDay {
  id: string;
  fullName: string;
  type: 'talaba' | 'xodim';
  faculty: string;
  unit: string;
  date: string;
  attendanceStatus: string | null;
  checkIn: string | null;
  checkOut: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  buildings: string[];
  visits: PresenceVisitItem[];
  lessons: ScheduledLesson[];
}

export interface TeacherDaySummary {
  id: string;
  fullName: string;
  faculty: string;
  unit: string;
  attendanceStatus: string | null;
  firstSeen: string | null;
  lastSeen: string | null;
  visits: number;
  buildings: string[];
  lessonsScheduled: number;
  lessonsAttended: number;
}

export interface AttendanceCamera {
  id: string;
  name: string;
  building: string;
  zone: string;
  role: string;
  checkIntervalSeconds: number | null;
  attendanceEnabled: boolean;
  disabledReason: string | null;
  online: boolean;
  video: boolean;
  recognizedToday: number;
  lastRecognition: string | null;
  framesCheckedToday: number;
  facesSeenToday: number;
  facePxMedian: number | null;
  smallFacesToday: number;
  bestSimilarityToday: number | null;
  similarityBuckets: Record<string, number>;
  strictMatchesToday: number;
  relaxedConfirmedToday: number;
  relaxedPendingToday: number;
  lastChecked: string | null;
  cyclesToday?: number;
  /** Kameraning bitta to'liq tekshiruvi (kadr olish + tahlil), soniya. */
  lastCycleSeconds?: number | null;
  lastGrabSeconds?: number | null;
  /** AI o'qiyotgan oqim: "asosiy", "substream" yoki "substream (zaxira)". */
  streamInUse?: string | null;
  /** Nima uchun kamera hech kimni davomatga yozmayotgani — oddiy tilda. */
  diagnosis: string | null;
}

export interface AttendanceCameras {
  staffModuleActive: boolean;
  studentModuleActive: boolean;
  total: number;
  attendanceEnabled: number;
  entrance: number;
  exit: number;
  online: number;
  video: number;
  recognizingToday: number;
  peopleRecognizedToday: number;
  enrolledFaces: number;
  matchThreshold: number;
  relaxedThreshold: number | null;
  cameras: AttendanceCamera[];
}

export interface BiometricsCourseRow {
  course: string;
  courseNumber: number | null;
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  percent: number | null;
}

export interface BiometricsCoverage {
  total: number;
  confirmed: number;
  pending: number;
  missing: number;
  percent: number | null;
  byFaculty: BiometricsFacultyRow[];
  /** Faqat talabalar uchun to'ldiriladi. */
  byCourse: BiometricsCourseRow[];
  /** O'zini o'zi ro'yxatdan o'tkazib, tasdiq kutayotganlar. */
  awaitingApproval?: number;
}

export interface Building {
  id: string;
  name: string;
  cameraCount: number;
  /** Qavatlar soni — monitoring kesimi kamerasi yo'q qavatni ham shu
   * bo'yicha chizadi. Kiritilmagan bo'lsa null. */
  floors?: number | null;
  sortOrder?: number;
}

/** GET /api/cameras/summary — kameralar sahifasining ko'rsatkichlari. */
export interface CameraSummary {
  total: number;
  faol: number;
  nofaol: number;
  tamirda: number;
  reachable: number;
  withoutFloor: number;
}

/** Kafedra — bino ichidagi tashkiliy birlik.
 *
 * Kameralar bino bo'yicha ham, kafedra bo'yicha ham filtrlanadi:
 * "2-Bino" 18 ta kamera degani, "Anatomiya kafedrasi" esa o'sha binodagi
 * 4 tasi. buildingId null bo'lishi mumkin — kafedra binoga biriktirilishi
 * shart emas, lekin kaskadli filtr aynan shu bog'lanishga tayanadi. */
export interface Department {
  id: string;
  name: string;
  buildingId: string | null;
  buildingName: string;
  cameraCount: number;
}

/** Kamera xona turi — backend app/services/camera_roles.py bilan bir xil. */
export type RoomType = 'kirish' | 'auditoriya' | 'laboratoriya' | 'koridor' | 'ofis' | 'cheklangan' | 'tashqi';

export interface CameraConfig {
  id: string;
  name: string;
  ip: string;
  port: number;
  rtspPath?: string | null;
  building: string;
  zone: string;
  /** Admin belgilagan xona turi; null — belgilanmagan. */
  roomType?: RoomType | null;
  /** Amaldagi tur: belgilanmagan bo'lsa kirish/perimetr bayrog'idan. */
  effectiveRoomType?: RoomType | null;
  /** Dars jadvalidagi xona raqami (normallashtirilgan). */
  roomCode?: string | null;
  /** Qavat raqami; belgilanmagan bo'lsa null. Monitoring markazining
   * bino -> qavat kesimi shu maydon bo'yicha quriladi. */
  floor?: number | null;
  /** Kafedra nomi; biriktirilmagan bo'lsa bo'sh satr. */
  department?: string;
  resolution: string;
  fps: number | null;
  status: 'faol' | 'nofaol' | 'tamirda';
  /** Backend video-gateway tomonidan beriladigan HLS (.m3u8) yoki MP4/WebM manzil. Bo'sh bo'lsa — placeholder ko'rsatiladi. */
  streamUrl?: string;
  /** Kuzatilgan holat, sozlangan emas — `status` operator niyati
   * ("faol bo'lishi kerak"), bu esa app/jobs/camera_health.py'ning
   * so'nggi tekshiruvda kamerani haqiqatan topa olgan-olmaganligi. */
  isReachable: boolean;
  /** [x, y] juftliklari ro'yxati, har biri kadr kengligi/balandligiga
   * nisbatan 0-1 oralig'ida normallashtirilgan (TT kriteriya 2 — taqiqlangan
   * zonaga kirish). null/aniqlanmagan bo'lsa app/jobs/zone_entry_ai.py bu
   * kamerani butunlay o'tkazib yuboradi. */
  restrictedZonePolygon?: [number, number][] | null;
  /** AIModule.code raqamlari — bu kamera ULARDAN chetlashtirilgan (allow-list
   * emas, exclude-list). null/bo'sh massiv = faol modullarning barchasi shu
   * kamerada ishlaydi (standart holat). */
  excludedModuleCodes?: number[] | null;
  /** true bo'lsa, app/jobs/attendance_ai.py bu kamerada bitta kadr o'rniga
   * bir necha kadr (burst) oladi — tez o'tib ketuvchi odamni ushlash
   * ehtimolini oshiradi. Faqat kirish/koridor kameralari uchun mo'ljallangan. */
  isEntrance?: boolean;
  /** Hovli, bino oldi, avtoturargoh — begona moduli va transport AI uchun. */
  isPerimeter?: boolean;
  /** true bo'lsa, app/jobs/attendance_ai.py faqat SHU kamerada ko'rinishni
   * "ketdi" (check_out) deb hisoblaydi — oddiy ichki kameralarda (xona,
   * dahliz) ko'rinish davomatni tasdiqlaydi, lekin "ketdi" deb belgilamaydi. */
  isExit?: boolean;
  /** app/services/camera_import.py orqali SADP CSV'dan import qilingan
   * kameralar uchun to'ldiriladi (qayta-import qilinganda IP emas, shu
   * bo'yicha aniqlanadi) — qo'lda qo'shilgan kameralarda null. */
  macAddress?: string | null;
}

export type AIModuleGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F';

export interface AIModule {
  id: string;
  code: number;
  group: AIModuleGroup;
  name: string;
  description: string;
  method: string;
  accuracy: number;
  threshold: number;
  sensitivity: 'past' | "o'rta" | 'yuqori';
  cameraCount: number;
  active: boolean;
  /** Operator ko'rib chiqqan signallardan o'lchangan aniqlik (%), namuna kichik bo'lsa null. */
  measuredPrecision?: number | null;
  reviewedEvents?: number;
  /** Oxirgi 90 kundagi barcha signallar (ko'rib chiqilmaganlari ham). */
  recentEvents?: number;
  /** asosiy — model asosida; sinov — kalibrlanmagan evristika; sozlash_kerak — ko'p yolg'on signal. */
  maturity?: 'asosiy' | 'sinov' | 'sozlash_kerak';
  maturityNote?: string;
  /** false bo'lsa, bu kriteriya uchun hali hech qanday aniqlash kodi
   * yozilmagan (sof registr qatori) — shuning uchun uni faollashtirish
   * backend tomonidan rad etiladi (409). true bo'lganlarning barchasida
   * app/jobs/*.py'da haqiqiy (garchi hali baholanmagan bo'lsa ham)
   * aniqlash logikasi bor. */
  hasDetector: boolean;
  /** ishchi — signallar navbatga tushadi; sinov — fonda ishlaydi, namunalar baholanadi. */
  mode: 'ishchi' | 'sinov';
  /** Sinovdagi modulni ishchi rejimga o'tkazish sharti bajarilgan. */
  promotionReady?: boolean;
  /** Baholanmagan sinov signallari. */
  trialUnreviewed?: number;
}

/** Operatorlar ko'p rad etgani uchun avtomatik o'chirilgan kamera × modul juftligi. */
export interface ModuleSuppression {
  id: string;
  cameraId: string;
  cameraName: string;
  building: string;
  moduleCode: number;
  moduleName: string;
  confirmed: number;
  rejected: number;
  precision: number | null;
  reason: string;
  createdAt: string;
}

/** GET /api/cameras/module-options — manageCameras uchun yengil modul ro'yxati */
export interface CameraModuleOption {
  code: number;
  group: AIModuleGroup;
  name: string;
  active: boolean;
  hasDetector: boolean;
}

export interface ModuleCameraAssignment {
  cameraId: string;
  cameraName: string;
  building: string;
  zone: string;
  status: CameraConfig['status'];
  enabled: boolean;
}

export interface ModuleCameraAssignments {
  moduleCode: number;
  moduleName: string;
  cameras: ModuleCameraAssignment[];
}

export interface Report {
  id: string;
  period: 'Kunlik' | 'Haftalik' | 'Oylik';
  periodLabel: string;
  generatedAt: string;
  source: 'rule' | 'llm';
  summary: string;
  body: string;
  stats: { label: string; value: string }[];
  /** Sarlavhali jadvallar — modul/kamera/vaqt bo'yicha taqsimotlar.
      Bu ustun qo'shilishidan oldingi hisobotlarda bo'lmaydi. */
  sections?: ReportSection[];
  rangeStart?: string | null;
  rangeEnd?: string | null;
  createdBy?: string | null;
  /** Yangi format: sahifadagi tahlil to'liq saqlangan. */
  hasAnalytics?: boolean;
  kpis?: ReportKpi[];
}

export interface ReportDetail extends Report {
  analytics: ReportAnalytics | null;
}

/** GET /api/reports/analytics — app/services/analytics.py */
export interface ReportDateRange {
  start: string;
  end: string;
  days: number;
  label: string;
}

export interface ReportKpi {
  key: string;
  label: string;
  value: number | null;
  display: string;
  unit: string;
  previous: number | null;
  previousDisplay: string | null;
  delta: number | null;
  deltaDisplay: string | null;
  better: 'up' | 'down' | 'none';
  trend: (number | null)[];
  note: string | null;
  reliable: boolean;
}

export interface ReportInsight {
  level: 'critical' | 'warning' | 'info' | 'ok';
  title: string;
  text: string;
  actionLabel: string | null;
  actionHref: string | null;
}

export interface DailyAttendance {
  date: string;
  label: string;
  keldi: number;
  kechKeldi: number;
  kelmadi: number;
  rate: number | null;
}

export interface GroupRate {
  name: string;
  total: number;
  present: number;
  late: number;
  rate: number | null;
}

export interface HistogramBin {
  label: string;
  count: number;
}

export interface AttendancePopulation {
  type: 'xodim' | 'talaba';
  label: string;
  enrolled: number;
  population: number;
  records: number;
  present: number;
  late: number;
  absent: number;
  rate: number | null;
  lateShare: number | null;
  avgArrival: string | null;
  byDay: DailyAttendance[];
  byFaculty: GroupRate[];
  arrivalHistogram: HistogramBin[];
  reliability: { reliable: boolean; short: string | null; warnings: string[] };
}

export interface SecurityDay {
  date: string;
  label: string;
  past: number;
  orta: number;
  yuqori: number;
  total: number;
}

export interface ModuleRow {
  code: number;
  name: string;
  count: number;
  share: number;
  confirmed: number;
  rejected: number;
  unreviewed: number;
  precision: number | null;
}

export interface CameraRow {
  name: string;
  building: string;
  count: number;
  share: number;
}

export interface SecurityAnalytics {
  total: number;
  serious: number;
  past: number;
  orta: number;
  yuqori: number;
  confirmed: number;
  rejected: number;
  unreviewed: number;
  precision: number | null;
  night: number;
  byDay: SecurityDay[];
  heatmap: number[][];
  heatmapMax: number;
  topModules: ModuleRow[];
  topCameras: CameraRow[];
  oldestUnreviewedHours: number | null;
  staleSeriousUnreviewed: number;
}

export interface LessonDay {
  date: string;
  label: string;
  sessions: number;
  attention: number | null;
  sleep: number;
}

export interface LessonsAnalytics {
  sessions: number;
  analyzedSessions: number;
  avgAttention: number | null;
  avgTeacherActivity: number | null;
  sleepIncidents: number;
  checkedSessions: number;
  teacherOnTimeRate: number | null;
  byDay: LessonDay[];
}

export interface CoverageStat {
  type: 'xodim' | 'talaba';
  label: string;
  total: number;
  confirmed: number;
  percent: number | null;
}

export interface SystemAnalytics {
  camerasTotal: number;
  camerasActive: number;
  camerasLive: number;
  liveRate: number | null;
  coverage: CoverageStat[];
}

export interface ReportAnalytics {
  period: ReportDateRange;
  previousPeriod: ReportDateRange;
  generatedAt: string;
  workingDays: number;
  kpis: ReportKpi[];
  insights: ReportInsight[];
  attendance: { staff: AttendancePopulation; students: AttendancePopulation };
  security: SecurityAnalytics;
  lessons: LessonsAnalytics;
  system: SystemAnalytics;
}

export interface ReportSection {
  title: string;
  rows: { label: string; value: string }[];
  note?: string | null;
}

/** Hisobot sahifasi — "kriteriya kartasi -> ro'yxat -> isbot" uch darajasi.
 * Backend: app/services/report_criteria.py */
export type ReportPopulation = 'xodim' | 'talaba';
export type ReportPeriodKey = 'bugun' | 'kecha' | 'hafta' | 'oy';

export interface ReportPeriod {
  key: string;
  label: string;
  start: string;
  end: string;
  days: number;
}

export interface ReportBucket {
  key: string;
  label: string;
  count: number;
  tone: 'green' | 'amber' | 'red' | 'slate' | 'indigo';
}

export interface ReportCriterion {
  key: string;
  title: string;
  subtitle: string;
  total: number;
  unit: string;
  buckets: ReportBucket[];
  /** Kartani bosganda odamlar ro'yxati ochiladimi yoki signallar. */
  detail: 'people' | 'events' | 'none';
  moduleCodes: number[];
  /** Raqam bo'sh bo'lsa — SABABI (modul o'chirilgan, yuzlar yo'q va h.k.). */
  note?: string | null;
}

export interface ReportCriteria {
  population: string;
  populationLabel: string;
  period: ReportPeriod;
  peopleTotal: number;
  enrolledTotal: number;
  criteria: ReportCriterion[];
}

export interface ReportPersonRow {
  id: string;
  fullName: string;
  initials: string;
  photoUrl?: string | null;
  faculty: string;
  unit: string;
  biometricsStatus: string;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  firstCheckIn?: string | null;
  lastCheckOut?: string | null;
  visits: number;
  cameras: number;
  lastSeenAt?: string | null;
  lastSeenCamera?: string | null;
}

export interface ReportPersonDay {
  date: string;
  weekday: string;
  status?: string | null;
  checkIn?: string | null;
  checkOut?: string | null;
  visits: number;
  firstCamera?: string | null;
}

export interface ReportPersonDetail {
  id: string;
  fullName: string;
  initials: string;
  type: 'talaba' | 'xodim';
  photoUrl?: string | null;
  faculty: string;
  unit: string;
  biometricsStatus: string;
  biometricsConfirmedLabel?: string | null;
  period: ReportPeriod;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  workingDays: number;
  visits: number;
  cameras: number;
  buildings: string[];
  firstCheckIn?: string | null;
  lastCheckOut?: string | null;
  days: ReportPersonDay[];
  note?: string | null;
}

export interface AdminUser {
  id: string;
  name: string;
  login: string;
  initials: string;
  lastLogin: string;
  role: 'Super Admin' | 'Admin' | "Kamera mas'uli";
  email?: string | null;
}

export interface AuditLogEntry {
  id: string;
  timestamp: string;
  user: string;
  action: string;
  module: string;
  status: 'muvaffaqiyatli' | 'xatolik' | 'ogohlantirish';
  ip: string;
}

export type EventSeverity = 'past' | "o'rta" | 'yuqori';
export type EventStatus = 'yangi' | 'tasdiqlangan' | 'rad_etilgan';

/** Signal dalili — app/services/event_bus.py (details). */
export interface EventDetails {
  reason?: string;
  metrics?: Record<string, number | string | null>;
}

export interface AIEvent {
  id: string;
  timestamp: string;
  cameraId: string;
  cameraName: string;
  building: string;
  moduleCode: number;
  moduleName: string;
  group: AIModuleGroup;
  confidence: number;
  severity: EventSeverity;
  status: EventStatus;
  personName?: string;
  reviewedBy?: string;
  /** Aniqlanish paytida olingan kadr — app/services/event_bus.py.
   * Kadr saqlanmagan/yuklab bo'lmagan hodisalarda null. */
  snapshotUrl?: string | null;
  /** ISO vaqt institut mintaqasi bilan — "12 daq oldin" uchun. */
  occurredAt?: string | null;
  /** Operator qaror qilgan payt ("2026-09-15 14:20"). */
  reviewedAt?: string | null;
  /** Sinov rejimidagi modul signali — operator navbatiga chiqmaydi. */
  isTrial?: boolean;
  /** Nega signal: sabab matni va o'lchangan qiymatlar. */
  details?: EventDetails | null;
}

export type AttendanceDayStatus = 'keldi' | 'kelmadi' | 'kech_keldi' | 'dam_olish';

export interface AttendanceDay {
  date: string;
  status: AttendanceDayStatus;
  checkIn?: string;
  checkOut?: string;
  /** TT kriteriya 9 — backend qoidasi (app/routers/attendance.py) hisoblab beradi. */
  earlyLeave?: boolean;
}

/** Davomat sahifasidagi odam kartasi — GET /api/attendance/{id}/summary. */
export interface AttendancePerson {
  id: string;
  fullName: string;
  type: 'talaba' | 'xodim';
  faculty: string;
  unit: string;
  biometricsStatus: 'tasdiqlangan' | 'kutilmoqda' | 'yoq';
  initials: string;
  biometricPhotoUrl: string | null;
}

/** Bir oy yig'indisi. Yozuv bo'lmasa rate va o'rtachalar null ("ma'lumot yo'q" ≠ 0). */
export interface AttendanceMonth {
  month: string;
  recordedDays: number;
  present: number;
  late: number;
  absent: number;
  earlyLeave: number;
  rate: number | null;
  avgArrival: string | null;
  avgPresenceMinutes: number | null;
}

export interface AttendanceSummary {
  person: AttendancePerson;
  /** Eskidan yangiga; oxirgisi — joriy oy. */
  months: AttendanceMonth[];
  /** ISO hafta kunlari (1 — dushanba) — serverdagi absence_marker qoidasi. */
  workingWeekdays: number[];
}

export interface LessonSession {
  id: string;
  date: string;
  group: string;
  faculty: string;
  teacher: string;
  subject: string;
  /** null — hali o'lchanmagan (dars o'tmagan yoki kamera kadr bermagan). */
  attentionScore: number | null;
  sleepIncidents: number;
  teacherActivityScore: number | null;
  /** null — o'qituvchining kelishi tekshirilmagan. */
  teacherOnTime: boolean | null;
  /** Uchalasi birga o'rnatiladi (ScheduleLessonModal) — shundan so'ng
   * app/jobs/teacher_punctuality_ai.py va app/jobs/lesson_quality_ai.py bu
   * darsni avtomatik kuzata boshlaydi. */
  teacherId?: string | null;
  cameraId?: string | null;
  scheduledStartTime?: string | null;
}

/** GET /api/events/summary — Hodisalar jurnalining tepa qatori va filtrlari. */
export interface EventFacet {
  value: string;
  label: string;
  count: number;
}

export interface EventSummary {
  total: number;
  unreviewed: number;
  confirmed: number;
  rejected: number;
  unreviewedHigh: number;
  unreviewedMedium: number;
  unreviewedLow: number;
  today: number;
  todaySerious: number;
  staleSeriousUnreviewed: number;
  oldestUnreviewedHours: number | null;
  avgReviewMinutes: number | null;
  recentPrecision: number | null;
  modules: EventFacet[];
  buildings: EventFacet[];
  /** Sinov rejimidagi, hali baholanmagan signallar. */
  trialUnreviewed: number;
  trialModules: EventFacet[];
}
