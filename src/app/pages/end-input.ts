import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { db } from '../core/db';
import { formatDimension } from '../core/dimension';
import { Arrow, End, NOT_ENTERED, Round, Shot, Session } from '../core/models';
import { endLimit, targetNumber, usesTargetNumbers } from '../core/numbering';
import { nowTime, Repo } from '../core/repo.service';
import {
  contrastOn,
  faceLabel,
  firstHitEndComplete,
  getTarget,
  isFirstHitStyle,
  pointsFor,
  relativeArrowRadius,
  scoreEnd,
  selectableZones,
  spotOf,
  zoneAt,
  zoneLabel,
} from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { FaceShot, TargetFace } from '../ui/target-face';

/** Half-width of the visible face when not zoomed (face radius 1 plus a small margin). */
const BASE_VIEW = 1.04;
/** On touch the arrow is drawn this far above the fingertip so the finger doesn't hide it. */
const TOUCH_OFFSET_PX = 56;
/**
 * A fingertip rolls as it lifts, so the last few touch positions drift away from where the arrow
 * was held. Movement this small within this time before lifting is treated as that slip.
 */
const SLIP_MS = 120;
const SLIP_PX = 12;
/** While zoomed, the face scrolls when the arrow is within this many pixels of an edge … */
const EDGE_PX = 56;
/** … at up to this many visible-view widths per second (at the very edge). */
const PAN_SPEED = 1.1;

/** An arrow position while placing: face coordinates, ring, and where to show the label. */
interface Placed {
  x: number;
  y: number;
  ring: number;
  px: number;
  py: number;
  label: string;
}

