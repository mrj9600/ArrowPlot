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
import { Round, RoundTemplate, StandardRound } from '../core/models';
import { usesTargetNumbers } from '../core/numbering';
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
      @if (!id()) {
        <label class="field card"
          ><span>Round</span>
          <select class="input" (change)="pick($any($event.target).value)">
            @if (last) {
              <option value="last" [selected]="choice() === 'last'">Same as last round</option>
            }
            @for (s of standards(); track s.id) {
              <option [value]="s.id" [selected]="choice() === s.id">{{ s.name }}</option>
            }
            <option value="custom" [selected]="choice() === 'custom'">Custom</option>
          </select>
        </label>
      }
      <div class="card"><app-round-settings [(value)]="tpl" /></div>
      @if (numbered()) {
        <label class="field card"
          ><span>Start at target</span>
          <input
            class="input"
            type="number"
            inputmode="numeric"
            min="1"
            max="99"
            placeholder="1"
            [value]="start() > 1 ? start() : ''"
            (input)="setStart(+$any($event.target).value)"
          />
          <span class="small muted"
            >On a course you often start at another target. Targets are numbered from here and wrap
            to 1 after the last one.</span
          >
        </label>
      }
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

  /** New round: the user's round definitions, and which one (or the last round, or custom) is picked. */
  protected readonly standards = signal<StandardRound[]>([]);
  protected readonly choice = signal<number | 'last' | 'custom'>('custom');
  protected last: RoundTemplate | null = null;

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
      this.start.set(r.startTarget || 1);
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
      const [rounds, standards] = await Promise.all([
        this.repo.roundsOf(+sessionId),
        this.repo.standardRounds(),
      ]);
      this.standards.set(standards);
      const last = rounds.at(-1);
      this.last = last
        ? {
            distance: last.distance,
            targetId: last.targetId,
            scoringStyle: last.scoringStyle,
            targetDiameter: last.targetDiameter,
            shotsPerEnd: last.shotsPerEnd,
            endCount: last.maxEndCount ?? 0,
          }
        : null;
      this.pick(this.last ? 'last' : standards.length ? String(standards[0].id) : 'custom');
    }
  }

  protected pick(v: string) {
    const choice = v === 'last' || v === 'custom' ? v : +v;
    this.choice.set(choice);
    this.start.set(1);
    const s = this.standards().find((x) => x.id === choice);
    const tpl = choice === 'last' ? this.last : s?.round;
    if (tpl) this.tpl.set({ ...tpl });
  }

  /** 3D and field: the target the round starts at. */
  protected readonly start = signal(1);
  protected readonly numbered = computed(() => usesTargetNumbers(this.tpl()));
  protected setStart(v: number) {
    this.start.set(isFinite(v) && v >= 1 ? Math.min(99, Math.round(v)) : 1);
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
        startTarget: this.numbered() && this.start() > 1 ? this.start() : null,
      });
      this.router.navigate(['/round', this.existing.id], { replaceUrl: true });
    } else if (this.sessionId()) {
      const rid = await this.repo.addRound(+this.sessionId()!, {
        ...t,
        startTarget: this.numbered() ? this.start() : 1,
      });
      await this.router.navigate(['/round', rid], { replaceUrl: true });
      this.router.navigate(['/round', rid, 'end', 0]);
    }
  }
}
