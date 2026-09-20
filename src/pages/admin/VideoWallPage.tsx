import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import VideoWall from '../../components/videowall/VideoWall';
import { videoWallEntry } from '../../layouts/legacyRoutes';
import type { WallCameraRequest } from '../../lib/videoWall';

/** /videodevor — jonli kameralarning yagona ekrani: setka (ko'rinishlar,
 *  tur, alohida oyna) va yon paneldagi bino → qavat → kamera daraxti.
 *  Ilgari bu ikki alohida tab edi ("Bir ekranda ko'p kamera" va "Bino va
 *  qavat bo'yicha") — ikkalasi ham oxir-oqibat jonli kamera ochardi.
 *  /videodevor/ekran — `standalone`: menyusiz, ikkinchi monitor uchun. */
export default function VideoWallPage({ standalone = false }: { standalone?: boolean }) {
  const [params, setParams] = useSearchParams();
  const search = params.toString();
  // Manzil HAR SAFAR o'qiladi, faqat ochilishda emas: boshqa varaqdagi
  // havola (`?kamera=<id>`) bosilganda yoki manzil qo'lda o'zgartirilganda
  // ham ishlashi kerak edi — ilgari parametrlar bir marta, birinchi
  // renderda olinib, keyingilari e'tiborsiz qolardi.
  const entry = useMemo(() => videoWallEntry(search), [search]);

  // Kamera so'rovi URL'dan alohida saqlanadi: parametr o'qilgandan keyin
  // darhol o'chiriladi (havola ikki marta qo'llanmasin, "orqaga" bosilganda
  // devor qayta o'zgarmasin), so'rovning o'zi esa kameralar ro'yxati
  // yuklanguncha kutib turishi kerak. `nonce` — har yangi havola uchun
  // yangi son, shuning uchun bir xil kamera qayta so'ralsa ham ishlaydi.
  const [cameraRequest, setCameraRequest] = useState<WallCameraRequest | null>(null);
  const requestedId = entry.cameraId;
  useEffect(() => {
    // Parametr o'chirilgach `requestedId` null bo'ladi; keyingi havola
    // uni yana to'ldiradi va effekt qaytadan ishlaydi.
    if (!requestedId) return;
    setCameraRequest((prev) => ({ id: requestedId, nonce: (prev?.nonce ?? 0) + 1 }));
  }, [requestedId]);

  useEffect(() => {
    if (standalone || !entry.changed) return;
    setParams(new URLSearchParams(entry.nextSearch), { replace: true });
  }, [standalone, entry, setParams]);

  if (standalone) return <VideoWall standalone />;
  return <VideoWall initialSearch={entry.search} cameraRequest={cameraRequest} />;
}
