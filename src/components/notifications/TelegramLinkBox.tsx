import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import type { TelegramLink } from '../../lib/notificationsApi';

/** Bir martalik bog'lash havolasi: ochish yoki nusxalab yuborish.
 *  Havola botga "/start <kod>" yuboradi — kod ishlatilgach yaroqsiz bo'ladi. */
export default function TelegramLinkBox({ link, hint }: { link: TelegramLink; hint?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link.deepLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard ruxsati yo'q (http, eski brauzer) — matn tanlab olinadi.
      setCopied(false);
    }
  }

  return (
    <div className="rounded-xl border border-sky-200 bg-sky-50/80 p-3">
      <p className="mb-2 text-[11px] font-semibold text-sky-800">
        {hint ?? "Havolani oching va Telegram'da «Start» tugmasini bosing."}
      </p>
      <div className="flex items-center gap-2">
        <input
          readOnly
          value={link.deepLink}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Bog'lash havolasi"
          className="min-w-0 flex-1 rounded-lg border border-white/80 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-700 outline-none"
        />
        <button
          type="button"
          onClick={copy}
          className="flex shrink-0 items-center gap-1 rounded-lg bg-white px-2.5 py-1.5 text-xs font-semibold text-sky-700 shadow-sm hover:bg-sky-100"
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
          {copied ? 'Nusxalandi' : 'Nusxalash'}
        </button>
        <a
          href={link.deepLink}
          target="_blank"
          rel="noreferrer noopener"
          className="flex shrink-0 items-center gap-1 rounded-lg bg-sky-600 px-2.5 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-sky-700"
        >
          <ExternalLink size={13} />
          Ochish
        </a>
      </div>
      <p className="mt-2 text-[10px] text-sky-700/80">
        Bot: @{link.botUsername}. Havola bir martalik — ishlatilgach yangisini yarating.
      </p>
    </div>
  );
}
