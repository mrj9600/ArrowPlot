import { ChangeDetectionStrategy, Component, effect, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { db } from '../core/db';
import { dim } from '../core/dimension';
import { Round, RoundTemplate } from '../core/models';
import { Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { RoundSettings } from '../ui/round-settings';

/** Adds a round to a session (/session/:sessionId/round/new) or edits one (/round/:id/edit). */
@Component({
  selector: 'app-round-form',
  imports: [AppBar, RoundSettings],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar [title]="id() ? 'Edit round' : 'New round'" [back]="backUrl()" />
    <div class="page">
      <div class="card"><app-round-settings [(value)]="tpl" /></div>
      @if (id()) {
        <p class="notice small">
          Changing the face or scoring re-scores this round's arrows from their saved rings. Ends
          already shot keep their number of arrows.
        </p>
        <label class="field card"
          ><span>Notes</span>
          <textarea
            class="input"
            [value]="comment()"
            (input)="comment.set($any($event.target).value)"
          ></textarea>
        </label>
      }
      <button class="btn primary block" type="button" (click)="save()">
        {{ id() ? 'Save' : 'Add round and start' }}
      </button>
    </div>
  `,
})
export class RoundFormPage {
  readonly id = input<string>();
  readonly sessionId = input<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);

  protected readonly tpl = signal<RoundTemplate>({
    distance: dim(18, 'm'),
    targetId: 0,
    scoringStyle: 0,
    targetDiameter: dim(40, 'cm'),
    shotsPerEnd: 3,
    endCount: 10,
  });
  protected readonly comment = signal('');
  protected readonly backUrl = signal('/');
  private existing: Round | null = null;

  constructor() {
    effect(() => {
      this.load(this.id(), this.sessionId());
    });
  }

  private async load(id?: string, sessionId?: string) {
    if (id) {
      const r = await db.rounds.get(+id);
      if (!r) return;
      this.existing = r;
      this.backUrl.set(`/round/${r.id}`);
      this.comment.set(r.comment);
      this.tpl.set({
        distance: r.distance,
        targetId: r.targetId,
        scoringStyle: r.scoringStyle,
        targetDiameter: r.targetDiameter,
        shotsPerEnd: r.shotsPerEnd,
        endCount: r.maxEndCount ?? 0,
      });
    } else if (sessionId) {
      this.backUrl.set(`/session/${sessionId}`);
      const rounds = await this.repo.roundsOf(+sessionId);
      const last = rounds.at(-1);
      if (last) {
        this.tpl.set({
          distance: last.distance,
          targetId: last.targetId,
          scoringStyle: last.scoringStyle,
          targetDiameter: last.targetDiameter,
          shotsPerEnd: last.shotsPerEnd,
          endCount: last.maxEndCount ?? 0,
        });
      }
    }
  }

  protected async save() {
    const t = this.tpl();
    if (this.existing) {
      await this.repo.updateRound({
        ...this.existing,
        distance: t.distance,
        targetId: t.targetId,
        scoringStyle: t.scoringStyle,
        targetDiameter: t.targetDiameter,
        shotsPerEnd: t.shotsPerEnd,
        maxEndCount: t.endCount || null,
        comment: this.comment().trim(),
      });
      this.router.navigate(['/round', this.existing.id], { replaceUrl: true });
    } else if (this.sessionId()) {
      const rid = await this.repo.addRound(+this.sessionId()!, t);
      await this.router.navigate(['/round', rid], { replaceUrl: true });
      this.router.navigate(['/round', rid, 'end', 0]);
    }
  }
}
