import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { db } from '../core/db';
import { dim } from '../core/dimension';
import { Arrow, Bow, Dimension, LengthUnit, StandardRound, Session } from '../core/models';
import { usesTargetNumbers } from '../core/numbering';
import { Repo, todayIso } from '../core/repo.service';
import { describeRoundSetup } from '../core/standard-rounds';
import { AppBar } from '../ui/app-bar';

/** Arrow numbers offered when no arrow set says otherwise. */
const DEFAULT_ARROW_COUNT = 13;

interface LastSession {
  bowId?: number;
  arrowId?: number;
  standardId?: number;
  arrowNumbers?: string[];
}

@Component({
  selector: 'app-session-form',
  imports: [AppBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar
      [title]="id() ? 'Edit session' : 'New session'"
      [back]="id() ? '/session/' + id() : '/'"
    />
    <form class="page" (submit)="$event.preventDefault(); save()">
      <div class="card" style="display:grid;gap:12px">
        <div class="grid2 stack">
          <label class="field"
            ><span>Title</span>
            <input
              class="input"
              [value]="title()"
              (input)="title.set($any($event.target).value)"
              [placeholder]="selectedRound()?.name ?? 'Session'"
            />
          </label>
          <label class="field"
            ><span>Date</span>
            <input
              class="input"
              type="date"
              [value]="date()"
              (input)="date.set($any($event.target).value)"
            />
          </label>
        </div>

        @if (!id()) {
          <label class="field"
            ><span>Round</span>
            <select class="input" (change)="pickRound(+$any($event.target).value || null)">
              @for (s of rounds(); track s.id) {
                <option [value]="s.id" [selected]="s.id === roundId()">{{ s.name }}</option>
              }
            </select>
          </label>
          @if (selectedRound(); as s) {
            <div class="round-line">
              <span class="small muted">{{ describe(s.round) }}</span>
              <div class="round-inputs">
                @if (numbered(s.round)) {
                  <label class="ends">
                    <span class="small muted">Start at</span>
                    <input
                      class="input"
                      type="number"
                      inputmode="numeric"
                      min="1"
                      max="99"
                      placeholder="1"
                      [value]="start() > 1 ? start() : ''"
                      (input)="setStart(+$any($event.target).value)"
                      aria-label="Start at target"
                    />
                  </label>
                }
                <label class="ends">
                  <span class="small muted">Distance</span>
                  <input
                    class="input"
                    type="number"
                    inputmode="decimal"
                    min="0"
                    step="any"
                    placeholder="None"
                    [value]="distance().value > 0 ? distance().value : ''"
                    (input)="setDistance(+$any($event.target).value)"
                    aria-label="Distance"
                  />
                  <select
                    class="input unit"
                    (change)="setUnit($any($event.target).value)"
                    aria-label="Distance unit"
                  >
                    <option value="m" [selected]="distance().unit !== 'yd'">m</option>
                    <option value="yd" [selected]="distance().unit === 'yd'">yd</option>
                  </select>
                </label>
                <label class="ends">
                  <span class="small muted">Ends</span>
                  <input
                    class="input"
                    type="number"
                    inputmode="numeric"
                    min="0"
                    max="99"
                    placeholder="No limit"
                    [value]="ends() || ''"
                    (input)="setEnds(+$any($event.target).value)"
                    aria-label="Number of ends"
                  />
                </label>
              </div>
            </div>
            <span class="small muted" style="margin-top:-6px">
              Changes here apply to this session only. Leave Ends empty to shoot as many as you
              like.
            </span>
          } @else if (loaded()) {
            <p class="notice small" style="margin:0">
              You have no rounds yet.
              <a routerLink="/standard-round/new">Create a round</a> first.
            </p>
          }
          <a class="small" routerLink="/equipment">Manage rounds</a>
        }

        <div class="grid2 stack">
          <label class="field"
            ><span>Bow</span>
            <select class="input" (change)="bowId.set(+$any($event.target).value || null)">
              <option value="" [selected]="!bowId()">No bow</option>
              @for (b of bows(); track b.id) {
                <option [value]="b.id" [selected]="b.id === bowId()">{{ b.name }}</option>
              }
            </select>
          </label>
          <label class="field"
            ><span>Arrows</span>
            <select class="input" (change)="arrowId.set(+$any($event.target).value || null)">
              <option value="" [selected]="!arrowId()">No arrows</option>
              @for (a of arrows(); track a.id) {
                <option [value]="a.id" [selected]="a.id === arrowId()">{{ a.name }}</option>
              }
            </select>
          </label>
        </div>
        @if (!bows().length || !arrows().length) {
          <p class="small muted" style="margin:0">
            Add your bows and arrows under <a routerLink="/equipment">Equipment</a> to track them
            per session. The arrow diameter makes line-cutter scoring exact.
          </p>
        }

        <label class="check"
          ><input
            type="checkbox"
            [checked]="numbering()"
            (change)="numbering.set($any($event.target).checked)"
          />
          Number my arrows</label
        >
        @if (numbering()) {
          <div class="numbers">
            <div class="row">
              <span class="small muted" style="flex:1"
                >Arrows to choose from ({{ chosen().size }} selected)</span
              >
              <button class="btn sm ghost" type="button" (click)="selectAll()">All</button>
              <button class="btn sm ghost" type="button" (click)="selectNone()">None</button>
            </div>
            <div class="chips">
              @for (n of pool(); track n) {
                <button
                  type="button"
                  class="chip num"
                  [class.on]="chosen().has(n)"
                  (click)="toggle(n)"
                  [attr.aria-pressed]="chosen().has(n)"
                >
                  {{ n }}
                </button>
              }
            </div>
          </div>
        }

        <label class="field"
          ><span>Location</span>
          <input
            class="input"
            [value]="location()"
            (input)="location.set($any($event.target).value)"
          />
        </label>
        <label class="field"
          ><span>Notes</span>
          <textarea
            class="input"
            [value]="comment()"
            (input)="comment.set($any($event.target).value)"
          ></textarea>
        </label>
      </div>
      <button
        class="btn primary block"
        type="submit"
        [disabled]="busy() || (!id() && !selectedRound())"
      >
        {{ id() ? 'Save' : 'Start session' }}
      </button>
    </form>
  `,
  styles: `
    .round-line {
      display: grid;
      gap: 6px;
      margin-top: -4px;
    }
    .round-inputs {
      display: flex;
      gap: 12px;
      flex-wrap: wrap;
    }
    .ends {
      display: flex;
      gap: 6px;
      align-items: center;
    }
    .ends .input {
      width: 84px;
      min-height: 38px;
    }
    .ends .input.unit {
      width: 64px;
      padding: 0 6px;
    }
    .numbers {
      display: grid;
      gap: 6px;
      margin-top: -6px;
    }
    .chip.num {
      min-width: 40px;
      padding: 6px 0;
      text-align: center;
    }
  `,
})
export class SessionFormPage {
  readonly id = input<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly describe = describeRoundSetup;

  protected readonly bows = signal<Bow[]>([]);
  protected readonly arrows = signal<Arrow[]>([]);
  protected readonly rounds = signal<StandardRound[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly title = signal('');
  protected readonly date = signal(todayIso());
  protected readonly roundId = signal<number | null>(null);
  /** Number of ends for this session; 0 = no limit. */
  protected readonly ends = signal(0);
  /** Distance for this session; value -1 = no distance. */
  protected readonly distance = signal<Dimension>(dim(-1, null));
  /** 3D and field: the target the round starts at. */
  protected readonly start = signal(1);
  protected readonly numbered = usesTargetNumbers;
  protected readonly bowId = signal<number | null>(null);
  protected readonly arrowId = signal<number | null>(null);
  protected readonly location = signal('');
  protected readonly comment = signal('');
  protected readonly numbering = signal(false);
  protected readonly chosen = signal(new Set<string>());
  private existing: Session | null = null;

  protected readonly selectedRound = computed(
    () => this.rounds().find((s) => s.id === this.roundId()) ?? null,
  );
  /** 1 … N, where N is the arrow set's size (at least 13). */
  protected readonly pool = computed(() => {
    const set = this.arrows().find((a) => a.id === this.arrowId());
    const n = Math.max(DEFAULT_ARROW_COUNT, set?.maxArrowNumber ?? 0);
    return Array.from({ length: n }, (_, i) => String(i + 1));
  });

  constructor() {
    effect(() => {
      const id = this.id();
      this.load(id ? +id : null);
    });
  }

  private async load(id: number | null) {
    const [bows, arrows, rounds] = await Promise.all([
      this.repo.bows(),
      this.repo.arrows(),
      this.repo.standardRounds(),
    ]);
    this.bows.set(bows);
    this.arrows.set(arrows);
    this.rounds.set(rounds);
    if (id) {
      const t = await db.sessions.get(id);
      if (!t) return;
      this.existing = t;
      this.title.set(t.title);
      this.date.set(t.date);
      this.bowId.set(t.bowId ?? null);
      this.arrowId.set(t.arrowId ?? null);
      this.location.set(t.location);
      this.comment.set(t.comment);
      this.numbering.set(t.arrowNumbering);
      this.chosen.set(new Set(t.arrowNumbers ?? this.pool()));
    } else {
      const last = await this.repo.getSetting<LastSession>('lastSession', {});
      const has = <T extends { id?: number }>(l: T[], id?: number) => l.some((x) => x.id === id);
      this.bowId.set(has(bows, last.bowId) ? last.bowId! : bows.length === 1 ? bows[0].id! : null);
      this.arrowId.set(
        has(arrows, last.arrowId) ? last.arrowId! : arrows.length === 1 ? arrows[0].id! : null,
      );
      this.pickRound(has(rounds, last.standardId) ? last.standardId! : (rounds[0]?.id ?? null));
      this.chosen.set(new Set(last.arrowNumbers ?? this.pool()));
    }
    this.loaded.set(true);
  }

  protected pickRound(id: number | null) {
    this.roundId.set(id);
    const r = this.selectedRound()?.round;
    this.ends.set(r?.endCount || 0);
    this.distance.set(r?.distance ?? dim(-1, null));
    this.start.set(1);
  }
  protected setDistance(v: number) {
    this.distance.set(isFinite(v) && v > 0 ? dim(v, this.distance().unit ?? 'm') : dim(-1, null));
  }
  protected setUnit(unit: LengthUnit) {
    this.distance.update((d) => ({ ...d, unit }));
  }
  protected setStart(v: number) {
    this.start.set(isFinite(v) && v >= 1 ? Math.min(99, Math.round(v)) : 1);
  }
  protected setEnds(v: number) {
    this.ends.set(isFinite(v) ? Math.min(99, Math.max(0, Math.round(v))) : 0);
  }

  protected toggle(n: string) {
    this.chosen.update((s) => {
      const next = new Set(s);
      if (!next.delete(n)) next.add(n);
      return next;
    });
  }
  protected selectAll() {
    this.chosen.set(new Set(this.pool()));
  }
  protected selectNone() {
    this.chosen.set(new Set());
  }

  /** Selected numbers in order, or null when every number is selected. */
  private arrowNumbers(): string[] | null {
    const list = this.pool().filter((n) => this.chosen().has(n));
    return list.length === this.pool().length ? null : list;
  }

  protected async save() {
    if (this.busy()) return;
    this.busy.set(true);
    try {
      const numbers = this.arrowNumbers();
      const base = {
        title: this.title().trim(),
        date: this.date() || todayIso(),
        bowId: this.bowId(),
        arrowId: this.arrowId(),
        location: this.location().trim(),
        comment: this.comment().trim(),
        arrowNumbering: this.numbering() && (numbers === null || numbers.length > 0),
        arrowNumbers: numbers,
      };
      if (this.existing) {
        await this.repo.updateSession({
          ...this.existing,
          ...base,
          title: base.title || this.existing.title,
        });
        this.router.navigate(['/session', this.existing.id], { replaceUrl: true });
        return;
      }
      const sr = this.selectedRound();
      if (!sr) return;
      const id = await this.repo.createSession(
        {
          ...base,
          title: base.title || sr.name,
          standardRoundId: sr.id ?? null,
          indoor: true,
          weather: null,
          source: 'manual',
        },
        [
          {
            ...sr.round,
            endCount: this.ends(),
            distance: this.distance(),
            startTarget: this.start(),
          },
        ],
      );
      await this.repo.setSetting('lastSession', {
        bowId: this.bowId() ?? undefined,
        arrowId: this.arrowId() ?? undefined,
        standardId: sr.id,
        arrowNumbers: numbers ?? undefined,
      } satisfies LastSession);
      const [first] = await this.repo.roundsOf(id);
      await this.router.navigate(['/session', id], { replaceUrl: true });
      this.router.navigate(['/round', first.id, 'end', 0]);
    } finally {
      this.busy.set(false);
    }
  }
}
