/*
 * ArrowPlot's own backup: a zip with data.json (every table) and images/<id>.<ext>.
 * Restoring validates the whole file first and replaces the data in one transaction, so a bad
 * file never leaves the app half-restored.
 */
import JSZip from 'jszip';
import { db } from '../db';
import { StoredImage } from '../models';

const FORMAT = 'arrowplot-backup';
const VERSION = 1;
const TABLES = [
  'bows',
  'arrows',
  'sessions',
  'rounds',
  'ends',
  'standardRounds',
  'settings',
] as const;

const pad2 = (n: number) => String(n).padStart(2, '0');

export function backupFileName(): string {
  const d = new Date();
  return `ArrowPlot_backup_${d.getFullYear()}_${pad2(d.getMonth() + 1)}_${pad2(d.getDate())}_${pad2(d.getHours())}_${pad2(d.getMinutes())}_${pad2(d.getSeconds())}.zip`;
}

const extOf = (type: string) =>
  type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';

export async function createBackup(): Promise<Blob> {
  const zip = new JSZip();
  const data: Record<string, unknown> = {
    format: FORMAT,
    version: VERSION,
    createdAt: new Date().toISOString(),
  };
  for (const t of TABLES) data[t] = await db.table(t).toArray();
  const images = await db.images.toArray();
  data['images'] = images.map((i) => ({
    id: i.id,
    fileName: i.fileName,
    type: i.blob.type,
    path: `images/${i.id}.${extOf(i.blob.type)}`,
  }));
  zip.file('data.json', JSON.stringify(data));
  for (const i of images) zip.file(`images/${i.id}.${extOf(i.blob.type)}`, i.blob);
  return zip.generateAsync({
    type: 'blob',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
}

export interface BackupSummary {
  createdAt: string;
  sessions: number;
  bows: number;
  arrows: number;
  images: number;
}

interface Parsed {
  data: Record<string, unknown[]> & { createdAt?: string };
  images: StoredImage[];
}

async function parse(file: File): Promise<Parsed> {
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(await file.arrayBuffer());
  } catch {
    throw new Error('This file is not an ArrowPlot backup (not a zip file).');
  }
  const json = zip.file('data.json');
  if (!json) {
    if (Object.keys(zip.files).some((n) => /\.db$/i.test(n))) {
      throw new Error('This looks like a MyTargets backup. Use "Import MyTargets backup" instead.');
    }
    throw new Error('This zip has no data.json. Is it an ArrowPlot backup?');
  }
  const data = JSON.parse(await json.async('string'));
  if (data?.format !== FORMAT) throw new Error('This is not an ArrowPlot backup.');
  if (data.version > VERSION)
    throw new Error('This backup was made by a newer version of ArrowPlot. Update the app first.');
  for (const t of TABLES)
    if (!Array.isArray(data[t])) throw new Error(`The backup is damaged (missing ${t}).`);
  const images: StoredImage[] = [];
  for (const meta of (data.images ?? []) as {
    id: number;
    fileName: string;
    type: string;
    path: string;
  }[]) {
    const f = zip.file(meta.path);
    if (!f) continue;
    images.push({
      id: meta.id,
      fileName: meta.fileName,
      blob: new Blob([await f.async('arraybuffer')], { type: meta.type }),
    });
  }
  return { data, images };
}

export async function inspectBackup(file: File): Promise<BackupSummary & { file: File }> {
  const { data, images } = await parse(file);
  return {
    file,
    createdAt: data.createdAt ?? '',
    sessions: data['sessions'].length,
    bows: data['bows'].length,
    arrows: data['arrows'].length,
    images: images.length,
  };
}

/** Replaces all data with the backup's contents. */
export async function restoreBackup(file: File): Promise<void> {
  const { data, images } = await parse(file);
  await db.transaction('rw', db.tables, async () => {
    for (const t of db.tables) await t.clear();
    for (const t of TABLES) await db.table(t).bulkAdd(data[t]);
    await db.images.bulkAdd(images);
  });
}

/** Saves a blob: share sheet on phones (so it can go to Drive, Files, mail …), download elsewhere. */
export async function saveFile(blob: Blob, name: string): Promise<'shared' | 'downloaded'> {
  const file = new File([blob], name, { type: blob.type || 'application/zip' });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  const touch = matchMedia('(pointer: coarse)').matches;
  if (touch && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
    }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
  return 'downloaded';
}
