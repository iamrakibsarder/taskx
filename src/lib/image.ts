/**
 * Turns an uploaded image into a small square-fit logo (data URL), so it can live
 * inside the client record. ~10–40 KB, crisp at 2× on the largest avatar.
 */
export async function fileToLogo(file: File, max = 160): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('Choose an image file (PNG, JPG, SVG or WebP).');
  if (file.size > 5 * 1024 * 1024) throw new Error('That image is over 5 MB.');
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error('Couldn’t read that image.'));
      i.src = url;
    });
    const w = img.naturalWidth || max;
    const h = img.naturalHeight || max;
    const scale = Math.min(1, max / Math.max(w, h));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(w * scale));
    canvas.height = Math.max(1, Math.round(h * scale));
    const ctx = canvas.getContext('2d')!;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const webp = canvas.toDataURL('image/webp', 0.9);
    // Browsers without WebP encoding return PNG anyway.
    return webp.startsWith('data:image/webp') ? webp : canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}
