import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { f1, pct } from '../core/format';
import { aimAdvice, Analysis, offsetText } from '../core/stats';
import { contrastOn, getTarget } from '../core/targets';
import { FaceShot, GroupOverlay, TargetFace } from './target-face';

@Component({
  selector: 'app-analysis',
  imports: [TargetFace],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (a(); as a) {
      @if (a.n === 0) {
        <p class="muted small" style="margin:0">No arrows yet.</p>
      } @else {
        <div class="top">
          <div class="face">
            <app-target-face
              [targetId]="targetId()"
              [scoringStyle]="styleIndex()"
              [shots]="dots()"
              [spot]="0"
              [group]="showGroup() ? overlay() : null"
              [arrowR]="a.positioned[0]?.arrowR ?? 0.012"
              [view]="view()"
              [minDot]="0.014"
            />
            <div class="seg" style="margin-top:8px">
              <button type="button" [class.on]="!centred()" (click)="centred.set(false)">
                As shot
              </button>
              <button
                type="button"
                [class.on]="centred()"
                (click)="centred.set(true)"
                [disabled]="a.noPos"
              >
                Centred
              </button>
              <button type="button" [class.on]="zoomed()" (click)="zoomed.set(!zoomed())">
                Zoom
              </button>
            </div>
          </div>
          <div class="nums">
            <div class="stat">
              <div class="k">Score</div>
              <div class="v">
                {{ a.reached }}<small class="muted"> / {{ a.total }}</small>
              </div>
              <div class="h">{{ pct(a.reached, a.total) }} · {{ a.n }} arrows</div>
            </div>
            <div class="stat">
              <div class="k">Average per arrow</div>
              <div class="v">{{ a.avg.toFixed(2) }}</div>
              <div class="h">{{ a.nPos }} of {{ a.n }} with position</div>
            </div>
            @if (!a.noPos) {
              <div class="stat">
                <div class="k">Group size (R50)</div>
                <div class="v">{{ f1(a.r50) }} cm</div>
                <div class="h">half the arrows within this of the centre</div>
              </div>
              <div class="stat">
                <div class="k">If centred</div>
                <div class="v" [style.color]="a.centred > a.reached ? 'var(--good)' : null">
                  {{ a.centred - a.reached >= 0 ? '+' : '' }}{{ a.centred - a.reached }}
                </div>
                <div class="h">
                  {{ a.reached }} → {{ a.centred }} ({{ pct(a.centred, a.total) }})
                </div>
              </div>
            }
          </div>
        </div>
        @if (a.noPos) {
          <p class="notice small">
            These arrows were entered as scores only, so there is no group to show. Plot arrows on
            the face (or add MantisX positions) to see group centre and size.
          </p>
        } @else {
          <div class="stats-grid">
            <div class="stat">
              <div class="k">Sideways</div>
              <div class="v sm">{{ offsetText(a.mx, 'right', 'left') }}</div>
            </div>
            <div class="stat">
              <div class="k">Up / down</div>
              <div class="v sm">{{ offsetText(a.my, 'low', 'high') }}</div>
            </div>
            <div class="stat">
              <div class="k">R90</div>
              <div class="v sm">{{ f1(a.r90) }} cm</div>
              <div class="h">9 in 10 arrows</div>
            </div>
            <div class="stat">
              <div class="k">Mean radius</div>
              <div class="v sm">{{ f1(a.meanRadius) }} cm</div>
            </div>
            <div class="stat">
              <div class="k">Spread (1 SD)</div>
              <div class="v sm">{{ f1(a.sx) }} × {{ f1(a.sy) }} cm</div>
              <div class="h">sideways × up/down</div>
            </div>
            <div class="stat">
              <div class="k">Widest pair</div>
              <div class="v sm">{{ f1(a.extremeSpread) }} cm</div>
            </div>
            @if (r50at18(); as v) {
              <div class="stat">
                <div class="k">R50 at 18 m</div>
                <div class="v sm">{{ f1(v) }} cm</div>
                <div class="h">scaled from {{ a.distanceM }} m</div>
              </div>
            }
          </div>
          <p class="small" style="margin:0">{{ advice() }}</p>
        }
        <div class="scroll-x">
          <table class="tbl rings">
            <thead>
              <tr>
                <th>Ring</th>
                @for (r of a.rings; track r.label) {
                  <th>
                    <span
                      class="ring sm"
                      [style.background]="fill(r.label)"
                      [style.color]="ink(r.label)"
                      >{{ r.label }}</span
                    >
                  </th>
                }
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Arrows</td>
                @for (r of a.rings; track r.label) {
                  <td>{{ r.count }}</td>
                }
              </tr>
              <tr>
                <td class="muted">%</td>
                @for (r of a.rings; track r.label) {
                  <td class="muted">{{ ((100 * r.count) / a.n).toFixed(0) }}</td>
                }
              </tr>
            </tbody>
          </table>
        </div>
        <div class="scroll-x">
          <table class="tbl">
            <thead>
              <tr>
                <th>Best arrows</th>
                @for (b of a.best; track b.p) {
                  <th>{{ b.p * 100 }}%</th>
                }
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Avg / arrow</td>
                @for (b of a.best; track b.p) {
                  <td>
                    <b>{{ b.avg.toFixed(2) }}</b>
                  </td>
                }
              </tr>
            </tbody>
          </table>
        </div>
        @if (a.mixedSize) {
          <p class="notice warn small">
            These rounds use different face sizes; the drawing uses the first one, sizes are in cm
            on the face.
          </p>
        }
      }
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 12px;
    }
    .top {
      display: grid;
      grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
      gap: 14px;
      align-items: start;
    }
    @media (max-width: 520px) {
      .top {
        grid-template-columns: 1fr;
      }
    }
    .face {
      display: grid;
      justify-items: center;
    }
    .face app-target-face {
      width: 100%;
      max-width: 360px;
    }
    .nums {
      display: grid;
      gap: 8px;
    }
    .v.sm {
      font-size: 16px;
    }
    .rings .ring {
      margin: 0 auto;
    }
  `,
})
export class AnalysisView {
  readonly a = input.required<Analysis | null>();
  readonly sighted = input(false);

  protected readonly centred = signal(false);
  protected readonly zoomed = signal(false);
  protected readonly f1 = f1;
  protected readonly pct = pct;
  protected readonly offsetText = offsetText;

  protected readonly targetId = computed(() =>
    this.a()?.all[0] ? getTarget(this.a()!.all[0].targetId).singleSpotId : 0,
  );
  protected readonly styleIndex = computed(() => this.a()?.all[0]?.style ?? 0);
  protected readonly showGroup = computed(() => !!this.a() && !this.a()!.noPos);

  protected readonly view = computed(() => {
    const a = this.a();
    if (!this.zoomed() || !a || !a.positioned.length) return 1.04;
    const ext = Math.max(...a.positioned.map((s) => Math.hypot(s.x, s.y))) + 0.08;
    return Math.min(1.04, Math.max(0.25, ext));
  });

  protected readonly overlay = computed<GroupOverlay | null>(() => {
    const a = this.a();
    if (!a || a.noPos) return null;
    const R = a.rref;
    const c = this.centred();
    return {
      mx: c ? 0 : a.mx / R,
      my: c ? 0 : a.my / R,
      sx: a.sx / R,
      sy: a.sy / R,
      a: a.ellipse.a / R,
      b: a.ellipse.b / R,
      ang: a.ellipse.ang,
      r50: c ? a.r50 / R : undefined,
    };
  });

  protected readonly dots = computed<FaceShot[]>(() => {
    const a = this.a();
    if (!a) return [];
    const R = a.rref;
    const c = this.centred();
    return a.positioned.map((s) => ({
      x: c ? (s.x * s.rcm - a.mx) / R : (s.x * s.rcm) / R,
      y: c ? (s.y * s.rcm - a.my) / R : (s.y * s.rcm) / R,
      index: s.index,
      ring: s.ring,
    }));
  });

  protected readonly advice = computed(() =>
    this.a() ? aimAdvice(this.a()!, this.sighted()) : '',
  );
  protected readonly r50at18 = computed(() => {
    const a = this.a();
    return a && a.distanceM && Math.abs(a.distanceM - 18) > 0.5 ? (a.r50 * 18) / a.distanceM : null;
  });

  protected fill(label: string) {
    const a = this.a()!;
    const s = a.all.find((x) => x.label === label);
    if (!s || s.ring < 0) return '#9aa3ab';
    return getTarget(s.targetId).zones[s.ring]?.fill ?? '#9aa3ab';
  }
  protected ink(label: string) {
    return contrastOn(this.fill(label));
  }
}
