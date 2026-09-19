import { useEffect, useState, type FormEvent } from 'react';
import { CheckCircle2, Gamepad2, Loader2, Wifi, XCircle } from 'lucide-react';
import Modal from '../Modal';
import { TextField, SelectField } from '../FormField';
import { forgetPtzAvailability } from '../ptz/usePtzAvailability';
import { required, ipAddress, numberRange } from '../../lib/validation';
import { ApiError, api } from '../../lib/apiClient';
import { useAuth } from '../../lib/auth';
import { ptzApi, type PtzProbeResult } from '../../lib/ptzApi';
import { useBuildings } from '../../lib/useBuildings';
import { useCameraZones } from '../../lib/useCameraZones';
import type { CameraConfig, PtzProtocol } from '../../types';

interface FormState {
  name: string;
  ip: string;
  port: string;
  rtspPath: string;
  rtspUsername: string;
  rtspPassword: string;
  building: string;
  zone: string;
  floor: string;
  resolution: string;
  fps: string;
  status: CameraConfig['status'];
  isEntrance: boolean;
  isPerimeter: boolean;
  isExit: boolean;
  ptzEnabled: boolean;
  ptzProtocol: PtzProtocol | '';
  onvifPort: string;
}

function toForm(c?: CameraConfig | null): FormState {
  return {
    name: c?.name ?? '',
    ip: c?.ip ?? '',
    port: String(c?.port ?? 554),
    rtspPath: c?.rtspPath ?? '',
    // Kirim vaqtida hech qachon to'ldirilmaydi — backend rtsp login/parolni
    // hech qachon qaytarmaydi (haqiqiy sir). Bo'sh qoldirilsa PATCH mavjud
    // qiymatni o'zgartirmay saqlaydi (app/routers/cameras.py'ga qarang).
    rtspUsername: '',
    rtspPassword: '',
    building: c?.building ?? '',
    zone: c?.zone ?? '',
    floor: c?.floor === null || c?.floor === undefined ? '' : String(c.floor),
    resolution: c?.resolution ?? '1080p',
    fps: String(c?.fps ?? 25),
    status: c?.status ?? 'nofaol',
    isEntrance: c?.isEntrance ?? false,
    isPerimeter: c?.isPerimeter ?? false,
    isExit: c?.isExit ?? false,
    ptzEnabled: c?.ptzEnabled ?? false,
    ptzProtocol: c?.ptzProtocol ?? '',
    onvifPort: c?.onvifPort ? String(c.onvifPort) : '',
  };
}

type PtzProbeState = 'idle' | 'testing' | 'done';

interface ConnectionTestResult {
  success: boolean;
  message: string;
  latencyMs: number | null;
  videoInfo: string | null;
}

type TestState = 'idle' | 'testing' | 'success' | 'failed';

