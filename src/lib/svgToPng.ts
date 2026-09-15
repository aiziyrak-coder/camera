/** Sahifadagi recharts grafigini PDF uchun PNG rasmga aylantiradi.
 *  Grafik qayta chizilmaydi — foydalanuvchi ko'rgan grafik aynan o'zi. */

export interface ChartImage {
  dataUrl: string;
  width: number;
  height: number;
}

/** `ChartCard` ichidagi grafik: `data-pdf-chart="<kalit>"` konteyneridagi SVG. */
export function findChartSvg(root: ParentNode, key: string): SVGSVGElement | null {
  const holder = root.querySelector(`[data-pdf-chart="${key}"]`);
  return holder?.querySelector<SVGSVGElement>('svg.recharts-surface') ?? null;
}

export async function svgToPng(svg: SVGSVGElement, scale = 2): Promise<ChartImage | null> {
  const rect = svg.getBoundingClientRect();
  const width = Math.round(rect.width);
  const height = Math.round(rect.height);
  if (!width || !height) return null;

  const clone = svg.cloneNode(true) as SVGSVGElement;
  clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  clone.setAttribute('width', String(width));
  clone.setAttribute('height', String(height));
  clone.style.fontFamily = 'Inter, "Plus Jakarta Sans", system-ui, sans-serif';

  const markup = new XMLSerializer().serializeToString(clone);
  const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' }));
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = reject;
      img.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.scale(scale, scale);
    ctx.drawImage(image, 0, 0, width, height);
    return { dataUrl: canvas.toDataURL('image/png'), width, height };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
