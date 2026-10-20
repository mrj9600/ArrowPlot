import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  input,
  viewChild,
} from '@angular/core';
import { getTarget, shotColor, TargetModel, toFaceCoords, Zone } from '../core/targets';

export interface FaceShot {
  x: number;
  y: number;
  index: number;
  ring: number;
  faded?: boolean;
  selected?: boolean;
  label?: string;
  /** Dot colour, when it does not follow the drawn face's zones. */
  color?: string;
}

/** Group overlay in face units (spot-relative). */
export interface GroupOverlay {
  mx: number;
  my: number;
  sx: number;
  sy: number;
  a: number;
  b: number;
  ang: number;
  r50?: number;
}

interface DrawZone {
  z: Zone;
  i: number;
}

@Component({
  selector: 'app-target-face',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg
      #svg
      [attr.viewBox]="viewBox()"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      [attr.aria-label]="model().name"
    >
      @for (f of faceList(); track $index) {
        <g [attr.transform]="f.transform">
          @for (d of zonesOuterFirst(); track d.i) {
            @if (d.z.kind === 'circle') {
              <circle
                [attr.cx]="d.z.cx"
                [attr.cy]="d.z.cy"
                [attr.r]="d.z.r"
                [attr.fill]="d.z.fill"
                [attr.stroke]="d.z.line ?? 'none'"
                stroke-width="0.005"
              />
            } @else {
              <ellipse
                [attr.cx]="d.z.cx"
                [attr.cy]="d.z.cy"
                [attr.rx]="d.z.rx"
                [attr.ry]="d.z.ry"
                [attr.fill]="d.z.fill"
                [attr.stroke]="d.z.line ?? 'none'"
                stroke-width="0.008"
              />
            }
          }
          @if (model().centerMark; as cm) {
            <path d="M-0.02 0H0.02M0 -0.02V0.02" [attr.stroke]="cm" stroke-width="0.005" />
          }
        </g>
      }
      @if (group(); as g) {
        <g>
          <ellipse
            [attr.cx]="g.mx"
            [attr.cy]="g.my"
            [attr.rx]="max(g.a, 0.004)"
            [attr.ry]="max(g.b, 0.004)"
            [attr.transform]="'rotate(' + (g.ang * 180) / pi + ' ' + g.mx + ' ' + g.my + ')'"
            fill="rgba(160,160,160,.45)"
            stroke="rgba(70,70,70,.55)"
            [attr.stroke-width]="0.004 * k()"
          />
          @if (g.r50) {
            <circle
              [attr.cx]="g.mx"
              [attr.cy]="g.my"
              [attr.r]="g.r50"
              fill="none"
              stroke="#12a35c"
              [attr.stroke-width]="0.006 * k()"
              [attr.stroke-dasharray]="0.025 * k() + ' ' + 0.018 * k()"
            />
          }
        </g>
      }
      @for (s of placed(); track $index) {
        <circle
          [attr.cx]="s.cx"
          [attr.cy]="s.cy"
          [attr.r]="dotR()"
          [attr.fill]="s.fill"
          [attr.fill-opacity]="s.faded ? 0.45 : 1"
          [attr.stroke]="
            s.selected ? '#ff8f00' : s.fill === '#fff' ? 'rgba(0,0,0,.45)' : 'rgba(255,255,255,.55)'
          "
          [attr.stroke-width]="s.selected ? dotR() * 0.45 : dotR() * 0.18"
        />
        @if (s.label) {
          <text
            [attr.x]="s.cx"
            [attr.y]="s.cy"
            [attr.font-size]="dotR() * 1.15"
            text-anchor="middle"
            dominant-baseline="central"
            [attr.fill]="s.fill === '#fff' ? '#111' : '#fff'"
            font-weight="700"
          >
            {{ s.label }}
          </text>
        }
      }
      @if (group(); as g) {
        <g stroke="#12a35c" [attr.stroke-width]="0.008 * k()" fill="none">
          <path [attr.d]="crossPath(g)" />
          <circle [attr.cx]="g.mx" [attr.cy]="g.my" [attr.r]="0.03 * k()" />
        </g>
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      user-select: none;
      -webkit-user-select: none;
    }
    svg {
      display: block;
      width: 100%;
      height: auto;
      overflow: visible;
    }
    text {
      font-family: system-ui, sans-serif;
      pointer-events: none;
    }
  `,
})
export class TargetFace {
  readonly targetId = input(0);
  /** Draws this face instead of the one for targetId (e.g. a distance grid). */
  readonly customModel = input<TargetModel | null>(null);
  readonly scoringStyle = input(0);
  readonly shots = input<FaceShot[]>([]);
  /** Show only this spot of a multi-spot face; null shows the whole face. */
  readonly spot = input<number | null>(null);
  readonly arrowR = input(0.012);
  /** Half-width of the visible area in face units. */
  readonly view = input(1.04);
  /** Centre of the visible area (for zooming in). */
  readonly centerX = input(0);
  readonly centerY = input(0);
  readonly group = input<GroupOverlay | null>(null);
  /** Minimum dot radius so arrows stay visible on big faces. */
  readonly minDot = input(0.018);

  readonly svg = viewChild.required<ElementRef<SVGSVGElement>>('svg');
  protected readonly pi = Math.PI;
  protected readonly max = Math.max;

  protected readonly model = computed<TargetModel>(
    () => this.customModel() ?? getTarget(this.targetId()),
  );
  protected readonly single = computed(
    () => this.spot() !== null || this.model().faces.length === 1,
  );
  protected readonly k = computed(() => this.view() / 1.04);

  protected readonly viewBox = computed(() => {
    const v = this.view();
    return `${this.centerX() - v} ${this.centerY() - v} ${2 * v} ${2 * v}`;
  });

  protected readonly zonesOuterFirst = computed<DrawZone[]>(() => {
    const m = this.model();
    return m.zones
      .map((z, i) => ({ z, i }))
      .filter((d) => !m.hideZone?.(d.i, this.scoringStyle()))
      .reverse();
  });

  protected readonly faceList = computed(() => {
    const m = this.model();
    if (this.single()) return [{ transform: '' }];
    return m.faces.map((f) => ({ transform: `translate(${f.x} ${f.y}) scale(${m.faceRadius})` }));
  });

  protected readonly dotR = computed(() => {
    const scale = this.single() ? 1 : this.model().faceRadius;
    return Math.max(this.arrowR() * scale, this.minDot() * this.k());
  });

  protected readonly placed = computed(() => {
    const m = this.model();
    const single = this.single();
    return this.shots()
      .filter((s) => s.ring !== -2)
      .map((s) => {
        const p = single ? { x: s.x, y: s.y } : toFaceCoords(m, s.index, s.x, s.y);
        return {
          cx: p.x,
          cy: p.y,
          fill: s.color ?? shotColor(m, s.ring),
          faded: s.faded,
          selected: s.selected,
          label: s.label,
        };
      });
  });

  protected crossPath(g: GroupOverlay): string {
    const t = 0.028 * this.k();
    const { mx, my, sx, sy } = g;
    return (
      `M${mx - sx} ${my}H${mx + sx}M${mx - sx} ${my - t}V${my + t}M${mx + sx} ${my - t}V${my + t}` +
      `M${mx} ${my - sy}V${my + sy}M${mx - t} ${my - sy}H${mx + t}M${mx - t} ${my + sy}H${mx + t}`
    );
  }

  /** Converts a screen point to face coordinates of the drawn view. */
  toFace(clientX: number, clientY: number): { x: number; y: number } {
    const el = this.svg().nativeElement;
    const ctm = el.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }

  /** Face units per screen pixel. */
  unitsPerPixel(): number {
    const el = this.svg().nativeElement;
    return (2 * this.view()) / (el.getBoundingClientRect().width || 1);
  }
}
