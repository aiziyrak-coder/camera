import { useState } from 'react';
import { Check, Copy, ExternalLink } from 'lucide-react';
import { Button, buttonClasses, controlBase } from '../../ui';
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
    <div className="rounded-card border border-info/25 bg-info-soft p-3">
      <p className="mb-2 text-xs font-medium text-fg">{hint ?? "Havolani oching va Telegram'da «Start» tugmasini bosing."}</p>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={link.deepLink}
          onFocus={(e) => e.currentTarget.select()}
          aria-label="Bog'lash havolasi"
          className={`${controlBase} h-8 min-w-0 flex-1 basis-40 px-2.5 font-mono text-xs`}
        />
        <Button size="sm" icon={copied ? Check : Copy} onClick={copy} aria-live="polite">
          {copied ? 'Nusxalandi' : 'Nusxalash'}
        </Button>
        <a href={link.deepLink} target="_blank" rel="noreferrer noopener" className={buttonClasses({ variant: 'primary', size: 'sm' })}>
          <ExternalLink size={15} aria-hidden="true" />
          Ochish
        </a>
      </div>
      <p className="mt-2 text-[11px] text-muted">Bot: @{link.botUsername}. Havola bir martalik — ishlatilgach yangisini yarating.</p>
    </div>
  );
}
