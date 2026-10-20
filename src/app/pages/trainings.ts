import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { db } from '../core/db';
import { formatDimension } from '../core/dimension';
import { avg, fmtMonth, pct } from '../core/format';
import { Training } from '../core/models';
import { live, Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { InstallCard } from '../ui/install-card';

interface Row {
  t: Training;
  sub: string;
  day: string;
  wd: string;
}

@Component({
  selector: 'app-trainings',
  imports: [AppBar, RouterLink, Icon, InstallCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="ArrowPlot">
      <a class="icon-btn" routerLink="/timer" aria-label="Shooting timer"
        ><app-icon name="timer"
      /></a>
    </app-bar>
    <div class="page">
      <app-install-card [compact]="true" />
      @if (loaded() && !groups().length) {
        <div class="empty">
          <img src="logo.svg" alt="" />
          <h2>No trainings yet</h2>
          <p>
            Start a training with the + button, or bring your history over from MyTargets or
            MantisX.
          </p>
          <div class="row wrap" style="justify-content:center">
            <a class="btn" routerLink="/import/mytargets">Import MyTargets backup</a>
            <a class="btn" routerLink="/import/mantisx">Import MantisX</a>
          </div>
        </div>
      }
      @for (g of groups(); track g.month) {
        <div class="section-title">{{ g.month }}</div>
        <div class="card flush">
          <ul class="list">
            @for (r of g.rows; track r.t.id) {
              <li>
                <a class="item" [routerLink]="['/training', r.t.id]">
                  <div class="date">
                    <b>{{ r.day }}</b
                    ><span>{{ r.wd }}</span>
                  </div>
                  <div class="main">
                    <div class="title">{{ r.t.title }}</div>
                    <div class="sub">{{ r.sub }}</div>
                  </div>
                  <div class="end">
                    <div class="num">
                      <b>{{ r.t.score.reached }}</b
                      ><span class="muted">/{{ r.t.score.total }}</span>
                    </div>
                    <div class="sub">
                      {{ pct(r.t.score.reached, r.t.score.total) }} · Ø {{ avg(r.t.score) }}
                    </div>
                  </div>
                </a>
              </li>
            }
          </ul>
        </div>
      }
    </div>
    <a class="fab" routerLink="/training/new" aria-label="New training"><app-icon name="add" /></a>
  `,
  styles: `
    .date {
      width: 40px;
      display: grid;
      justify-items: center;
      line-height: 1.1;
    }
    .date b {
      font-size: 20px;
    }
    .date span {
      font-size: 11px;
      color: var(--muted);
      text-transform: uppercase;
      font-weight: 600;
    }
  `,
})
export class TrainingsPage {
  private readonly repo = inject(Repo);
  protected readonly pct = pct;
  protected readonly avg = avg;

  private readonly data = live(
    async () => {
      const [trainings, bows, rounds] = await Promise.all([
        this.repo.trainingsNewestFirst(),
        db.bows.toArray(),
        db.rounds.toArray(),
      ]);
      return { trainings, bows, rounds, loaded: true };
    },
    { trainings: [] as Training[], bows: [], rounds: [], loaded: false } as {
      trainings: Training[];
      bows: { id?: number; name: string }[];
      rounds: { trainingId: number; distance: import('../core/models').Dimension }[];
      loaded: boolean;
    },
  );
  protected readonly loaded = computed(() => this.data().loaded);

  protected readonly groups = computed(() => {
    const { trainings, bows, rounds } = this.data();
    const bowName = new Map(bows.map((b) => [b.id, b.name]));
    const dists = new Map<number, string[]>();
    for (const r of rounds) {
      const l = dists.get(r.trainingId) ?? [];
      const d = formatDimension(r.distance);
      if (d && !l.includes(d)) l.push(d);
      dists.set(r.trainingId, l);
    }
    const out: { month: string; rows: Row[] }[] = [];
    for (const t of trainings) {
      const month = fmtMonth(t.date);
      if (out.at(-1)?.month !== month) out.push({ month, rows: [] });
      const [y, m, d] = t.date.split('-').map(Number);
      const parts = [
        t.bowId ? bowName.get(t.bowId) : '',
        (dists.get(t.id!) ?? []).join(', '),
        `${t.score.shots} arrows`,
        t.source === 'mantisx' ? 'MantisX' : t.source === 'archdps' ? '3D SKill Board' : '',
      ].filter(Boolean);
      out.at(-1)!.rows.push({
        t,
        sub: parts.join(' · '),
        day: String(d),
        wd: new Date(y, m - 1, d).toLocaleDateString('en', { weekday: 'short' }),
      });
    }
    return out;
  });
}
