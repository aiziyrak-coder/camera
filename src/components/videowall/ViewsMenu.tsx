import { useRef, useState } from 'react';
import { Check, Download, ExternalLink, LayoutGrid, Pencil, Save, Trash2, Upload, X } from 'lucide-react';
import { LAYOUT_LABELS, MAX_VIEW_NAME, isViewNameTaken, type WallView } from '../../lib/videoWall';
import WallPopover from './WallPopover';

/** "Ko'rinishlar" — nomlangan setkalar (shu brauzerda saqlanadi): tez
 * almashtirish, joriy holatni saqlash/yangilash, nomini o'zgartirish,
 * o'chirish, JSON eksport/import va alohida oynada ochish. */
export default function ViewsMenu({
  views,
  activeViewId,
  dirty,
  onApply,
  onSaveNew,
  onUpdate,
  onRename,
  onDelete,
  onExport,
  onImport,
  onOpenWindow,
}: {
  views: WallView[];
  activeViewId: string | null;
  /** Joriy devor faol ko'rinishdan farq qiladimi. */
  dirty: boolean;
  onApply: (view: WallView) => void;
  onSaveNew: (name: string) => void;
  onUpdate: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
  onExport: () => void;
  onImport: (file: File) => void;
  onOpenWindow: (id: string) => void;
}) {
  const [newName, setNewName] = useState('');
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement | null>(null);
  const active = views.find((view) => view.id === activeViewId) ?? null;

  const newNameError = newName.trim() && isViewNameTaken(views, newName) ? 'Bu nom band' : null;
  const editError = editing && editing.name.trim() && isViewNameTaken(views, editing.name, editing.id) ? 'Bu nom band' : null;

  return (
    <WallPopover
      icon={<LayoutGrid size={14} />}
      label={
        <span className="max-w-[10rem] truncate">
          {active ? active.name : "Ko'rinishlar"}
          {active && dirty ? ' •' : ''}
        </span>
      }
      title="Saqlangan ko'rinishlar"
      widthClass="w-[22rem]"
    >
      {(close) => (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold">Ko&apos;rinishlar</p>
            <span className="text-[10px] text-white/40">shu brauzerda saqlanadi</span>
          </div>

          {views.length === 0 ? (
            <p className="rounded-lg bg-white/5 px-3 py-3 text-center text-xs text-white/50">
              Hali saqlangan ko&apos;rinish yo&apos;q. Devorni to&apos;ldirib, pastda nom bering.
            </p>
          ) : (
            <ul className="max-h-72 space-y-1 overflow-y-auto pr-1">
              {views.map((view, index) => {
                const filled = view.tiles.filter(Boolean).length;
                const isActive = view.id === activeViewId;
                if (editing?.id === view.id) {
                  return (
                    <li key={view.id}>
                      <form
                        className="flex items-center gap-1 rounded-lg bg-white/10 p-1"
                        onSubmit={(event) => {
                          event.preventDefault();
                          if (!editing.name.trim() || editError) return;
                          onRename(view.id, editing.name.trim());
                          setEditing(null);
                        }}
                      >
                        <input
                          autoFocus
                          value={editing.name}
                          maxLength={MAX_VIEW_NAME}
                          onChange={(event) => setEditing({ id: view.id, name: event.target.value })}
                          aria-label="Yangi nom"
                          className="min-w-0 flex-1 rounded-md bg-slate-800 px-2 py-1 text-xs outline-none"
                        />
                        <button type="submit" aria-label="Saqlash" disabled={!!editError} className="rounded-md p-1 hover:bg-white/10 disabled:opacity-40">
                          <Check size={13} />
                        </button>
                        <button type="button" aria-label="Bekor qilish" onClick={() => setEditing(null)} className="rounded-md p-1 hover:bg-white/10">
                          <X size={13} />
                        </button>
                      </form>
                      {editError && <p className="px-1 pt-0.5 text-[10px] text-amber-300">{editError}</p>}
                    </li>
                  );
                }
                return (
                  <li
                    key={view.id}
                    className={`group flex items-center gap-1 rounded-lg px-1 py-0.5 ${isActive ? 'bg-indigo-500/20' : 'hover:bg-white/5'}`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        onApply(view);
                        close();
                      }}
                      className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left"
                    >
                      <span className="w-4 shrink-0 text-[10px] tabular-nums text-white/30">{index + 1}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-xs font-semibold">{view.name}</span>
                        <span className="block text-[10px] text-white/40">
                          {LAYOUT_LABELS[view.layout]} katak · {filled} ta kamera
                        </span>
                      </span>
                    </button>
                    {confirmDelete === view.id ? (
                      <span className="flex items-center gap-1 text-[10px]">
                        <button
                          type="button"
                          onClick={() => {
                            onDelete(view.id);
                            setConfirmDelete(null);
                          }}
                          className="rounded-md bg-rose-600 px-1.5 py-1 font-semibold hover:bg-rose-500"
                        >
                          O&apos;chirish
                        </button>
                        <button type="button" onClick={() => setConfirmDelete(null)} className="rounded-md px-1.5 py-1 hover:bg-white/10">
                          Yo&apos;q
                        </button>
                      </span>
                    ) : (
                      <span className="flex shrink-0 items-center opacity-60 group-hover:opacity-100">
                        <button
                          type="button"
                          onClick={() => onOpenWindow(view.id)}
                          aria-label="Yangi oynada ochish"
                          title="Yangi oynada ochish (ikkinchi monitor)"
                          className="rounded-md p-1 hover:bg-white/10"
                        >
                          <ExternalLink size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditing({ id: view.id, name: view.name })}
                          aria-label="Nomini o'zgartirish"
                          title="Nomini o'zgartirish"
                          className="rounded-md p-1 hover:bg-white/10"
                        >
                          <Pencil size={13} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDelete(view.id)}
                          aria-label="O'chirish"
                          title="O'chirish"
                          className="rounded-md p-1 hover:bg-rose-600/60"
                        >
                          <Trash2 size={13} />
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}

          {active && dirty && (
            <button
              type="button"
              onClick={() => onUpdate(active.id)}
              className="flex w-full items-center justify-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              <Save size={13} />
              «{active.name}» ni joriy devor bilan yangilash
            </button>
          )}

          <form
            className="space-y-1"
            onSubmit={(event) => {
              event.preventDefault();
              const name = newName.trim();
              if (!name || newNameError) return;
              onSaveNew(name);
              setNewName('');
            }}
          >
            <label className="text-[11px] font-semibold text-white/60" htmlFor="videowall-new-view">
              Joriy devorni yangi ko&apos;rinish sifatida saqlash
            </label>
            <div className="flex gap-1.5">
              <input
                id="videowall-new-view"
                value={newName}
                maxLength={MAX_VIEW_NAME}
                onChange={(event) => setNewName(event.target.value)}
                placeholder="Masalan: 1-bino kirishlari"
                className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-800 px-2 py-1.5 text-xs outline-none placeholder:text-white/30 focus:border-indigo-400"
              />
              <button
                type="submit"
                disabled={!newName.trim() || !!newNameError}
                className="flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1.5 text-xs font-semibold hover:bg-indigo-500 disabled:opacity-40"
              >
                <Save size={13} />
                Saqlash
              </button>
            </div>
            {newNameError && <p className="text-[10px] text-amber-300">{newNameError}</p>}
          </form>

          <div className="flex gap-1.5 border-t border-white/10 pt-2.5">
            <button
              type="button"
              onClick={onExport}
              disabled={views.length === 0}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-semibold hover:bg-white/15 disabled:opacity-40"
            >
              <Download size={13} />
              Eksport (JSON)
            </button>
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/10 px-2 py-1.5 text-xs font-semibold hover:bg-white/15"
            >
              <Upload size={13} />
              Import
            </button>
            <input
              ref={fileInput}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = '';
                if (file) onImport(file);
              }}
            />
          </div>
        </div>
      )}
    </WallPopover>
  );
}
