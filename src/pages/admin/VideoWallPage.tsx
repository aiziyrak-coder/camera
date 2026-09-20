import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import VideoWall from '../../components/videowall/VideoWall';
import { videoWallEntry } from '../../layouts/legacyRoutes';

/** /videodevor — jonli kameralarning yagona ekrani: setka (ko'rinishlar,
 *  tur, alohida oyna) va yon paneldagi bino → qavat → kamera daraxti.
 *  Ilgari bu ikki alohida tab edi ("Bir ekranda ko'p kamera" va "Bino va
 *  qavat bo'yicha") — ikkalasi ham oxir-oqibat jonli kamera ochardi.
 *  /videodevor/ekran — `standalone`: menyusiz, ikkinchi monitor uchun. */
export default function VideoWallPage({ standalone = false }: { standalone?: boolean }) {
  const [params, setParams] = useSearchParams();
  // Eski parametrlar faqat ochilishda o'qiladi: keyin ular URL'dan
  // o'chiriladi va qayta ishlamaydi.
  const [entry] = useState(() => videoWallEntry(params.toString()));

  useEffect(() => {
    if (standalone || !entry.changed) return;
    setParams(new URLSearchParams(entry.nextSearch), { replace: true });
    // Bir marta: `entry` boshlang'ich holatdan olingan va o'zgarmaydi.
  }, [standalone, entry, setParams]);

  if (standalone) return <VideoWall standalone />;
  return <VideoWall initialSearch={entry.search} initialCameraId={entry.cameraId} />;
}
