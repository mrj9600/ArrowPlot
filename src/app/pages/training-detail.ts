import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { Router, RouterLink } from '@angular/router';
import { liveQuery } from 'dexie';
import { from, switchMap } from 'rxjs';
import { analyseBundle, isSighted, loadTraining, TrainingBundle } from '../core/bundle';
import { formatDimension } from '../core/dimension';
import { avg, fmtDate, pct } from '../core/format';
import { Round } from '../core/models';
import { Repo } from '../core/repo.service';
import { getTarget } from '../core/targets';
import { AnalysisView } from '../ui/analysis-view';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { TargetFace } from '../ui/target-face';

const WEATHER: Record<string, string> = {
  sunny: 'Sunny',
  partlyCloudy: 'Partly cloudy',
  cloudy: 'Cloudy',
  lightRain: 'Light rain',
  rain: 'Rain',
};

@Component({
  selector: 'app-training-detail',
  imports: [AppBar, RouterLink, Icon, TargetFace, AnalysisView],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (b(); as b) {
      <app-bar [title]="b.training.title" [subtitle]="fmtDate(b.training.date, true)" back="/">
        <a class="icon-btn" [routerLink]="['/training', b.training.id, 'edit']" aria-label="Edit"
          ><app-icon name="edit"
        /></a>
        <button class="icon-btn" type="button" (click)="remove()" aria-label="Delete">
          <app-icon name="delete" />
        </button>
      </app-bar>
      <div class="page">
        <div class="card score">
          <div>
            <div class="big-num">
              {{ b.training.score.reached
              }}<span class="muted" style="font-size:18px"> / {{ b.training.score.total }}</span>
            </div>
            <div class="muted small">
              {{ pct(b.training.score.reached, b.training.score.total) }} ·
              {{ b.training.score.shots }} arrows · Ø {{ avg(b.training.score) }}
            </div>
          </div>
          <dl>
            @if (b.bow) {
              <dt>Bow</dt>
              <dd>{{ b.bow.name }}</dd>
            }
            @if (b.arrow) {
              <dt>Arrows</dt>
              <dd>{{ b.arrow.name }} ({{ fmtDim(b.arrow.diameter) }})</dd>
            }
            @if (conditions()) {
              <dt>Where</dt>
              <dd>{{ conditions() }}</dd>
            }
            @if (b.training.source !== 'manual') {
              <dt>Source</dt>
              <dd>{{ sourceName[b.training.source] }}</dd>
            }
          </dl>
        </div>
        @if (b.training.comment) {
          <div class="card small" style="white-space:pre-wrap">{{ b.training.comment }}</div>
        }

        <div class="section-title">Rounds</div>
        <div class="card flush">
          <ul class="list">
            @for (r of b.rounds; track r.id) {
              <li>
                <a class="item" [routerLink]="['/round', r.id]">
                  <app-target-face
                    class="mini"
                    [targetId]="r.targetId"
                    [scoringStyle]="r.scoringStyle"
                  />
                  <div class="main">
                    <div class="title">
                      Round {{ r.index + 1
                      }}{{ fmtDim(r.distance) ? ' · ' + fmtDim(r.distance) : '' }}
                    </div>
                    <div class="sub">{{ face(r) }} · {{ endsText(r) }}</div>
                  </div>
                  <div class="end num">
                    <b>{{ r.score.reached }}</b
                    ><span class="muted">/{{ r.score.total }}</span>
                    <div class="sub">{{ pct(r.score.reached, r.score.total) }}</div>
                  </div>
                </a>
              </li>
            }
          </ul>
        </div>
        <div class="row">
          @if (nextInput(); as n) {
            <a class="btn primary" [routerLink]="['/round', n.round, 'end', n.end]"
              ><app-icon name="target" /> Continue shooting</a
            >
          }
          <a class="btn" [routerLink]="['/training', b.training.id, 'round', 'new']"
            ><app-icon name="add" /> Add round</a
          >
        </div>

        <div class="section-title">Analysis</div>
        <div class="card"><app-analysis [a]="analysis()" [sighted]="sighted()" /></div>
      </div>
    }
  `,
  styles: `
    .score {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 16px;
      align-items: center;
    }
    @media (max-width: 460px) {
      .score {
        grid-template-columns: 1fr;
      }
    }
    dl {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 2px 12px;
      margin: 0;
      font-size: 14px;
    }
    dt {
      color: var(--muted);
    }
    dd {
      margin: 0;
    }
    .mini {
      width: 44px;
      flex: none;
    }
  `,
})
export class TrainingDetailPage {
  readonly id = input.required<string>();
  private readonly repo = inject(Repo);
  private readonly router = inject(Router);
  protected readonly fmtDate = fmtDate;
  protected readonly sourceName: Record<string, string> = {
    mytargets: 'MyTargets backup',
    mantisx: 'MantisX',
    archdps: '3D SKill Board (archDPS)',
  };
  protected readonly pct = pct;
  protected readonly avg = avg;
  protected readonly fmtDim = formatDimension;

  protected readonly b = toSignal(
    toObservable(this.id).pipe(switchMap((id) => from(liveQuery(() => loadTraining(+id))))),
    { initialValue: null as TrainingBundle | null },
  );
  protected readonly analysis = computed(() => (this.b() ? analyseBundle(this.b()!) : null));
  protected readonly sighted = computed(() => isSighted(this.b()?.bow ?? null));

  protected readonly conditions = computed(() => {
    const t = this.b()?.training;
    if (!t) return '';
    // Weather and wind only exist on trainings imported from MyTargets.
    const parts = [
      t.location,
      !t.indoor && t.weather ? WEATHER[t.weather] : '',
      !t.indoor && t.windSpeed ? `wind ${t.windSpeed} Bft` : '',
    ];
    return parts.filter(Boolean).join(' · ');
  });

  /** The first round that still has ends to shoot. */
  protected readonly nextInput = computed(() => {
    const b = this.b();
    if (!b) return null;
    for (const r of b.rounds) {
      const n = b.ends.get(r.id!)?.length ?? 0;
      if (!r.maxEndCount || n < r.maxEndCount) return { round: r.id, end: n };
    }
    return null;
  });

  protected face(r: Round) {
    return `${getTarget(r.targetId).name} ${formatDimension(r.targetDiameter)}`;
  }
  protected endsText(r: Round) {
    const n = this.b()?.ends.get(r.id!)?.length ?? 0;
    return r.maxEndCount
      ? `${n}/${r.maxEndCount} ends × ${r.shotsPerEnd}`
      : `${n} ends × ${r.shotsPerEnd}`;
  }

  protected async remove() {
    const t = this.b()?.training;
    if (!t || !confirm(`Delete "${t.title}" (${fmtDate(t.date)}) with all its rounds and arrows?`))
      return;
    await this.repo.deleteTraining(t.id!);
    this.router.navigateByUrl('/', { replaceUrl: true });
  }
}
