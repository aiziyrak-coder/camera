import { CodeText, IntelPanel, MicroLabel, RAG_LABEL, RAG_LETTER, RAG_SOLID, RAG_TEXT, cn, formatNumber, rag } from '../../ui';
import type { LiveResource } from '../situation/useLiveResource';
import { MeasuredAt, Metric, Recommendation, ResourceBody, StatusLine, formatServerTime } from './parts';
import { COVERAGE_RAG, type SystemCameraNetwork } from './systemTypes';

/**
 * Kamera tarmog'i — o'lchov bloki.
 *
 * Aloqa ULUSHI (onlayn / faol) uchun chegara bor: 100% talab, 90% dan
 * past — chora. Shuning uchun u svetofor bilan chiqadi. "Aloqada emas"
 * va "24 soatlik ogohlantirish" — sanoq; ular tarmoq hajmiga bog'liq,
 * lekin noldan katta bo'lishi o'z-o'zidan diqqat talab qiladi, shuning
 * uchun faqat ohang beriladi, svetofor hukmi emas.
 */
export function CameraNetworkCard({ resource }: { resource: LiveResource<SystemCameraNetwork> }) {
  return (
    <IntelPanel title="Kamera tarmog'i" code="SYS-NET" right={<MeasuredAt resource={resource} />}>
      <ResourceBody resource={resource}>
        {(net) => {
          const sweptAt = formatServerTime(net.lastSweep.finishedAt);
          const coverage = net.faolCameras > 0 ? (net.reachableCameras / net.faolCameras) * 100 : null;
          const verdict = rag(coverage, COVERAGE_RAG);
          return (
            <div>
              <div className="border-b border-border px-2.5 py-2">
                <div className="flex items-baseline gap-2">
                  <MicroLabel>Aloqada</MicroLabel>
                  <span className="ms-auto flex items-baseline gap-1.5">
                    <CodeText className={cn('text-[15px] font-semibold', RAG_TEXT[verdict])}>
                      {formatNumber(net.reachableCameras)} / {formatNumber(net.faolCameras)}
                    </CodeText>
                    <CodeText className={cn('text-[11px] font-semibold', RAG_TEXT[verdict])}>
                      {coverage === null ? '—' : `${formatNumber(coverage, 1)}%`}
                    </CodeText>
                    <CodeText className={cn('text-[10px] font-bold', RAG_TEXT[verdict])} title={RAG_LABEL[verdict]}>
                      {RAG_LETTER[verdict]}
                    </CodeText>
                    <span className="sr-only">{RAG_LABEL[verdict]}</span>
                  </span>
                </div>
                {/* Ingichka ikki bo'lakli shkala — halqa emas, o'lchov chizig'i. */}
                <div className="mt-1.5 flex h-1.5 w-full bg-surface-2" aria-hidden="true">
                  <span className={cn('h-full', RAG_SOLID.yashil)} style={{ width: `${coverage ?? 0}%` }} />
                  <span className={cn('h-full flex-1', net.offlineCameras > 0 && RAG_SOLID.qizil)} />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-px border-b border-border bg-border">
                <Metric
                  label="Aloqada emas"
                  value={formatNumber(net.offlineCameras)}
                  unit="ta"
                  tone={net.offlineCameras > 0 ? 'danger' : 'success'}
                  hint="Hozir javob bermayapti"
                />
                <Metric
                  label="Uzoq vaqt offline"
                  value={formatNumber(net.chronicOfflineCount)}
                  unit="ta"
                  tone={net.chronicOfflineCount > 0 ? 'danger' : undefined}
                  // Qizil raqam nimani anglatishini aytmasa, operator nima qilishni bilmaydi.
                  hint={net.offlineAlertMinutes ? `${net.offlineAlertMinutes} daqiqadan ortiq` : 'Uzluksiz offline'}
                />
                {/* "24 s" emas — ko'rsatkich oxirgi 24 SOATdagi ogohlantirishlar soni. */}
                <Metric
                  label="Ogohlantirish (24 soat)"
                  value={formatNumber(net.recentOfflineAlerts24h)}
                  unit="ta"
                  tone={net.recentOfflineAlerts24h > 0 ? 'warning' : undefined}
                  hint="Offline haqida yuborilgan"
                />
              </div>
              <div className="divide-y divide-border">
                <StatusLine tone={net.lastSweep.skippedOverlap ? 'warning' : 'neutral'}>
                  {/* Tekshiruv sahifa yangilanishidan mustaqil ishlaydi — qachon bo'lgani aytilmasa,
                      eski natija jonli holat kabi o'qiladi. */}
                  Oxirgi tekshiruv{sweptAt ? <> (<CodeText>{sweptAt}</CodeText>)</> : null}:{' '}
                  <CodeText>
                    {formatNumber(net.lastSweep.reachable)}/{formatNumber(net.lastSweep.faolChecked)}
                  </CodeText>{' '}
                  javob berdi, <CodeText>{formatNumber(net.lastSweep.durationSeconds, 1)} s</CodeText>
                  {net.lastSweep.skippedOverlap ? " (ustma-ust tushib o'tkazildi)" : ''}
                  {net.healthIntervalSeconds ? (
                    <>
                      {' · har '}
                      <CodeText>{net.healthIntervalSeconds} s</CodeText> da takrorlanadi
                    </>
                  ) : null}
                </StatusLine>
                {net.linkLocalIpCount > 0 && (
                  <StatusLine tone="warning">
                    <CodeText>{net.linkLocalIpCount}</CodeText> ta kamerada <CodeText>169.254.x.x</CodeText> manzil — DHCP ishlamagan, IP sozlang
                  </StatusLine>
                )}
              </div>
              <Recommendation>{net.recommendation}</Recommendation>
            </div>
          );
        }}
      </ResourceBody>
    </IntelPanel>
  );
}
