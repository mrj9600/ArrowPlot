import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  computed,
  inject,
  signal,
} from '@angular/core';
import type Tesseract from 'tesseract.js';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';

/** What Tesseract found: one box per word, in processed-image pixels. */
interface Found {
  text: string;
  conf: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

type Prep = 'color' | 'gray' | 'bw';

const MAX_SIDE = 2000;

/**
 * Test page for reading handwritten score sheets with Tesseract, on the device.
 * Not linked from the main navigation; reached from More.
 */
@Component({
  selector: 'app-ocr-lab',
  imports: [AppBar, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Test: read a score sheet" back="/more" />
    <div class="page">
      <div class="card" style="display:grid;gap:10px">
        <p class="small" style="margin:0">
          Take a photo of a handwritten score sheet. Tesseract reads it on this phone; nothing is
          sent anywhere. The first run downloads its language data (a few MB).
        </p>
        <div class="row wrap">
          <label class="btn primary"
            ><app-icon name="upload" /> Take photo
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              (change)="pick($event)"
          /></label>
          <label class="btn"
            >Choose image <input type="file" accept="image/*" hidden (change)="pick($event)"
          /></label>
        </div>
      </div>

      @if (source()) {
        <div class="card" style="display:grid;gap:10px">
          <div class="field">
            <span>Image</span>
            <div class="seg">
              <button type="button" [class.on]="prep() === 'color'" (click)="setPrep('color')">
                Colour
              </button>
              <button type="button" [class.on]="prep() === 'gray'" (click)="setPrep('gray')">
                Grey
              </button>
              <button type="button" [class.on]="prep() === 'bw'" (click)="setPrep('bw')">
                Black/white
              </button>
            </div>
          </div>
          @if (prep() === 'bw') {
            <label class="field"
              ><span>Threshold {{ threshold() }} (auto {{ autoThreshold() }})</span>
              <input
                type="range"
                min="40"
                max="230"
                [value]="threshold()"
                (input)="setThreshold(+$any($event.target).value)"
              />
            </label>
          }
          <div class="grid2">
            <label class="field"
              ><span>Layout</span>
              <select class="input" (change)="psm.set($any($event.target).value)">
                <option value="11" [selected]="psm() === '11'">Scattered text</option>
                <option value="6" [selected]="psm() === '6'">One block</option>
                <option value="3" [selected]="psm() === '3'">Automatic</option>
              </select>
            </label>
            <label class="check small" style="align-self:end"
              ><input
                type="checkbox"
                [checked]="digitsOnly()"
                (change)="digitsOnly.set($any($event.target).checked)"
              />
              Only 0–9, X and M</label
            >
          </div>
          <button class="btn primary" type="button" (click)="run()" [disabled]="!!busy()">
            Read sheet
          </button>
          @if (busy()) {
            <div class="notice small">{{ busy() }}</div>
          }
          @if (error()) {
            <div class="notice err small">{{ error() }}</div>
          }
        </div>

        <div class="card flush sheet">
          <div class="frame">
            <img [src]="processedUrl()" alt="Processed score sheet" />
            @if (found().length) {
              <svg [attr.viewBox]="'0 0 ' + size().w + ' ' + size().h" preserveAspectRatio="none">
                @for (f of found(); track $index) {
                  <rect
                    [attr.x]="f.x"
                    [attr.y]="f.y"
                    [attr.width]="f.w"
                    [attr.height]="f.h"
                    [attr.stroke]="colour(f.conf)"
                    [attr.stroke-width]="size().w / 300"
                    fill="none"
                  />
                  <text
                    [attr.x]="f.x"
                    [attr.y]="f.y - size().w / 200"
                    [attr.font-size]="size().w / 40"
                    [attr.fill]="colour(f.conf)"
                    font-weight="700"
                  >
                    {{ f.text }}
                  </text>
                }
              </svg>
            }
          </div>
        </div>

        @if (lines().length) {
          <div class="card" style="display:grid;gap:8px">
            <h3 style="margin:0">Read text</h3>
            <p class="small muted" style="margin:0">
              {{ found().length }} words · average certainty {{ avgConf() }}% · {{ seconds() }} s.
              Box colours: <b style="color:#1f8a50">green</b> sure,
              <b style="color:#c98a00">yellow</b> unsure, <b style="color:#c0392b">red</b> guess.
            </p>
            <pre>{{
              lines().join(
                '
'
              )
            }}</pre>
          </div>
        }
      }
    </div>
  `,
  styles: `
    .sheet {
      padding: 8px;
    }
    .frame {
      position: relative;
    }
    .frame img {
      display: block;
      width: 100%;
      height: auto;
      border-radius: 8px;
    }
    .frame svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
    }
    pre {
      margin: 0;
      white-space: pre-wrap;
      font: 15px/1.5 var(--mono);
      background: var(--surface-2);
      padding: 10px;
      border-radius: 8px;
    }
  `,
})
export class OcrLabPage {
  protected readonly source = signal<HTMLCanvasElement | null>(null);
  protected readonly processedUrl = signal('');
  protected readonly size = signal({ w: 1, h: 1 });
  protected readonly prep = signal<Prep>('bw');
  protected readonly threshold = signal(128);
  protected readonly autoThreshold = signal(128);
  protected readonly psm = signal('11');
  protected readonly digitsOnly = signal(true);
  protected readonly busy = signal('');
  protected readonly error = signal('');
  protected readonly found = signal<Found[]>([]);
  protected readonly lines = signal<string[]>([]);
  protected readonly seconds = signal('');
  protected readonly avgConf = computed(() => {
    const f = this.found();
    return f.length ? Math.round(f.reduce((a, x) => a + x.conf, 0) / f.length) : 0;
  });

  private processed: HTMLCanvasElement | null = null;
  private worker: Promise<Tesseract.Worker> | null = null;

  constructor() {
    inject(DestroyRef).onDestroy(() => this.worker?.then((w) => w.terminate()));
  }

  protected colour(conf: number) {
    return conf >= 80 ? '#1f8a50' : conf >= 50 ? '#c98a00' : '#c0392b';
  }

  protected async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    this.error.set('');
    this.found.set([]);
    this.lines.set([]);
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const k = Math.min(1, MAX_SIDE / Math.max(bmp.width, bmp.height));
      const c = document.createElement('canvas');
      c.width = Math.round(bmp.width * k);
      c.height = Math.round(bmp.height * k);
      c.getContext('2d')!.drawImage(bmp, 0, 0, c.width, c.height);
      this.source.set(c);
      this.autoThreshold.set(otsu(c));
      this.threshold.set(this.autoThreshold());
      this.process();
    } catch (err) {
      this.error.set(`Could not open the image: ${(err as Error).message}`);
    }
  }

  protected setPrep(p: Prep) {
    this.prep.set(p);
    this.process();
  }
  protected setThreshold(v: number) {
    this.threshold.set(v);
    this.process();
  }

  /** Applies the chosen pre-processing to a copy of the photo. */
  private process() {
    const src = this.source();
    if (!src) return;
    const c = document.createElement('canvas');
    c.width = src.width;
    c.height = src.height;
    const ctx = c.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    if (this.prep() !== 'color') {
      const img = ctx.getImageData(0, 0, c.width, c.height);
      const d = img.data;
      const t = this.threshold();
      for (let i = 0; i < d.length; i += 4) {
        const g = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
        const v = this.prep() === 'bw' ? (g < t ? 0 : 255) : g;
        d[i] = d[i + 1] = d[i + 2] = v;
      }
      ctx.putImageData(img, 0, 0);
    }
    this.processed = c;
    this.size.set({ w: c.width, h: c.height });
    this.processedUrl.set(c.toDataURL('image/jpeg', 0.85));
    this.found.set([]);
    this.lines.set([]);
  }

  private getWorker(): Promise<Tesseract.Worker> {
    this.worker ??= import('tesseract.js').then((m) =>
      m.createWorker('eng', 1, {
        logger: (msg: { status: string; progress: number }) =>
          this.busy.set(`${msg.status} ${Math.round(msg.progress * 100)}%`),
      }),
    );
    return this.worker;
  }

  protected async run() {
    if (!this.processed) return;
    this.error.set('');
    this.busy.set('Starting Tesseract …');
    const t0 = performance.now();
    try {
      const w = await this.getWorker();
      await w.setParameters({
        tessedit_pageseg_mode: this.psm() as Tesseract.PSM,
        tessedit_char_whitelist: this.digitsOnly() ? '0123456789XMxm' : '',
      });
      const { data } = await w.recognize(this.processed, {}, { text: true, blocks: true });
      const words: Found[] = [];
      const lines: string[] = [];
      for (const b of data.blocks ?? [])
        for (const p of b.paragraphs)
          for (const l of p.lines) {
            if (l.text.trim()) lines.push(l.text.trim());
            for (const wd of l.words) {
              if (!wd.text.trim()) continue;
              words.push({
                text: wd.text.trim(),
                conf: Math.round(wd.confidence),
                x: wd.bbox.x0,
                y: wd.bbox.y0,
                w: wd.bbox.x1 - wd.bbox.x0,
                h: wd.bbox.y1 - wd.bbox.y0,
              });
            }
          }
      this.found.set(words);
      this.lines.set(lines.length ? lines : ['(nothing recognised)']);
      this.seconds.set(((performance.now() - t0) / 1000).toFixed(1));
    } catch (err) {
      console.error(err);
      this.error.set(`Reading failed: ${(err as Error).message ?? err}`);
    } finally {
      this.busy.set('');
    }
  }
}

/** Otsu's method: the grey level that best splits ink from paper. */
function otsu(c: HTMLCanvasElement): number {
  const d = c.getContext('2d')!.getImageData(0, 0, c.width, c.height).data;
  const hist = new Array(256).fill(0);
  for (let i = 0; i < d.length; i += 4) {
    hist[Math.round(0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2])]++;
  }
  const total = d.length / 4;
  let sum = 0;
  for (let i = 0; i < 256; i++) sum += i * hist[i];
  let sumB = 0;
  let wB = 0;
  let best = 0;
  let level = 128;
  for (let t = 0; t < 256; t++) {
    wB += hist[t];
    if (!wB) continue;
    const wF = total - wB;
    if (!wF) break;
    sumB += t * hist[t];
    const mB = sumB / wB;
    const mF = (sum - sumB) / wF;
    const between = wB * wF * (mB - mF) ** 2;
    if (between > best) {
      best = between;
      level = t;
    }
  }
  return level;
}
