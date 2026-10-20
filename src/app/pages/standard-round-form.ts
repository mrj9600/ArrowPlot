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
import { describeRound } from '../core/standard-rounds';
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
            placeholder="e.g. Club 18 m"
          />
        </label>
        <span class="small muted">{{ summary() }}</span>
      </div>

      <div class="card">
        <app-round-settings [value]="sr().round" (valueChange)="setRound($event)" />
      </div>
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
    round: { ...NEW_ROUND },
  });
  protected readonly isNew = computed(() => this.id() === 'new');
  protected readonly summary = computed(() => describeRound(this.sr().round));

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
  protected setRound(round: RoundTemplate) {
    this.sr.update((s) => ({ ...s, round }));
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
