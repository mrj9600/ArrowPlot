import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
} from '@angular/core';
import { Router } from '@angular/router';
import { db } from '../core/db';
import { dim } from '../core/dimension';
import { RoundTemplate, StandardRound } from '../core/models';
import { Repo } from '../core/repo.service';
import { arrowCount } from '../core/standard-rounds';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { RoundSettings } from '../ui/round-settings';

const NEW_ROUND: RoundTemplate = {
  distance: dim(18, 'm'),
  targetId: 0,
  scoringStyle: 0,
  targetDiameter: dim(40, 'cm'),
  shotsPerEnd: 3,
  endCount: 10,
};

/** Create or edit a round definition (/standard-round/new, /standard-round/:id). */
@Component({
  selector: 'app-standard-round-form',
  imports: [AppBar, Icon, RoundSettings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar [title]="isNew() ? 'New round' : sr().name || 'Round'" back="/equipment">
      @if (!isNew()) {
        <button class="icon-btn" type="button" (click)="remove()" aria-label="Delete round">
          <app-icon name="delete" />
        </button>
      }
    </app-bar>
    <div class="page">
      <div class="card" style="display:grid;gap:8px">
        <label class="field"
          ><span>Name</span>
          <input
            class="input"
            [value]="sr().name"
            (input)="setName($any($event.target).value)"
            placeholder="e.g. Club 18 m, 2 × 30 arrows"
          />
        </label>
        <span class="small muted">{{ summary() }}</span>
      </div>

      @for (r of sr().rounds; track $index; let i = $index) {
        <div class="card" style="display:grid;gap:10px">
          <div class="row">
            <h3 style="margin:0;flex:1">
              {{ sr().rounds.length > 1 ? 'Round ' + (i + 1) : 'Round' }}
            </h3>
            @if (sr().rounds.length > 1) {
              <button
                class="icon-btn"
                type="button"
                (click)="removeRound(i)"
                [attr.aria-label]="'Remove round ' + (i + 1)"
              >
                <app-icon name="close" />
              </button>
            }
          </div>
          <app-round-settings [value]="r" (valueChange)="setRound(i, $event)" />
        </div>
      }
      <button class="btn" type="button" (click)="addRound()">
        <app-icon name="add" /> Add another round (e.g. a second distance)
      </button>
      <button class="btn primary block" type="button" (click)="save()">Save</button>
    </div>
  `,
})
export class StandardRoundFormPage {
  readonly id = input.required<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);

  protected readonly sr = signal<StandardRound>({
    name: '',
    club: '',
    builtIn: false,
    rounds: [{ ...NEW_ROUND }],
  });
  protected readonly isNew = computed(() => this.id() === 'new');
  protected readonly summary = computed(() => {
    const n = arrowCount(this.sr());
    const r = this.sr().rounds.length;
    return `${r} round${r === 1 ? '' : 's'}${n ? ` · ${n} arrows in total` : ' · open-ended'}`;
  });

  constructor() {
    effect(async () => {
      if (this.isNew()) return;
      const s = await db.standardRounds.get(+this.id());
      if (s) this.sr.set(s);
    });
  }

  protected setName(name: string) {
    this.sr.update((s) => ({ ...s, name }));
  }
  protected setRound(i: number, r: RoundTemplate) {
    this.sr.update((s) => ({ ...s, rounds: s.rounds.map((x, j) => (j === i ? r : x)) }));
  }
  protected addRound() {
    this.sr.update((s) => ({ ...s, rounds: [...s.rounds, { ...(s.rounds.at(-1) ?? NEW_ROUND) }] }));
  }
  protected removeRound(i: number) {
    this.sr.update((s) => ({ ...s, rounds: s.rounds.filter((_, j) => j !== i) }));
  }

  protected async save() {
    const s = this.sr();
    await this.repo.saveStandardRound({ ...s, name: s.name.trim() || 'My round' });
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }

  protected async remove() {
    if (!confirm(`Delete "${this.sr().name}"? Sessions already shot with it are kept.`)) return;
    await this.repo.deleteStandardRound(+this.id());
    this.router.navigateByUrl('/equipment', { replaceUrl: true });
  }
}