export default function AddCameraModal({
  open,
  camera,
  onClose,
  onSave,
}: {
  open: boolean;
  camera?: CameraConfig | null;
  onClose: () => void;
  onSave: (camera: CameraConfig) => void;
}) {
  const { token } = useAuth();
  const { buildings } = useBuildings();
  const isEdit = !!camera;
  const [form, setForm] = useState<FormState>(toForm(camera));
  const { zones } = useCameraZones(form.building || undefined);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>> & { form?: string }>({});
  const [testState, setTestState] = useState<TestState>('idle');
  const [testResult, setTestResult] = useState<ConnectionTestResult | null>(null);
  const [saving, setSaving] = useState(false);
  const [ptzProbeState, setPtzProbeState] = useState<PtzProbeState>('idle');
  const [ptzProbe, setPtzProbe] = useState<PtzProbeResult | null>(null);

  useEffect(() => {
    if (open) {
      setForm(toForm(camera));
      setErrors({});
      setTestState('idle');
      setTestResult(null);
      setPtzProbeState('idle');
      setPtzProbe(null);
    }
  }, [open, camera]);

  const PTZ_KEYS: Array<keyof FormState> = ['ptzEnabled', 'ptzProtocol', 'onvifPort'];

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
    // PTZ maydonlari RTSP ulanishiga ta'sir qilmaydi — ulanish tekshiruvini
    // qayta talab qilmaymiz.
    if (!PTZ_KEYS.includes(key)) setTestState('idle');
    if (key === 'ip' || key === 'onvifPort' || key === 'ptzProtocol' || key === 'rtspUsername' || key === 'rtspPassword') {
      setPtzProbeState('idle');
      setPtzProbe(null);
    }
  }

  /** PTZ ulanishini tekshirish. Saqlangan kamerada login/parol bazadan
   * olinadi (formada yangisi yozilgan bo'lsa — o'sha); yangi kamerada —
   * formadan. Protokol tanlanmagan bo'lsa backend ONVIF, keyin ISAPI'ni
   * sinab ko'radi va ishlaganini qaytaradi. */
  async function runPtzProbe() {
    const ipError = required(form.ip, 'IP manzil kiritilishi shart') ?? ipAddress(form.ip);
    const portError =
      form.onvifPort.trim() === '' ? undefined : numberRange(form.onvifPort, 1, 65535, "1 dan 65535 gacha port kiriting");
    if (ipError || portError) {
      setErrors((prev) => ({ ...prev, ip: ipError, onvifPort: portError }));
      return;
    }
    setPtzProbeState('testing');
    setPtzProbe(null);
    const overrides = {
      protocol: form.ptzProtocol || null,
      onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : null,
      username: form.rtspUsername.trim() || null,
      password: form.rtspPassword || null,
    };
    try {
      const result = isEdit
        ? await ptzApi.probe(camera.id, overrides)
        : await ptzApi.probeUnsaved({ ip: form.ip.trim(), ...overrides });
      setPtzProbe(result);
      if (result.success && result.protocol) {
        setForm((f) => ({ ...f, ptzProtocol: result.protocol ?? f.ptzProtocol }));
        setErrors((prev) => ({ ...prev, ptzProtocol: undefined }));
      }
    } catch (err) {
      setPtzProbe({
        success: false,
        message: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi",
        protocol: null,
        reachable: false,
        authenticated: false,
        ptzSupported: false,
        presetsSupported: false,
        presetCount: null,
        deviceInfo: null,
        latencyMs: null,
        tried: [],
      });
    } finally {
      setPtzProbeState('done');
    }
  }

  function validate(): boolean {
    const next: typeof errors = {
      name: required(form.name, 'Kamera nomi kiritilishi shart'),
      ip: required(form.ip, 'IP manzil kiritilishi shart') ?? ipAddress(form.ip),
      building: form.building ? undefined : 'Binoni tanlang',
      zone: required(form.zone, 'Zona nomi kiritilishi shart'),
      fps: numberRange(form.fps, 1, 60, "1 dan 60 gacha bo'lgan qiymat kiriting"),
      floor:
        form.floor.trim() === ''
          ? undefined
          : numberRange(form.floor, -5, 50, "-5 dan 50 gacha qavat raqamini kiriting"),
      port: numberRange(form.port, 1, 65535, "1 dan 65535 gacha bo'lgan port kiriting"),
      onvifPort:
        form.onvifPort.trim() === ''
          ? undefined
          : numberRange(form.onvifPort, 1, 65535, "1 dan 65535 gacha port kiriting"),
      ptzProtocol:
        form.ptzEnabled && !form.ptzProtocol
          ? "Protokolni tanlang yoki «PTZ ni tekshirish» bilan aniqlang"
          : undefined,
    };
    setErrors(next);
    return !Object.values(next).some(Boolean);
  }

  async function runConnectionTest() {
    if (!validate()) return;
    setTestState('testing');
    setTestResult(null);
    try {
      const result = await api.post<ConnectionTestResult>(
        '/api/cameras/test-connection',
        {
          ip: form.ip.trim(),
          port: Number(form.port),
          rtspPath: form.rtspPath.trim() || null,
          rtspUsername: form.rtspUsername.trim() || null,
          rtspPassword: form.rtspPassword || null,
        },
        token,
      );
      setTestResult(result);
      setTestState(result.success ? 'success' : 'failed');
    } catch (err) {
      setTestResult({
        success: false,
        message: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi",
        latencyMs: null,
        videoInfo: null,
      });
      setTestState('failed');
    }
  }

  async function handleSave(e: FormEvent) {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    setErrors((prev) => ({ ...prev, form: undefined }));
    try {
      const payload = {
        name: form.name.trim(),
        ip: form.ip.trim(),
        port: Number(form.port),
        rtspPath: form.rtspPath.trim() || null,
        rtspUsername: form.rtspUsername.trim() || null,
        rtspPassword: form.rtspPassword || null,
        building: form.building,
        zone: form.zone.trim(),
        // Bo'sh maydon = "qavat belgilanmagan" (null), 0 emas.
        floor: form.floor.trim() === '' ? null : Number(form.floor),
        resolution: form.resolution,
        fps: Number(form.fps),
        status: form.status,
        isEntrance: form.isEntrance,
        isPerimeter: form.isPerimeter,
        isExit: form.isExit,
        ptzEnabled: form.ptzEnabled,
        ptzProtocol: form.ptzProtocol || null,
        onvifPort: form.onvifPort.trim() ? Number(form.onvifPort) : null,
      };
      const saved = isEdit
        ? await api.patch<CameraConfig>(`/api/cameras/${camera.id}`, payload, token)
        : await api.post<CameraConfig>('/api/cameras', payload, token);
      forgetPtzAvailability(saved.id);
      onSave(saved);
      onClose();
    } catch (err) {
      setErrors({ form: err instanceof ApiError ? err.message : "Tarmoq xatosi — backend bilan bog'lanib bo'lmadi" });
    } finally {
      setSaving(false);
    }
  }

  const canSave = isEdit || testState === 'success';

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isEdit ? 'Kamerani sozlash' : "Yangi kamera qo'shish"}
      maxWidth="max-w-md"
    >
      <form onSubmit={handleSave} noValidate className="flex flex-col gap-4">
        {errors.form && (
          <p className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-semibold text-red-600">
            {errors.form}
          </p>
        )}
        <TextField
          label="Kamera nomi"
          placeholder="Kirish eshigi kamerasi"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          error={errors.name}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="IP manzil"
            placeholder="192.168.1.101"
            value={form.ip}
            onChange={(e) => set('ip', e.target.value)}
            error={errors.ip}
          />
          <TextField
            label="RTSP port"
            type="number"
            min={1}
            max={65535}
            value={form.port}
            onChange={(e) => set('port', e.target.value)}
            error={errors.port}
          />
        </div>
        <TextField
          label="RTSP yo'l (ixtiyoriy)"
          placeholder="/stream1"
          value={form.rtspPath}
          onChange={(e) => set('rtspPath', e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <TextField
            label="RTSP login (ixtiyoriy)"
            value={form.rtspUsername}
            onChange={(e) => set('rtspUsername', e.target.value)}
            autoComplete="off"
          />
          <TextField
            label="RTSP parol (ixtiyoriy)"
            type="password"
            value={form.rtspPassword}
            onChange={(e) => set('rtspPassword', e.target.value)}
            autoComplete="new-password"
          />
        </div>
        {isEdit && (
          <p className="-mt-2 text-[11px] text-slate-400">
            Login/parol bo'sh qoldirilsa, avval saqlangan qiymat o'zgarishsiz qoladi.
          </p>
        )}
        <div className="grid grid-cols-2 gap-3">
          <SelectField
            label="Bino"
            placeholder="Tanlang"
            value={form.building}
            onChange={(e) => set('building', e.target.value)}
            error={errors.building}
            options={buildings.map((b) => ({ value: b.name, label: b.name }))}
          />
          <div>
            <TextField
              label="Zona"
              placeholder="A-Zona (Kirish)"
              value={form.zone}
              onChange={(e) => set('zone', e.target.value)}
              error={errors.zone}
              list="camera-zone-options"
            />
            <datalist id="camera-zone-options">
              {zones.map((z) => (
                <option key={z.zone} value={z.zone}>
                  {z.cameraCount} ta kamera
                </option>
              ))}
            </datalist>
            {(() => {
              const existing = zones.find((z) => z.zone === form.zone.trim());
              return existing ? (
                <p className="mt-1 text-[11px] text-slate-400">
                  Bu xonada allaqachon {existing.cameraCount} ta kamera bor — yangisi qo'shiladi
                </p>
              ) : null;
            })()}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <TextField
              label="Qavat"
              type="number"
              min={-5}
              max={50}
              placeholder="Masalan: 3"
              value={form.floor}
              onChange={(e) => set('floor', e.target.value)}
              error={errors.floor}
            />
            <p className="mt-1 text-[11px] text-slate-400">
              Monitoring markazi kameralarni shu bo&apos;yicha qavatlarga ajratadi. Bo&apos;sh
              qoldirilsa &laquo;Qavat belgilanmagan&raquo; guruhida qoladi.
            </p>
          </div>
          <SelectField
            label="Ruxsat"
            value={form.resolution}
            onChange={(e) => set('resolution', e.target.value)}
            options={[
              { value: '720p', label: '720p' },
              { value: '1080p', label: '1080p' },
              { value: '4K', label: '4K' },
            ]}
          />
          <TextField
            label="FPS"
            type="number"
            min={1}
            max={60}
            value={form.fps}
            onChange={(e) => set('fps', e.target.value)}
            error={errors.fps}
          />
        </div>
        <SelectField
          label="Holat"
          value={form.status}
          onChange={(e) => set('status', e.target.value as CameraConfig['status'])}
          options={[
            { value: 'faol', label: 'Faol' },
            { value: 'nofaol', label: 'Nofaol' },
            { value: 'tamirda', label: "Ta'mirda" },
          ]}
        />
        <label className="flex items-center gap-2.5 rounded-xl bg-white/40 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isEntrance}
            onChange={(e) => set('isEntrance', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-slate-700">
            Kirish/koridor kamerasi
            <span className="ml-1.5 text-[11px] text-slate-400">
              (davomat uchun bir necha kadr tekshiriladi — tez o'tib ketuvchini ushlash ehtimolini oshiradi)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2.5 rounded-xl bg-white/40 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isPerimeter}
            onChange={(e) => set('isPerimeter', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-slate-700">
            Hovli / perimetr kamerasi
            <span className="ml-1.5 text-[11px] text-slate-400">
              (transport AI faqat shu kameralarda ishlaydi — bino oldi, avtoturargoh)
            </span>
          </span>
        </label>
        <label className="flex items-center gap-2.5 rounded-xl bg-white/40 px-3 py-2.5 text-sm">
          <input
            type="checkbox"
            checked={form.isExit}
            onChange={(e) => set('isExit', e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
          <span className="text-slate-700">
            Chiqish kamerasi
            <span className="ml-1.5 text-[11px] text-slate-400">
              (faqat shu kamerada ko'rinish "ketdi" deb belgilanadi — boshqa ichki kameralar davomatni
              tasdiqlaydi, lekin ketishni belgilamaydi)
            </span>
          </span>
        </label>

        <fieldset className="space-y-3 rounded-xl bg-white/40 px-3 py-3">
          <legend className="sr-only">PTZ boshqaruvi</legend>
          <label className="flex items-center gap-2.5 text-sm">
            <input
              type="checkbox"
              checked={form.ptzEnabled}
              onChange={(e) => set('ptzEnabled', e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="flex items-center gap-1.5 text-slate-700">
              <Gamepad2 size={15} className="text-indigo-500" />
              PTZ (buriladigan) kamera
              <span className="text-[11px] text-slate-400">— operator uni monitoringdan boshqaradi</span>
            </span>
          </label>
          <div className="grid grid-cols-2 gap-3">
            <SelectField
              label="PTZ protokoli"
              placeholder="Aniqlanmagan"
              value={form.ptzProtocol}
              onChange={(e) => set('ptzProtocol', e.target.value as FormState['ptzProtocol'])}
              error={errors.ptzProtocol}
              options={[
                { value: 'onvif', label: 'ONVIF' },
                { value: 'isapi', label: 'Hikvision ISAPI' },
              ]}
            />
            <TextField
              label="HTTP (ONVIF) port"
              type="number"
              min={1}
              max={65535}
              placeholder="80"
              value={form.onvifPort}
              onChange={(e) => set('onvifPort', e.target.value)}
              error={errors.onvifPort}
            />
          </div>
          <div>
            <button
              type="button"
              onClick={runPtzProbe}
              disabled={ptzProbeState === 'testing'}
              className="btn-glass flex w-full items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {ptzProbeState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : <Gamepad2 size={14} />}
              {ptzProbeState === 'testing' ? 'PTZ tekshirilmoqda...' : 'PTZ ni tekshirish'}
            </button>
            {ptzProbe && (
              <div
                className={`mt-2 rounded-xl px-3 py-2 text-xs font-semibold ${
                  ptzProbe.success ? 'bg-emerald-50 text-emerald-700' : 'bg-red-50 text-red-600'
                }`}
              >
                <p className="flex items-center gap-1.5">
                  {ptzProbe.success ? <CheckCircle2 size={14} /> : <XCircle size={14} />}
                  {ptzProbe.message}
                  {ptzProbe.latencyMs != null ? ` (${ptzProbe.latencyMs} ms)` : ''}
                </p>
                {ptzProbe.deviceInfo && <p className="mt-0.5 font-medium opacity-80">Qurilma: {ptzProbe.deviceInfo}</p>}
                {ptzProbe.success && !ptzProbe.presetsSupported && (
                  <p className="mt-0.5 font-medium opacity-80">Presetlar qo&apos;llab-quvvatlanmaydi</p>
                )}
                {ptzProbe.success && !form.ptzEnabled && (
                  <button
                    type="button"
                    onClick={() => set('ptzEnabled', true)}
                    className="mt-1.5 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700"
                  >
                    PTZ boshqaruvini yoqish
                  </button>
                )}
              </div>
            )}
            <p className="mt-1.5 text-[11px] text-slate-400">
              Login/parol — RTSP bilan bir xil. Protokol tanlanmasa, avval ONVIF, keyin Hikvision ISAPI sinaladi.
            </p>
          </div>
        </fieldset>

        {!isEdit && (
          <div>
            <button
              type="button"
              onClick={runConnectionTest}
              disabled={testState === 'testing'}
              className="btn-glass flex w-full items-center justify-center gap-1.5 disabled:cursor-not-allowed disabled:opacity-70"
            >
              {testState === 'testing' ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Wifi size={14} />
              )}
              {testState === 'testing' ? 'Ulanish tekshirilmoqda...' : 'Ulanishni tekshirish'}
            </button>

            {testState === 'success' && testResult && (
              <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-600">
                <CheckCircle2 size={14} />
                {testResult.message}
                {testResult.latencyMs != null ? ` (${testResult.latencyMs} ms)` : ''}
              </p>
            )}
            {testState === 'failed' && testResult && (
              <p className="mt-2 flex items-center gap-1.5 rounded-xl bg-red-50 px-3 py-2 text-xs font-semibold text-red-600">
                <XCircle size={14} />
                {testResult.message}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-slate-400">
              Haqiqiy tekshiruv: TCP portga ulanish va imkon bo'lsa RTSP oqimini ffprobe orqali tasdiqlash.
            </p>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <button type="button" onClick={onClose} className="btn-glass">
            Bekor qilish
          </button>
          <button
            type="submit"
            disabled={!canSave || saving}
            className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-btn transition-colors hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
