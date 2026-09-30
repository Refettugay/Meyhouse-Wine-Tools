// Shrink a photo on the device before upload: max ~900 px JPEG for the card and
// a ~200 px thumbnail for the list. Browsers apply the camera's EXIF rotation
// when decoding, so portrait phone photos come out upright.

function load(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("decode")); };
    img.src = url;
  });
}

function draw(img: HTMLImageElement, max: number, quality: number): string {
  const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(img.naturalWidth * scale));
  c.height = Math.max(1, Math.round(img.naturalHeight * scale));
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("canvas");
  ctx.fillStyle = "#fff"; // transparent PNGs -> white, not black
  ctx.fillRect(0, 0, c.width, c.height);
  ctx.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", quality);
}

export type ShrunkPhoto = { full: string; thumb: string; preview: string }; // full/thumb = base64 without prefix

export async function shrinkPhoto(file: File): Promise<ShrunkPhoto> {
  const img = await load(file);
  const full = draw(img, 900, 0.82);
  const thumb = draw(img, 200, 0.78);
  return { full: full.split(",")[1] ?? "", thumb: thumb.split(",")[1] ?? "", preview: full };
}
