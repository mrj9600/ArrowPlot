import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { db } from '../core/db';
import { formatDimension } from '../core/dimension';
import { f1, fmtDate, pct } from '../core/format';
import { Arrow, Bow, Dimension, End, Round, Training } from '../core/models';
import { live } from '../core/repo.service';
import { analyse, plotShots, PlotShot } from '../core/stats';
import { getTarget } from '../core/targets';
import { AnalysisView } from '../ui/analysis-view';
import { AppBar } from '../ui/app-bar';
import { ChartPoint, LineChart } from '../ui/line-chart';

interface Data {
  trainings: Training[];
  rounds: Round[];
  ends: End[];
  bows: Bow[];
  arrows: Arrow[];
}

const PERIODS = [
  { key: '30', label: '30 days', days: 30 },
  { key: '90', label: '90 days', days: 90 },
  { key: '365', label: '1 year', days: 365 },
  { key: 'all', label: 'All', days: 0 },
];

@Component({
  selector: 'app-stats',
  imports: [AppBar, AnalysisView, LineChart, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Statistics" />
    <div class="page">
      <div class="card filters">
        <div class="chips">
          @for (p of periods; track p.key) {
            <button
              type="button"
              class="chip"
              [class.on]="period() === p.key"
              (click)="period.set(p.key)"
            >
              {{ p.label }}
            </button>
          }
        </div>
        <div class="grid2 stack">
          <select
            class="input"
            (change)="bowId.set(+$any($event.target).value || null)"
            aria-label="Bow"
          >
            <option value="">All bows</option>
            @for (b of data().bows; track b.id) {
              <option [value]="b.id">{{ b.name }}</option>
            }
          </select>
          <select
            class="input"
            (change)="setFace($any($event.target).value)"
            aria-label="Distance and face"
          >
            <option value="">All distances and faces</option>
            @for (o of faceOptions(); track o.key) {
              <option [value]="o.key" [selected]="o.key === faceKey()">{{ o.label }}</option>
            }
          </select>
        </div>
      </div>

      @if (!selected().length) {
        <p class="empty">No trainings match these filters.</p>
      } @else {
        <div class="stats-grid">
          <div class="stat">
            <div class="k">Trainings</div>
            <div class="v">{{ selected().length }}</div>
          </div>
          <div class="stat">
            <div class="k">Arrows</div>
            <div class="v">{{ analysis().n }}</div>
          </div>
          <div class="stat">
            <div class="k">Avg / arrow</div>
            <div class="v">{{ analysis().avg.toFixed(2) }}</div>
          </div>
          <div class="stat">
            <div class="k">Score</div>
            <div class="v">{{ pct(analysis().reached, analysis().total) }}</div>
          </div>
        </div>

        <div class="card">
          <h3>Average per arrow</h3>
          <app-line-chart [points]="avgSeries()" label="Average score per arrow per training" />
        </div>
        @if (r50Series().length >= 2) {
          <div class="card">
            <h3>Group size, R50 (cm)</h3>
            <app-line-chart
              [points]="r50Series()"
              unit=" cm"
              [format]="fmt1"
              label="R50 group size per training"
            />
          </div>
        }

        <div class="section-title">All arrows combined</div>
        <div class="card">
          @if (!faceKey() && mixed()) {
            <p class="notice small">
              Arrows from different distances or faces are drawn together. Choose one distance and
              face above for a group that means something.
            </p>
          }
          <app-analysis [a]="analysis()" [sighted]="sighted()" />
        </div>

        <div class="section-title">Trainings</div>
        <div class="card flush scroll-x">
          <table class="tbl">
            <thead>
              <tr>
                <th>Date</th>
                <th>Training</th>
                <th>Arrows</th>
                <th>Avg</th>
                <th>%</th>
                <th>R50</th>
              </tr>
            </thead>
            <tbody>
              @for (r of perTraining(); track r.t.id) {
                <tr>
                  <td>
                    <a [routerLink]="['/training', r.t.id]">{{ r.t.date }}</a>
                  </td>
                  <td>{{ r.t.title }}</td>
                  <td>{{ r.a.n }}</td>
                  <td>{{ r.a.avg.toFixed(2) }}</td>
                  <td>{{ pct(r.a.reached, r.a.total) }}</td>
                  <td>{{ r.a.noPos ? '–' : f1(r.a.r50) }}</td>
                </tr>
              }
            </tbody>
          </table>
        </div>
      }
    </div>
  `,
  styles: `
    .filters {
      display: grid;
      gap: 10px;
    }
  `,
})
export class StatsPage {
  protected readonly periods = PERIODS;
  protected readonly pct = pct;
  protected readonly f1 = f1;
  protected readonly fmt1 = (v: number) => v.toFixed(1);
  protected readonly period = signal('90');
  protected readonly bowId = signal<number | null>(null);
  protected readonly faceKey = signal('');

  protected readonly data = live<Data>(
    async () => {
      const [trainings, rounds, ends, bows, arrows] = await Promise.all([
        db.trainings.orderBy('date').toArray(),
        db.rounds.toArray(),
        db.ends.toArray(),
        db.bows.toArray(),
        db.arrows.toArray(),
      ]);
      return { trainings, rounds, ends, bows, arrows };
    },
    { trainings: [], rounds: [], ends: [], bows: [], arrows: [] },
  );

  private readonly endsByRound = computed(() => {
    const m = new Map<number, End[]>();
    for (const e of this.data().ends) {
      let l = m.get(e.roundId);
      if (!l) m.set(e.roundId, (l = []));
      l.push(e);
    }
    for (const l of m.values()) l.sort((a, b) => a.index - b.index);
    return m;
  });

  private readonly inPeriod = computed(() => {
    const days = PERIODS.find((p) => p.key === this.period())!.days;
    const from = days ? new Date(Date.now() - days * 864e5).toISOString().slice(0, 10) : '';
    const bow = this.bowId();
    return this.data().trainings.filter(
      (t) => t.date >= from && (!bow || t.bowId === bow) && t.score.shots > 0,
    );
  });

  private faceKeyOf(r: Round) {
    return `${r.distance.value}|${r.distance.unit}|${r.targetId}|${r.targetDiameter.value}|${r.targetDiameter.unit}`;
  }

  protected readonly faceOptions = computed(() => {
    const ids = new Set(this.inPeriod().map((t) => t.id));
    const seen = new Map<string, { key: string; label: string; n: number }>();
    for (const r of this.data().rounds) {
      if (!ids.has(r.trainingId)) continue;
      const key = this.faceKeyOf(r);
      const e = seen.get(key) ?? {
        key,
        label: `${formatDimension(r.distance)} · ${getTarget(r.targetId).name} ${formatDimension(r.targetDiameter)}`,
        n: 0,
      };
      e.n++;
      seen.set(key, e);
    }
    return [...seen.values()].sort((a, b) => b.n - a.n);
  });

  protected setFace(k: string) {
    this.faceKey.set(k);
  }

  private readonly roundsFor = computed(() => {
    const key = this.faceKey();
    const ids = new Set(this.inPeriod().map((t) => t.id));
    return this.data().rounds.filter(
      (r) => ids.has(r.trainingId) && (!key || this.faceKeyOf(r) === key),
    );
  });

  protected readonly selected = computed(() => {
    const ids = new Set(this.roundsFor().map((r) => r.trainingId));
    return this.inPeriod().filter((t) => ids.has(t.id!));
  });

  private readonly shotsByTraining = computed(() => {
    const arrows = new Map(this.data().arrows.map((a) => [a.id, a.diameter as Dimension]));
    const tById = new Map(this.data().trainings.map((t) => [t.id, t]));
    const m = new Map<number, PlotShot[]>();
    for (const r of this.roundsFor()) {
      const t = tById.get(r.trainingId)!;
      const shots = plotShots(
        this.endsByRound().get(r.id!) ?? [],
        r,
        t.arrowId ? (arrows.get(t.arrowId) ?? null) : null,
      );
      m.set(r.trainingId, [...(m.get(r.trainingId) ?? []), ...shots]);
    }
    return m;
  });

  protected readonly perTraining = computed(() =>
    this.selected()
      .map((t) => ({ t, a: analyse(this.shotsByTraining().get(t.id!) ?? []) }))
      .filter((r) => r.a.n > 0)
      .reverse(),
  );

  protected readonly analysis = computed(() =>
    analyse([...this.shotsByTraining().values()].flat()),
  );

  protected readonly mixed = computed(
    () => new Set(this.roundsFor().map((r) => this.faceKeyOf(r))).size > 1,
  );

  protected readonly sighted = computed(() => {
    const bow = this.data().bows.find((b) => b.id === this.bowId());
    return bow ? bow.type === 'recurve' || bow.type === 'compound' : false;
  });

  protected readonly avgSeries = computed<ChartPoint[]>(() =>
    [...this.perTraining()].reverse().map((r) => ({
      date: r.t.date,
      value: r.a.avg,
      title: `${fmtDate(r.t.date)} · ${r.t.title}`,
      detail: `${r.a.reached}/${r.a.total} · ${r.a.n} arrows`,
    })),
  );
  protected readonly r50Series = computed<ChartPoint[]>(() =>
    [...this.perTraining()]
      .reverse()
      .filter((r) => !r.a.noPos)
      .map((r) => ({
        date: r.t.date,
        value: r.a.r50,
        title: `${fmtDate(r.t.date)} · ${r.t.title}`,
        detail: `${r.a.nPos} arrows with position`,
      })),
  );
}
