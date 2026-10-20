import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { liveQuery } from 'dexie';
import { from, switchMap } from 'rxjs';
import { analyseBundle, isSighted, loadSession, SessionBundle } from '../core/bundle';
import { db } from '../core/db';
import { formatDimension } from '../core/dimension';
import { avg, pct } from '../core/format';
import { End, NOT_ENTERED, Shot } from '../core/models';
import { Repo } from '../core/repo.service';
import {
  contrastOn,
  faceLabel,
  getTarget,
  isFirstHitStyle,
  scoreEnd,
  zoneLabel,
} from '../core/targets';
import { AnalysisView } from '../ui/analysis-view';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { ImageThumb } from '../ui/image-thumb';

@Component({
  selector: 'app-round-detail',
  imports: [AppBar, RouterLink, Icon, AnalysisView, ImageThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (round(); as r) {
      <app-bar
        [title]="'Round ' + (r.index + 1) + (fmtDim(r.distance) ? ' · ' + fmtDim(r.distance) : '')"
        [subtitle]="faceName()"
        [back]="'/session/' + r.sessionId"
      >
        <a class="icon-btn" [routerLink]="['/round', r.id, 'edit']" aria-label="Edit round"
          ><app-icon name="edit"
        /></a>
        <button class="icon-btn" type="button" (click)="remove()" aria-label="Delete round">
          <app-icon name="delete" />
        </button>
      </app-bar>
      <div class="page">
        <div class="card row">
          <div>
            <div class="big-num">
              {{ r.score.reached
              }}<span class="muted" style="font-size:18px"> / {{ r.score.total }}</span>
            </div>
            <div class="muted small">
              {{ pct(r.score.reached, r.score.total) }} · {{ r.score.shots }} arrows · Ø
              {{ avg(r.score) }}
            </div>
          </div>
          <div class="spacer"></div>
          @if (canAdd()) {
            <a class="btn primary" [routerLink]="['/round', r.id, 'end', ends().length]"
              ><app-icon name="add" /> End</a
            >
          } @else if (nextRoundId(); as nr) {
            <a class="btn primary" [routerLink]="['/round', nr, 'end', 0]">Next round</a>
          }
        </div>
        @if (ends().length) {
          <div class="card flush">
            <ul class="list">
              @for (e of rows(); track e.end.id) {
                <li>
                  <a class="item" [routerLink]="['/round', r.id, 'end', e.end.index]">
                    <div class="n muted">{{ e.end.index + 1 }}</div>
                    <div class="main">
                      <div class="pills">
                        @for (s of e.pills; track $index) {
                          <span class="ring sm" [style.background]="s.fill" [style.color]="s.ink">{{
                            s.label
                          }}</span>
                        }
                      </div>
                      @if (e.end.comment) {
                        <div class="sub">{{ e.end.comment }}</div>
                      }
                      @if (e.end.imageIds?.length) {
                        <div class="photos">
                          @for (id of e.end.imageIds; track id) {
                            <app-image-thumb [imageId]="id" class="photo" />
                          }
                        </div>
                      }
                    </div>
                    <div class="end num">
                      <b>{{ e.score }}</b>
                      <div class="sub">{{ e.cumulative }}</div>
                    </div>
                  </a>
                </li>
              }
            </ul>
          </div>
        } @else {
          <p class="empty">No ends shot in this round yet.</p>
        }
        @if (ends().length) {
          <div class="section-title">Analysis</div>
          <div class="card"><app-analysis [a]="analysis()" [sighted]="sighted()" /></div>
        }
      </div>
    }
  `,
  styles: `
    .n {
      width: 22px;
      text-align: center;
      font-weight: 700;
    }
    .pills {
      display: flex;
      gap: 4px;
      flex-wrap: wrap;
    }
    .photos {
      display: flex;
      gap: 6px;
      margin-top: 6px;
    }
    .photo {
      width: 56px;
      height: 56px;
    }
  `,
})
export class RoundDetailPage {
  readonly id = input.required<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly pct = pct;
  protected readonly avg = avg;
  protected readonly fmtDim = formatDimension;

  private readonly b = toSignal(
    toObservable(this.id).pipe(
      switchMap((id) =>
        from(
          liveQuery(async () => {
            const r = await db.rounds.get(+id);
            return r ? loadSession(r.sessionId) : null;
          }),
        ),
      ),
    ),
    { initialValue: null as SessionBundle | null },
  );
  protected readonly round = computed(
    () => this.b()?.rounds.find((r) => r.id === +this.id()) ?? null,
  );
  protected readonly ends = computed<End[]>(() => this.b()?.ends.get(+this.id()) ?? []);
  protected readonly model = computed(() => getTarget(this.round()?.targetId ?? 0));
  protected readonly faceName = computed(() => {
    const r = this.round();
    return r
      ? `${faceLabel(r.targetId, r.targetDiameter)} · ${this.model().styles[r.scoringStyle]?.name ?? ''}`
      : '';
  });
  protected readonly canAdd = computed(() => {
    const r = this.round();
    return !!r && (!r.maxEndCount || this.ends().length < r.maxEndCount);
  });
  protected readonly nextRoundId = computed(() => {
    const b = this.b();
    const r = this.round();
    return b && r ? (b.rounds.find((x) => x.index === r.index + 1)?.id ?? null) : null;
  });
  protected readonly analysis = computed(() =>
    this.b() ? analyseBundle(this.b()!, [+this.id()]) : null,
  );
  protected readonly sighted = computed(() => isSighted(this.b()?.bow ?? null));

  protected readonly rows = computed(() => {
    const r = this.round();
    if (!r) return [];
    const m = this.model();
    let cum = 0;
    return this.ends().map((end) => {
      const s = scoreEnd(m, r.scoringStyle, end.shots);
      cum += s.reached;
      // First-hit ends: leave out the arrows that were not shot after the hit.
      const shown = isFirstHitStyle(m, r.scoringStyle)
        ? end.shots.filter((sh) => sh.ring !== NOT_ENTERED)
        : end.shots;
      const pills = shown.map((sh: Shot) => {
        const fill =
          sh.ring === NOT_ENTERED
            ? 'transparent'
            : sh.ring >= 0 && sh.ring < m.zones.length
              ? m.zones[sh.ring].fill
              : '#9aa3ab';
        return {
          label: zoneLabel(m, r.scoringStyle, sh.ring, sh.index),
          fill,
          ink: fill === 'transparent' ? 'inherit' : contrastOn(fill),
        };
      });
      return { end, score: s.reached, cumulative: cum, pills };
    });
  });

  protected async remove() {
    const r = this.round();
    if (!r || !confirm(`Delete round ${r.index + 1} and its ${this.ends().length} ends?`)) return;
    await this.repo.deleteRound(r.id!);
    this.router.navigate(['/session', r.sessionId], { replaceUrl: true });
  }
}
