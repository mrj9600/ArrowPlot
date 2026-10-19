import { db } from './db';

/** Stores a picked photo, scaled down to at most `max` px so storage stays small. */
export async function storePhoto(file: File, max = 1280): Promise<number> {
  let blob: Blob = file;
  try {
    const bmp = await createImageBitmap(file);
    const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bmp.width * k);
    canvas.height = Math.round(bmp.height * k);
    canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
    blob = await new Promise<Blob>((ok, no) =>
      canvas.toBlob((b) => (b ? ok(b) : no(new Error('encode'))), 'image/jpeg', 0.85),
    );
  } catch {
    /* keep the original file */
  }
  return db.images.add({ blob, fileName: file.name });
}