@Component({
  selector: 'app-end-input',
  imports: [AppBar, Icon, TargetFace],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar
      [title]="title()"
      [subtitle]="subtitle()"
      [back]="round() ? '/session/' + round()!.sessionId : '/'"
    >
      <button
        class="icon-btn"
        type="button"
        (click)="toggleMode()"
        [attr.aria-label]="
          mode() === 'plot' ? 'Enter scores with buttons' : 'Plot arrows on the face'
        "
      >
        <app-icon [name]="mode() === 'plot' ? 'keyboard' : 'target'" />
      </button>
    </app-bar>
    @if (round(); as r) {
      <div class="screen">
        <div class="slots">
          @for (s of shots(); track $index) {
            <button
              type="button"
              class="ring"
              [class.empty]="s.ring === -2"
              [class.not-shot]="$index >= notShotFrom()"
              [disabled]="$index >= notShotFrom()"
              [class.cur]="$index === current()"
              [style.background]="s.ring === -2 ? null : fillOf(s.ring)"
              [style.color]="s.ring === -2 ? null : inkOf(s.ring)"
              (click)="current.set($index)"
              [attr.aria-label]="'Arrow ' + ($index + 1)"
            >
              {{ $index >= notShotFrom() ? '–' : s.ring === -2 ? '' : label(s) }}
              @if (s.arrowNumber) {
                <sub>{{ s.arrowNumber }}</sub>
              }
            </button>
          }
          <div class="spacer"></div>
          <div class="tot num">
            <b>{{ endScore().reached }}</b
            ><span class="muted"> / {{ runningTotal() }}</span>
          </div>
        </div>

        @if (mode() === 'plot') {
          <div
            class="target-wrap"
            (pointerdown)="down($event)"
            (pointermove)="move($event)"
            (pointerup)="up($event)"
            (pointercancel)="cancel()"
          >
            <div class="clip">
              <app-target-face
                #face
                [targetId]="r.targetId"
                [scoringStyle]="r.scoringStyle"
                [shots]="faceShots()"
                [spot]="spotView()"
                [arrowR]="arrowR()"
                [view]="view()"
                [centerX]="zoomCenter()?.x ?? 0"
                [centerY]="zoomCenter()?.y ?? 0"
                [minDot]="0.02"
              />
            </div>
            @if (placing(); as p) {
              <div class="bubble" [style.left.px]="p.px" [style.top.px]="p.py">{{ p.label }}</div>
            }
            @if (spotCount() > 1) {
              <div class="spot-tag">Spot {{ spotView()! + 1 }} / {{ spotCount() }}</div>
            }
          </div>
        } @else {
          <div class="keys">
            @for (z of zones(); track z.ring) {
              <button
                type="button"
                class="key"
                [style.background]="z.fill"
                [style.color]="ink(z.fill)"
                (click)="key(z.ring)"
              >
                {{ z.label }}
                @if (z.name) {
                  <small>{{ z.name }}</small>
                }
              </button>
            }
          </div>
        }

        @if (session()?.arrowNumbering && shots()[current()]?.ring !== -2) {
          <div class="numbers">
            <div class="row">
              <span class="small muted" style="flex:1"
                >Arrow no. for arrow {{ current() + 1 }}:</span
              >
              <button class="btn sm ghost" type="button" (click)="stopNumbering()">
                Stop numbering
              </button>
            </div>
            <div class="chips">
              @for (n of arrowNumbers(); track n) {
                <button
                  type="button"
                  class="chip"
                  [class.on]="shots()[current()].arrowNumber === n"
                  (click)="setNumber(n)"
                >
                  {{ n }}
                </button>
              }
            </div>
          </div>
        }

        <div class="bar">
          <button class="btn" type="button" (click)="undo()" [disabled]="!anyEntered()">
            <app-icon name="undo" /> Undo
          </button>
          <button class="btn ghost" type="button" (click)="note()">
            {{ comment() ? 'Edit note' : 'Note' }}
          </button>
          <div class="spacer"></div>
          <button
            class="btn primary"
            type="button"
            (click)="save()"
            [disabled]="!complete() || saving()"
          >
            <app-icon name="check" /> {{ isLast() ? 'Finish' : 'Next end' }}
          </button>
        </div>
        @if (canWrap()) {
          <button class="btn sm wrap" type="button" (click)="wrapHere()">
            Last target of the course: continue at 1
          </button>
        }
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .screen {
      max-width: 640px;
      margin: 0 auto;
      padding: 10px 10px calc(10px + var(--safe-bottom));
      display: grid;
      gap: 10px;
    }
    .slots {
      display: flex;
      gap: 6px;
      align-items: center;
      flex-wrap: wrap;
    }
    .slots .ring {
      width: 38px;
      height: 38px;
      font-size: 14px;
      cursor: pointer;
      position: relative;
    }
    .slots .ring.not-shot {
      opacity: 0.35;
      cursor: default;
    }
    .slots .ring.cur {
      outline: 3px solid var(--gold);
      outline-offset: 2px;
    }
    .slots sub {
      position: absolute;
      bottom: -6px;
      right: -4px;
      font-size: 10px;
      background: var(--surface);
      color: var(--fg);
      border-radius: 6px;
      padding: 0 3px;
    }
    .tot {
      font-size: 18px;
    }
    .target-wrap {
      position: relative;
      /* Dragging on the face places the arrow; it must not scroll or zoom the page. */
      touch-action: none;
      width: min(100%, calc(100dvh - 250px - var(--safe-top) - var(--safe-bottom)));
      margin: 0 auto;
      min-width: 260px;
    }
    .bubble {
      position: absolute;
      transform: translate(-50%, -150%);
      pointer-events: none;
      background: var(--bar);
      color: #fff;
      font-weight: 700;
      padding: 3px 10px;
      border-radius: 8px;
      font-size: 16px;
    }
    .spot-tag {
      position: absolute;
      left: 4px;
      top: 4px;
      font-size: 12px;
      font-weight: 600;
      background: var(--surface);
      padding: 2px 8px;
      border-radius: 6px;
      box-shadow: var(--shadow);
    }
    .clip {
      overflow: hidden;
      border-radius: 12px;
    }
    .keys {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(64px, 1fr));
      gap: 8px;
    }
    .key small {
      display: block;
      font: 600 10.5px/1.15 var(--font);
      margin-top: 2px;
    }
    .key {
      height: 64px;
      border-radius: 14px;
      border: 1px solid rgba(0, 0, 0, 0.2);
      font: 700 22px var(--font);
      cursor: pointer;
    }
    .bar {
      display: flex;
      gap: 8px;
      align-items: center;
    }
    .wrap {
      justify-self: end;
    }
    .numbers {
      display: grid;
      gap: 6px;
    }
  `,
})
export class EndInputPage {
  readonly id = input.required<string>();
  readonly end = input.required<string>();

  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  private readonly face = viewChild<TargetFace>('face');

  protected readonly round = signal<Round | null>(null);
  protected readonly session = signal<Session | null>(null);
  private readonly arrow = signal<Arrow | null>(null);
  private readonly otherEnds = signal<End[]>([]);
  private existing: End | null = null;

  protected readonly shots = signal<Shot[]>([]);
  private readonly positioned = signal<boolean[]>([]);
  protected readonly current = signal(0);
  protected readonly mode = signal<'plot' | 'keys'>('plot');
  /** How much the face zooms in while an arrow is being placed (1 = no zoom). */
  protected readonly zoomFactor = signal(3);
  /** Centre of the zoomed view while placing, or null when showing the whole face. */
  protected readonly zoomCenter = signal<{ x: number; y: number } | null>(null);
  protected readonly view = computed(() =>
    this.zoomCenter() ? BASE_VIEW / this.zoomFactor() : BASE_VIEW,
  );
  protected readonly comment = signal('');
  protected readonly saving = signal(false);
  protected readonly placing = signal<Placed | null>(null);
  private pointerId: number | null = null;
  /** Recent arrow positions while dragging: time, screen point and placement. */
  private trail: { t: number; sx: number; sy: number; p: Placed }[] = [];
  /** The element receiving the pointer, the finger's screen position, and edge-scroll state. */
  private wrap: HTMLElement | null = null;
  private finger: { x: number; y: number } | null = null;
  private panFrame = 0;
  private panAt = 0;
  private lastPan = -Infinity;
  private offset = 0;

  protected readonly model = computed(() => getTarget(this.round()?.targetId ?? 0));
  protected readonly spotCount = computed(() => this.model().faces.length);
  protected readonly spotView = computed(() =>
    this.spotCount() > 1 ? spotOf(this.model(), this.current()) : null,
  );
  protected readonly arrowR = computed(() => {
    const r = this.round();
    return r
      ? relativeArrowRadius(this.model(), r.targetDiameter, this.arrow()?.diameter ?? null)
      : 0.012;
  });
  protected readonly zones = computed(() =>
    selectableZones(this.model(), this.round()?.scoringStyle ?? 0, this.current()),
  );
  protected readonly endIndex = computed(() => +this.end());
  protected readonly isLast = computed(() => {
    const r = this.round();
    const limit = r ? endLimit(r) : null;
    return !!limit && this.endIndex() + 1 >= limit;
  });
  /** 3D and field rounds are numbered by target (post), from where the round started. */
  protected readonly numbered = computed(() => !!this.round() && usesTargetNumbers(this.round()!));
  protected readonly targetNo = computed(() =>
    this.round() ? targetNumber(this.round()!, this.endIndex()) : 0,
  );
  protected readonly title = computed(() => {
    const r = this.round();
    const k = this.endIndex() + 1;
    const n = r ? endLimit(r) : null;
    if (this.numbered()) {
      return `Target ${this.targetNo()} (${n ? `${k} of ${n}` : k})`;
    }
    return `End ${n ? `${k} / ${n}` : k}`;
  });
  /** Open-ended course rounds that started past target 1 need to be told where the course ends. */
  protected readonly canWrap = computed(() => {
    const r = this.round();
    return !!r && this.numbered() && !r.maxEndCount && !r.wrapAt && (r.startTarget || 1) > 1;
  });
  protected readonly subtitle = computed(() => {
    const r = this.round();
    if (!r) return '';
    return [
      `Round ${r.index + 1}`,
      formatDimension(r.distance),
      faceLabel(r.targetId, r.targetDiameter),
    ]
      .filter(Boolean)
      .join(' · ');
  });
  protected readonly endScore = computed(() => {
    const r = this.round();
    return r ? scoreEnd(this.model(), r.scoringStyle, this.shots()) : { reached: 0, total: 0 };
  });
  protected readonly runningTotal = computed(() => {
    const r = this.round();
    if (!r) return 0;
    const before = this.otherEnds()
      .filter((e) => e.index !== this.endIndex())
      .reduce((a, e) => a + scoreEnd(this.model(), r.scoringStyle, e.shots).reached, 0);
    return before + this.endScore().reached;
  });
  /** Animal rounds: shooting stops at the first arrow that hits, and only that one scores. */
  protected readonly firstHit = computed(() =>
    isFirstHitStyle(this.model(), this.round()?.scoringStyle ?? 0),
  );
  /** First-hit ends: arrows after the scoring one are not shot. */
  protected readonly notShotFrom = computed(() => {
    if (!this.firstHit()) return Infinity;
    const style = this.round()?.scoringStyle ?? 0;
    const hit = this.shots().findIndex(
      (s) => s.ring !== NOT_ENTERED && pointsFor(this.model(), style, s.ring, s.index) > 0,
    );
    return hit < 0 ? Infinity : hit + 1;
  });
  protected readonly complete = computed(() =>
    this.firstHit()
      ? firstHitEndComplete(this.model(), this.round()?.scoringStyle ?? 0, this.shots())
      : this.shots().length > 0 && this.shots().every((s) => s.ring !== NOT_ENTERED),
  );
  protected readonly anyEntered = computed(() => this.shots().some((s) => s.ring !== NOT_ENTERED));
  /** The numbers chosen for this session, or 1 … N for the arrow set (at least 13). */
  protected readonly arrowNumbers = computed(
    () =>
      this.session()?.arrowNumbers ??
      Array.from({ length: Math.max(13, this.arrow()?.maxArrowNumber ?? 0) }, (_, i) =>
        String(i + 1),
      ),
  );

  protected readonly faceShots = computed<FaceShot[]>(() => {
    const m = this.model();
    const spot = this.spotView();
    const inSpot = (i: number) => spot === null || spotOf(m, i) === spot;
    const out: FaceShot[] = [];
    for (const e of this.otherEnds()) {
      if (e.index === this.endIndex() || !e.exact) continue;
      for (const s of e.shots)
        if (s.ring !== NOT_ENTERED && inSpot(s.index)) out.push({ ...s, faded: true });
    }
    this.shots().forEach((s, i) => {
      if (s.ring !== NOT_ENTERED && this.positioned()[i] && inSpot(i)) {
        out.push({ ...s, selected: i === this.current(), label: String(i + 1) });
      }
    });
    const p = this.placing();
    if (p)
      out.push({
        x: p.x,
        y: p.y,
        index: this.current(),
        ring: p.ring,
        selected: true,
        label: String(this.current() + 1),
      });
    return out;
  });

  constructor() {
    effect(() => {
      this.load(+this.id(), +this.end());
    });
  }

  private async load(roundId: number, endIndex: number) {
    const round = await db.rounds.get(roundId);
    if (!round) return;
    const session = (await db.sessions.get(round.sessionId)) ?? null;
    const arrow = session?.arrowId ? ((await db.arrows.get(session.arrowId)) ?? null) : null;
    const ends = await this.repo.endsOf(roundId);
    this.existing = ends.find((e) => e.index === endIndex) ?? null;
    const n = round.shotsPerEnd;
    const shots: Shot[] = Array.from(
      { length: n },
      (_, i) => this.existing?.shots[i] ?? { index: i, x: 0, y: 0, ring: NOT_ENTERED },
    );
    this.round.set(round);
    this.session.set(session);
    this.arrow.set(arrow);
    this.otherEnds.set(ends);
    this.shots.set(shots.map((s, i) => ({ ...s, index: i })));
    this.positioned.set(shots.map((s) => s.ring !== NOT_ENTERED && !!this.existing?.exact));
    this.comment.set(this.existing?.comment ?? '');
    const first = shots.findIndex((s) => s.ring === NOT_ENTERED);
    this.current.set(first < 0 ? 0 : first);
    const pref = await this.repo.getSetting<'plot' | 'keys'>('inputMode', 'plot');
    this.mode.set(
      this.existing &&
        !this.existing.exact &&
        this.existing.shots.some((s) => s.ring !== NOT_ENTERED)
        ? 'keys'
        : pref,
    );
    this.zoomFactor.set(await this.repo.getSetting('inputZoom', 3));
  }

  protected label(s: Shot) {
    return zoneLabel(this.model(), this.round()?.scoringStyle ?? 0, s.ring, s.index);
  }
  protected fillOf(ring: number) {
    const m = this.model();
    return ring >= 0 && ring < m.zones.length ? m.zones[ring].fill : '#9aa3ab';
  }
  protected inkOf(ring: number) {
    return contrastOn(this.fillOf(ring));
  }
  protected ink(fill: string) {
    return contrastOn(fill);
  }

  protected toggleMode() {
    const m = this.mode() === 'plot' ? 'keys' : 'plot';
    this.mode.set(m);
    this.repo.setSetting('inputMode', m);
  }

  // ----- plotting -----

  /**
   * Face coordinates of a screen point for a given view. Computed from the face's on-screen box
   * rather than the rendered SVG, so it is right even before a zoom change has been drawn.
   */
  private screenToFace(sx: number, sy: number, view: number, c: { x: number; y: number }) {
    const box = this.face()!.svg().nativeElement.getBoundingClientRect();
    const u = (2 * view) / box.width;
    return {
      x: c.x + (sx - (box.left + box.width / 2)) * u,
      y: c.y + (sy - (box.top + box.height / 2)) * u,
    };
  }

  private pointAt(e: PointerEvent): Placed | null {
    return this.placeAt(e.clientX, e.clientY);
  }

  /** The arrow position for a finger at this screen point (the arrow sits `offset` above it). */
  private placeAt(clientX: number, clientY: number): Placed | null {
    if (!this.face() || !this.wrap) return null;
    const p = this.screenToFace(
      clientX,
      clientY - this.offset,
      this.view(),
      this.zoomCenter() ?? { x: 0, y: 0 },
    );
    const ring = zoneAt(this.model(), p.x, p.y, this.arrowR());
    const host = this.wrap.getBoundingClientRect();
    return {
      x: p.x,
      y: p.y,
      ring,
      px: clientX - host.left,
      py: clientY - host.top - this.offset,
      label: zoneLabel(this.model(), this.round()!.scoringStyle, ring, this.current()),
    };
  }

  protected down(e: PointerEvent) {
    if (this.pointerId !== null || (e.target as HTMLElement).closest('button')) return;
    this.pointerId = e.pointerId;
    this.wrap = e.currentTarget as HTMLElement;
    this.lastPan = -Infinity;
    this.offset = e.pointerType === 'touch' ? TOUCH_OFFSET_PX : 0;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    const z = this.zoomFactor();
    if (this.face() && z > 1) {
      // Zoom in around the pressed point, so the spot under the finger stays put on screen.
      const sx = e.clientX;
      const sy = e.clientY - this.offset;
      const f = this.screenToFace(sx, sy, BASE_VIEW, { x: 0, y: 0 });
      const box = this.face()!.svg().nativeElement.getBoundingClientRect();
      const u = (2 * BASE_VIEW) / z / box.width;
      this.zoomCenter.set({
        x: f.x - (sx - (box.left + box.width / 2)) * u,
        y: f.y - (sy - (box.top + box.height / 2)) * u,
      });
    }
    this.trail = [];
    this.track(e);
    e.preventDefault();
  }
  protected move(e: PointerEvent) {
    if (e.pointerId !== this.pointerId) return;
    this.track(e);
  }
  protected up(e: PointerEvent) {
    if (e.pointerId !== this.pointerId) return;
    const p = this.settled(e);
    this.pointerId = null;
    this.placing.set(null);
    this.zoomCenter.set(null);
    this.stopPan();
    this.trail = [];
    if (!p) return;
    // Points far outside the face count as a miss but keep their position.
    this.setShot({ x: p.x, y: p.y, ring: p.ring }, true);
  }
  protected cancel() {
    this.pointerId = null;
    this.placing.set(null);
    this.zoomCenter.set(null);
    this.stopPan();
    this.trail = [];
  }

  private track(e: PointerEvent) {
    this.finger = { x: e.clientX, y: e.clientY };
    this.record(e.timeStamp);
    if (this.zoomCenter() && !this.panFrame && this.panDirection().some((d) => d !== 0)) {
      this.panAt = performance.now();
      this.panFrame = requestAnimationFrame((t) => this.pan(t));
    }
  }

  private record(t: number) {
    if (!this.finger) return;
    const p = this.placeAt(this.finger.x, this.finger.y);
    this.placing.set(p);
    if (!p) return;
    this.trail.push({ t, sx: this.finger.x, sy: this.finger.y, p });
    if (this.trail.length > 30) this.trail.shift();
  }

  /** -1..1 per axis: how deep the arrow is in the edge zone of the visible face, and which side. */
  private panDirection(): [number, number] {
    if (!this.finger || !this.face()) return [0, 0];
    const box = this.face()!.svg().nativeElement.getBoundingClientRect();
    const ax = this.finger.x;
    const ay = this.finger.y - this.offset;
    const depth = (d: number) => Math.max(0, Math.min(1, 1 - d / EDGE_PX));
    return [
      depth(box.right - ax) - depth(ax - box.left),
      depth(box.bottom - ay) - depth(ay - box.top),
    ];
  }

  /** Scrolls the zoomed face towards the edge the arrow is near; the arrow moves along with it. */
  private pan(now: number) {
    this.panFrame = 0;
    const c = this.zoomCenter();
    const [dx, dy] = this.panDirection();
    if (this.pointerId === null || !c || (dx === 0 && dy === 0)) return;
    const dt = Math.min(0.05, (now - this.panAt) / 1000);
    this.panAt = now;
    const step = 2 * this.view() * PAN_SPEED * dt;
    // Never scroll past the edge of the whole face.
    const lim = Math.max(0, BASE_VIEW - this.view());
    const clamp = (v: number) => Math.max(-lim, Math.min(lim, v));
    const next = { x: clamp(c.x + dx * step), y: clamp(c.y + dy * step) };
    if (next.x !== c.x || next.y !== c.y) {
      this.zoomCenter.set(next);
      this.lastPan = now;
      this.record(now);
    }
    this.panFrame = requestAnimationFrame((t) => this.pan(t));
  }

  private stopPan() {
    if (this.panFrame) cancelAnimationFrame(this.panFrame);
    this.panFrame = 0;
    this.finger = null;
  }

  /**
   * Where the arrow was before the finger started lifting: the last position held at least
   * SLIP_MS before release, if the finger moved only a little since (lift-off slip). A real move
   * at the end keeps the latest position.
   */
  private settled(e: PointerEvent): Placed | null {
    const last = this.trail.at(-1)?.p ?? this.pointAt(e);
    const cutoff = e.timeStamp - SLIP_MS;
    // While the face was scrolling the arrow moved without the finger: keep where it got to.
    if (this.lastPan > cutoff) return last;
    const held = [...this.trail].reverse().find((s) => s.t <= cutoff);
    if (!held) return last;
    const slip = Math.hypot(e.clientX - held.sx, e.clientY - held.sy);
    return slip <= SLIP_PX ? held.p : last;
  }

  // ----- keypad -----

  protected key(ring: number) {
    this.setShot({ x: 0, y: 0, ring }, false);
  }

  private setShot(p: { x: number; y: number; ring: number }, positioned: boolean) {
    const i = this.current();
    this.shots.update((l) => l.map((s, j) => (j === i ? { ...s, ...p } : s)));
    this.positioned.update((l) => l.map((v, j) => (j === i ? positioned : v)));
    if (navigator.vibrate) navigator.vibrate(8);
    if (this.firstHit() && pointsFor(this.model(), this.round()!.scoringStyle, p.ring, i) > 0) {
      // A hit ends a first-hit end: later arrows are not shot.
      this.shots.update((l) =>
        l.map((s, j) => (j > i ? { index: j, x: 0, y: 0, ring: NOT_ENTERED } : s)),
      );
      this.positioned.update((l) => l.map((v, j) => (j > i ? false : v)));
      return;
    }
    if (this.session()?.arrowNumbering) return; // stay so a number can be picked
    this.advance();
  }

  private advance() {
    const next = this.shots().findIndex((s, j) => j > this.current() && s.ring === NOT_ENTERED);
    const any = this.shots().findIndex((s) => s.ring === NOT_ENTERED);
    if (next >= 0) this.current.set(next);
    else if (any >= 0) this.current.set(any);
  }

  /** Turns arrow numbering off for the rest of this session. */
  protected async stopNumbering() {
    const t = this.session();
    if (!t) return;
    await db.sessions.update(t.id!, { arrowNumbering: false });
    this.session.set({ ...t, arrowNumbering: false });
    if (this.shots()[this.current()].ring !== NOT_ENTERED) this.advance();
  }

  protected setNumber(n: string) {
    const i = this.current();
    this.shots.update((l) => l.map((s, j) => (j === i ? { ...s, arrowNumber: n } : s)));
    this.advance();
  }

  protected undo() {
    const i = this.current();
    const target =
      this.shots()[i].ring !== NOT_ENTERED
        ? i
        : [...this.shots().keys()].reverse().find((j) => this.shots()[j].ring !== NOT_ENTERED);
    if (target === undefined) return;
    this.shots.update((l) =>
      l.map((s, j) => (j === target ? { index: j, x: 0, y: 0, ring: NOT_ENTERED } : s)),
    );
    this.positioned.update((l) => l.map((v, j) => (j === target ? false : v)));
    this.current.set(target);
  }

  /** Marks this target as the course's last one: numbering continues at 1 after it. */
  protected async wrapHere() {
    const r = this.round();
    if (!r) return;
    const wrapAt = this.targetNo();
    await db.rounds.update(r.id!, { wrapAt });
    this.round.set({ ...r, wrapAt });
  }

  protected note() {
    const v = prompt('Note for this end', this.comment());
    if (v !== null) this.comment.set(v.trim());
  }

  protected async save() {
    const r = this.round();
    if (!r || !this.complete() || this.saving()) return;
    this.saving.set(true);
    try {
      const end: End = {
        ...(this.existing ?? {}),
        roundId: r.id!,
        index: this.endIndex(),
        exact: this.positioned().every(Boolean),
        saveTime: this.existing?.saveTime ?? nowTime(),
        comment: this.comment(),
        shots: this.shots(),
      };
      await this.repo.saveEnd(end);
      const ends = await this.repo.endsOf(r.id!);
      if (this.isLast() || this.existing) {
        this.router.navigate(['/round', r.id], { replaceUrl: true });
      } else {
        this.router.navigate(['/round', r.id, 'end', ends.length], { replaceUrl: true });
      }
    } finally {
      this.saving.set(false);
    }
  }
}
