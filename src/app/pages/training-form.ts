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
import { Arrow, Bow, StandardRound, Training } from '../core/models';
import { Repo, todayIso } from '../core/repo.service';
import { describeRound } from '../core/standard-rounds';
import { AppBar } from '../ui/app-bar';

/** Arrow numbers offered when no arrow set says otherwise. */
const DEFAULT_ARROW_COUNT = 13;

interface LastTraining {
  bowId?: number;
  arrowId?: number;
  standardId?: number;
  arrowNumbers?: string[];
}

@Component({
  selector: 'app-training-form',
  imports: [AppBar, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar
      [title]="id() ? 'Edit training' : 'New training'"
      [back]="id() ? '/training/' + id() : '/'"
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
              [placeholder]="selectedRound()?.name ?? 'Training'"
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
            <select class="input" (change)="roundId.set(+$any($event.target).value || null)">
              @for (s of rounds(); track s.id) {
                <option [value]="s.id" [selected]="s.id === roundId()">{{ s.name }}</option>
              }
            </select>
          </label>
          @if (selectedRound(); as s) {
            <ul class="small muted" style="margin:-4px 0 0;padding-left:18px">
              @for (r of s.rounds; track $index) {
                <li>{{ describe(r) }}</li>
              }
            </ul>
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
            per training. The arrow diameter makes line-cutter scoring exact.
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
        {{ id() ? 'Save' : 'Start training' }}
      </button>
    </form>
  `,
  styles: `
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
export class TrainingFormPage {
  readonly id = input<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly describe = describeRound;

  protected readonly bows = signal<Bow[]>([]);
  protected readonly arrows = signal<Arrow[]>([]);
  protected readonly rounds = signal<StandardRound[]>([]);
  protected readonly loaded = signal(false);
  protected readonly busy = signal(false);

  protected readonly title = signal('');
  protected readonly date = signal(todayIso());
  protected readonly roundId = signal<number | null>(null);
  protected readonly bowId = signal<number | null>(null);
  protected readonly arrowId = signal<number | null>(null);
  protected readonly location = signal('');
  protected readonly comment = signal('');
  protected readonly numbering = signal(false);
  protected readonly chosen = signal(new Set<string>());
  private existing: Training | null = null;

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
      const t = await db.trainings.get(id);
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
      const last = await this.repo.getSetting<LastTraining>('lastTraining', {});
      const has = <T extends { id?: number }>(l: T[], id?: number) => l.some((x) => x.id === id);
      this.bowId.set(has(bows, last.bowId) ? last.bowId! : bows.length === 1 ? bows[0].id! : null);
      this.arrowId.set(
        has(arrows, last.arrowId) ? last.arrowId! : arrows.length === 1 ? arrows[0].id! : null,
      );
      this.roundId.set(has(rounds, last.standardId) ? last.standardId! : (rounds[0]?.id ?? null));
      this.chosen.set(new Set(last.arrowNumbers ?? this.pool()));
    }
    this.loaded.set(true);
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
        await this.repo.updateTraining({
          ...this.existing,
          ...base,
          title: base.title || this.existing.title,
        });
        this.router.navigate(['/training', this.existing.id], { replaceUrl: true });
        return;
      }
      const sr = this.selectedRound();
      if (!sr?.rounds.length) return;
      const id = await this.repo.createTraining(
        {
          ...base,
          title: base.title || sr.name,
          standardRoundId: sr.id ?? null,
          indoor: true,
          weather: null,
          source: 'manual',
        },
        sr.rounds,
      );
      await this.repo.setSetting('lastTraining', {
        bowId: this.bowId() ?? undefined,
        arrowId: this.arrowId() ?? undefined,
        standardId: sr.id,
        arrowNumbers: numbers ?? undefined,
      } satisfies LastTraining);
      const [first] = await this.repo.roundsOf(id);
      await this.router.navigate(['/training', id], { replaceUrl: true });
      this.router.navigate(['/round', first.id, 'end', 0]);
    } finally {
      this.busy.set(false);
    }
  }
}
