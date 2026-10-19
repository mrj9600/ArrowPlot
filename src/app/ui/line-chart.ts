import {
  afterNextRender,
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  ElementRef,
  inject,
  input,
  signal,
} from '@angular/core';

export interface ChartPoint {
  /** ISO date. */
  date: string;
  value: number;
  /** Tooltip title. */
  title: string;
  detail?: string;
}

const H = 190;
const PAD = { l: 40, r: 12, t: 12, b: 26 };

/** Single-series line chart over time with a hover/tap tooltip. */
@Component({
  selector: 'app-line-chart',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (points().length < 2) {
      <p class="muted small" style="margin:0">
        Not enough trainings in this period to draw a trend.
      </p>
    } @else {
      <svg
        [attr.viewBox]="'0 0 ' + w() + ' ' + h"
        [attr.height]="h"
        (pointermove)="hover($event)"
        (pointerdown)="hover($event)"
        (pointerleave)="active.set(-1)"
        role="img"
        [attr.aria-label]="label()"
      >
        @for (t of yTicks(); track t.v) {
          <line
            [attr.x1]="pad.l"
            [attr.x2]="w() - pad.r"
            [attr.y1]="t.y"
            [attr.y2]="t.y"
            class="grid"
          />
          <text
            [attr.x]="pad.l - 6"
            [attr.y]="t.y"
            class="tick"
            text-anchor="end"
            dominant-baseline="central"
          >
            {{ t.text }}
          </text>
        }
        @for (t of xTicks(); track t.x) {
          <text [attr.x]="t.x" [attr.y]="h - 6" class="tick" [attr.text-anchor]="t.anchor">
            {{ t.text }}
          </text>
        }
        <path [attr.d]="path()" class="line" />
        @for (p of xy(); track $index) {
          <circle
            [attr.cx]="p.x"
            [attr.cy]="p.y"
            [attr.r]="$index === active() ? 5 : 3.5"
            class="dot"
          />
        }
        @if (active() >= 0) {
          <line
            [attr.x1]="xy()[active()].x"
            [attr.x2]="xy()[active()].x"
            [attr.y1]="pad.t"
            [attr.y2]="h - pad.b"
            class="cross"
          />
        }
      </svg>
      @if (active() >= 0) {
        <div class="tip" [style.left.px]="tipLeft()">
          <b>{{ points()[active()].title }}</b>
          <span>{{ format()(points()[active()].value) }}{{ unit() }}</span>
          @if (points()[active()].detail) {
            <span class="muted">{{ points()[active()].detail }}</span>
          }
        </div>
      }
    }
  `,
  styles: `
    :host {
      display: block;
      position: relative;
    }
    svg {
      display: block;
      width: 100%;
      touch-action: pan-y;
    }
    .grid {
      stroke: var(--line);
      stroke-width: 1;
    }
    .tick {
      fill: var(--muted);
      font-size: 11px;
      font-family: var(--font);
    }
    .line {
      fill: none;
      stroke: var(--accent);
      stroke-width: 2;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .dot {
      fill: var(--accent);
      stroke: var(--surface);
      stroke-width: 2;
    }
    .cross {
      stroke: var(--muted);
      stroke-width: 1;
      stroke-dasharray: 3 3;
    }
    .tip {
      position: absolute;
      top: 0;
      transform: translateX(-50%);
      pointer-events: none;
      background: var(--surface);
      border: 1px solid var(--line);
      box-shadow: var(--shadow);
      border-radius: 8px;
      padding: 6px 10px;
      font-size: 12.5px;
      display: grid;
      white-space: nowrap;
      z-index: 2;
    }
  `,
})
export class LineChart {
  readonly points = input.required<ChartPoint[]>();
  readonly label = input('');
  readonly unit = input('');
  readonly format = input<(v: number) => string>((v) => v.toFixed(2));

  protected readonly h = H;
  protected readonly pad = PAD;
  protected readonly w = signal(600);
  protected readonly active = signal(-1);
  private readonly el = inject(ElementRef<HTMLElement>);

  constructor() {
    const ro = new ResizeObserver(([e]) =>
      this.w.set(Math.max(260, Math.round(e.contentRect.width))),
    );
    afterNextRender(() => ro.observe(this.el.nativeElement));
    inject(DestroyRef).onDestroy(() => ro.disconnect());
  }

  private readonly range = computed(() => {
    const p = this.points();
    const t = p.map((x) => Date.parse(x.date));
    const v = p.map((x) => x.value);
    let lo = Math.min(...v);
    let hi = Math.max(...v);
    const span = hi - lo || Math.max(1, Math.abs(hi) * 0.1);
    lo -= span * 0.1;
    hi += span * 0.1;
    return { t0: Math.min(...t), t1: Math.max(...t), lo, hi };
  });

  protected readonly xy = computed(() => {
    const { t0, t1, lo, hi } = this.range();
    const iw = this.w() - PAD.l - PAD.r;
    const ih = H - PAD.t - PAD.b;
    return this.points().map((p) => ({
      x: PAD.l + (t1 === t0 ? iw / 2 : ((Date.parse(p.date) - t0) / (t1 - t0)) * iw),
      y: PAD.t + ih - ((p.value - lo) / (hi - lo)) * ih,
    }));
  });

  protected readonly path = computed(() =>
    this.xy()
      .map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(''),
  );

  protected readonly yTicks = computed(() => {
    const { lo, hi } = this.range();
    const ih = H - PAD.t - PAD.b;
    const step = niceStep((hi - lo) / 4);
    const out: { v: number; y: number; text: string }[] = [];
    for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
      out.push({ v, y: PAD.t + ih - ((v - lo) / (hi - lo)) * ih, text: +v.toFixed(2) + '' });
    }
    return out;
  });

  protected readonly xTicks = computed(() => {
    const { t0, t1 } = this.range();
    const iw = this.w() - PAD.l - PAD.r;
    const n = Math.max(2, Math.min(6, Math.floor(iw / 90)));
    const days = (t1 - t0) / 864e5;
    return Array.from({ length: n }, (_, i) => {
      const t = t0 + ((t1 - t0) * i) / (n - 1);
      const d = new Date(t);
      const text =
        days > 300
          ? d.toLocaleDateString('en', { month: 'short', year: '2-digit' })
          : d.toLocaleDateString('en', { day: 'numeric', month: 'short' });
      return {
        x: PAD.l + (iw * i) / (n - 1),
        text,
        anchor: i === 0 ? 'start' : i === n - 1 ? 'end' : 'middle',
      };
    });
  });

  protected readonly tipLeft = computed(() => {
    const p = this.xy()[this.active()];
    return p ? Math.min(Math.max(p.x, 70), this.w() - 70) : 0;
  });

  protected hover(e: PointerEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * this.w();
    let best = -1;
    let bd = Infinity;
    this.xy().forEach((p, i) => {
      const d = Math.abs(p.x - x);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    this.active.set(best);
  }
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw || 1)));
  const m = raw / p;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * p;
}
