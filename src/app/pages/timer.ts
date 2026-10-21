import {
  ChangeDetectionStrategy,
  Component,
  computed,
  DestroyRef,
  inject,
  signal,
} from '@angular/core';
import { Repo } from '../core/repo.service';
import { NumberInput } from '../ui/number-input';
import { AppBar } from '../ui/app-bar';

type Phase = 'idle' | 'walkup' | 'shoot' | 'done';

interface TimerSettings {
  walkup: number;
  shoot: number;
  warn: number;
}

/** WA-style shooting timer: walk-up (red), shooting (green), warning (yellow), end. */
@Component({
  selector: 'app-timer',
  imports: [NumberInput, AppBar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Shooting timer" back="/more" />
    <button type="button" class="face" [class]="colour()" (click)="toggle()">
      <span class="label">{{ label() }}</span>
      <span class="time num">{{ display() }}</span>
      <span class="hint">{{
        phase() === 'idle' || phase() === 'done' ? 'Tap to start' : 'Tap to stop'
      }}</span>
    </button>
    <div class="settings">
      <label class="field"
        ><span>Walk-up (s)</span>
        <input
          class="input"
          type="number"
          min="0"
          max="60"
          [appNumber]="s().walkup"
          (appNumberChange)="set('walkup', $event)"
      /></label>
      <label class="field"
        ><span>Shooting (s)</span>
        <input
          class="input"
          type="number"
          min="10"
          max="600"
          [appNumber]="s().shoot"
          (appNumberChange)="set('shoot', $event)"
      /></label>
      <label class="field"
        ><span>Warning (s)</span>
        <input
          class="input"
          type="number"
          min="0"
          max="120"
          [appNumber]="s().warn"
          (appNumberChange)="set('warn', $event)"
      /></label>
    </div>
    <div class="presets">
      <button class="chip" type="button" (click)="preset(3)">3 arrows · 120 s</button>
      <button class="chip" type="button" (click)="preset(6)">6 arrows · 240 s</button>
      <button class="chip" type="button" (click)="preset(1)">Final · 40 s</button>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }
    .face {
      display: grid;
      place-items: center;
      align-content: center;
      gap: 6px;
      width: 100%;
      height: calc(100dvh - 56px - var(--safe-top) - 190px - var(--safe-bottom));
      min-height: 260px;
      border: 0;
      color: #fff;
      cursor: pointer;
      font-family: var(--font);
      transition: background 0.25s;
    }
    .face.idle {
      background: #33424e;
    }
    .face.red {
      background: #c62828;
    }
    .face.green {
      background: #1b8a3d;
    }
    .face.yellow {
      background: #f2b92c;
      color: #1d1d1d;
    }
    .label {
      font-size: 20px;
      font-weight: 600;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .time {
      font-size: min(34vw, 30dvh);
      font-weight: 800;
      line-height: 1;
    }
    .hint {
      opacity: 0.75;
      font-size: 14px;
    }
    .settings {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 10px;
      padding: 12px 12px 0;
      max-width: 640px;
      margin: 0 auto;
    }
    .presets {
      display: flex;
      gap: 8px;
      flex-wrap: wrap;
      justify-content: center;
      padding: 12px 12px calc(12px + var(--safe-bottom));
    }
  `,
})
export class TimerPage {
  private readonly repo = inject(Repo);
  protected readonly s = signal<TimerSettings>({ walkup: 10, shoot: 120, warn: 30 });
  protected readonly phase = signal<Phase>('idle');
  protected readonly left = signal(0);
  private interval: ReturnType<typeof setInterval> | null = null;
  private endsAt = 0;
  private audio: AudioContext | null = null;
  private wakeLock: { release(): Promise<void> } | null = null;

  protected readonly colour = computed(() => {
    const p = this.phase();
    if (p === 'walkup') return 'red';
    if (p === 'shoot') return this.left() <= this.s().warn ? 'yellow' : 'green';
    if (p === 'done') return 'red';
    return 'idle';
  });
  protected readonly label = computed(
    () => ({ idle: 'Ready', walkup: 'Walk up', shoot: 'Shoot', done: 'Stop' })[this.phase()],
  );
  protected readonly display = computed(() =>
    this.phase() === 'idle' ? this.s().shoot : this.left(),
  );

  constructor() {
    this.repo.getSetting<TimerSettings>('timer', this.s()).then((v) => this.s.set(v));
    inject(DestroyRef).onDestroy(() => this.stop());
  }

  protected set(k: keyof TimerSettings, v: number) {
    if (!isFinite(v) || v < 0) return;
    this.s.update((s) => ({ ...s, [k]: Math.round(v) }));
    this.repo.setSetting('timer', this.s());
  }
  protected preset(arrows: number) {
    this.s.update((s) => ({
      ...s,
      shoot: arrows === 1 ? 40 : arrows * 40,
      warn: arrows === 1 ? 10 : 30,
    }));
    this.repo.setSetting('timer', this.s());
  }

  protected toggle() {
    if (this.phase() === 'walkup' || this.phase() === 'shoot') {
      this.beep(3);
      this.stop();
      this.phase.set('done');
      return;
    }
    this.audio ??= new AudioContext();
    this.requestWakeLock();
    if (this.s().walkup > 0) this.start('walkup', this.s().walkup, 2);
    else this.start('shoot', this.s().shoot, 1);
  }

  private start(p: Phase, seconds: number, beeps: number) {
    this.phase.set(p);
    this.left.set(seconds);
    this.endsAt = Date.now() + seconds * 1000;
    this.beep(beeps);
    if (this.interval) clearInterval(this.interval);
    this.interval = setInterval(() => this.tick(), 200);
  }

  private tick() {
    const left = Math.max(0, Math.ceil((this.endsAt - Date.now()) / 1000));
    this.left.set(left);
    if (left > 0) return;
    if (this.phase() === 'walkup') this.start('shoot', this.s().shoot, 1);
    else {
      this.beep(3);
      this.stop();
      this.phase.set('done');
    }
  }

  private stop() {
    if (this.interval) clearInterval(this.interval);
    this.interval = null;
    this.wakeLock?.release().catch(() => undefined);
    this.wakeLock = null;
  }

  private async requestWakeLock() {
    try {
      const wl = (
        navigator as Navigator & {
          wakeLock?: { request(t: 'screen'): Promise<{ release(): Promise<void> }> };
        }
      ).wakeLock;
      this.wakeLock = (await wl?.request('screen')) ?? null;
    } catch {
      /* not supported */
    }
  }

  private beep(n: number) {
    const ctx = this.audio;
    if (!ctx) return;
    for (let i = 0; i < n; i++) {
      const t = ctx.currentTime + i * 0.45;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.frequency.value = 880;
      o.type = 'square';
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.3, t + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.3);
      o.connect(g).connect(ctx.destination);
      o.start(t);
      o.stop(t + 0.32);
    }
  }
}
