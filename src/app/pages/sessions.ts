import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { db } from '../core/db';
import { formatDimension } from '../core/dimension';
import { avg, fmtMonth, pct } from '../core/format';
import { Bow, Round, Session } from '../core/models';
import { live, Repo, todayIso } from '../core/repo.service';
import { getTarget, TargetKind } from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { InstallCard } from '../ui/install-card';

interface Row {
  t: Session;
  sub: string;
  day: string;
  wd: string;
}

/** 'all', a number of days back ('30', '90', '365') or a year ('y2025'). */
type Period = string;

interface Filter {
  q: string;
  period: Period;
  kind: 'all' | TargetKind;
  bowId: number;
}

const NO_FILTER: Filter = { q: '', period: 'all', kind: 'all', bowId: 0 };
const KIND_LABEL: Record<TargetKind, string> = {
  target: 'Target face',
  field: 'Field',
  '3d': '3D',
};

@Component({
  selector: 'app-sessions',
  imports: [AppBar, RouterLink, Icon, InstallCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="ArrowPlot">
      <button
        class="icon-btn filter-btn"
        type="button"
        (click)="open.set(!open())"
        [attr.aria-expanded]="open()"
        aria-label="Filter sessions"
      >
        <app-icon name="filter" />
        @if (activeCount()) {
          <span class="badge">{{ activeCount() }}</span>
        }
      </button>
      <a class="icon-btn" routerLink="/timer" aria-label="Shooting timer"
        ><app-icon name="timer"
      /></a>
    </app-bar>
    <div class="page">
      <app-install-card [compact]="true" />

      @if (open()) {
        <div class="card filters">
          <input
            class="input"
            type="search"
            placeholder="Search title or location"
            [value]="filter().q"
            (input)="set({ q: $any($event.target).value })"
          />
          <div class="grid2">
            <label class="field"
              ><span>Period</span>
              <select class="input" (change)="set({ period: $any($event.target).value })">
                @for (p of periods(); track p.key) {
                  <option [value]="p.key" [selected]="p.key === filter().period">
                    {{ p.label }}
                  </option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Kind</span>
              <select class="input" (change)="set({ kind: $any($event.target).value })">
                <option value="all" [selected]="filter().kind === 'all'">All kinds</option>
                @for (k of kinds; track k) {
                  <option [value]="k" [selected]="filter().kind === k">{{ kindLabel[k] }}</option>
                }
              </select>
            </label>
          </div>
          @if (bows().length) {
            <label class="field"
              ><span>Bow</span>
              <select class="input" (change)="set({ bowId: +$any($event.target).value })">
                <option value="0" [selected]="!filter().bowId">All bows</option>
                @for (b of bows(); track b.id) {
                  <option [value]="b.id" [selected]="b.id === filter().bowId">{{ b.name }}</option>
                }
              </select>
            </label>
          }
          <div class="row">
            <span class="small muted" style="flex:1"
              >Showing {{ shown() }} of {{ data().sessions.length }}</span
            >
            <button
              class="btn sm ghost"
              type="button"
              (click)="clear()"
              [disabled]="!activeCount()"
            >
              Clear
            </button>
          </div>
        </div>
      } @else if (activeCount()) {
        <button class="chip on summary" type="button" (click)="open.set(true)">
          <app-icon name="filter" /> {{ summary() }} · {{ shown() }} of
          {{ data().sessions.length }}
        </button>
      }

      @if (loaded() && !data().sessions.length) {
        <div class="empty">
          <img src="logo.svg" alt="" />
          <h2>No sessions yet</h2>
          <p>
            Start a session with the + button, or bring your history over from MyTargets, MantisX or
            3D SKill Board (under More).
          </p>
          <div class="row wrap" style="justify-content:center">
            <a class="btn" routerLink="/import/mytargets">Import MyTargets backup</a>
            <a class="btn" routerLink="/import/mantisx">Import MantisX</a>
          </div>
        </div>
      } @else if (loaded() && !shown()) {
        <div class="empty">
          <p>No sessions match the filter.</p>
          <button class="btn" type="button" (click)="clear()">Clear filter</button>
        </div>
      }
      @for (g of groups(); track g.month) {
        <div class="section-title">{{ g.month }}</div>
        <div class="card flush">
          <ul class="list">
            @for (r of g.rows; track r.t.id) {
              <li>
                <a class="item" [routerLink]="['/session', r.t.id]">
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
    <a class="fab" routerLink="/session/new" aria-label="New session"><app-icon name="add" /></a>
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
    .filters {
      display: grid;
      gap: 10px;
    }
    .filter-btn {
      position: relative;
    }
    .badge {
      position: absolute;
      top: 4px;
      right: 2px;
      min-width: 17px;
      height: 17px;
      border-radius: 9px;
      background: var(--gold);
      color: #1d1d1d;
      font: 700 11px/17px var(--font);
      text-align: center;
    }
    .summary {
      justify-self: start;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      --icon-size: 16px;
    }
  `,
})
export class SessionsPage {
  private readonly repo = inject(Repo);
  protected readonly pct = pct;
  protected readonly avg = avg;
  protected readonly kinds: TargetKind[] = ['target', 'field', '3d'];
  protected readonly kindLabel = KIND_LABEL;

  protected readonly open = signal(false);
  protected readonly filter = signal<Filter>(NO_FILTER);

  protected readonly data = live(
    async () => {
      const [sessions, bows, rounds] = await Promise.all([
        this.repo.sessionsNewestFirst(),
        db.bows.toArray(),
        db.rounds.toArray(),
      ]);
      return { sessions, bows, rounds, loaded: true };
    },
    {
      sessions: [] as Session[],
      bows: [] as Bow[],
      rounds: [] as Round[],
      loaded: false,
    },
  );
  protected readonly loaded = computed(() => this.data().loaded);
  protected readonly bows = computed(() => this.data().bows);

  constructor() {
    this.repo.getSetting<Filter>('sessionFilter', NO_FILTER).then((f) => {
      this.filter.set({ ...NO_FILTER, ...f });
    });
  }

  protected set(p: Partial<Filter>) {
    this.filter.update((f) => ({ ...f, ...p }));
    this.repo.setSetting('sessionFilter', this.filter());
  }
  protected clear() {
    this.filter.set(NO_FILTER);
    this.repo.setSetting('sessionFilter', NO_FILTER);
  }

  /** Fixed ranges plus every year that has sessions. */
  protected readonly periods = computed(() => {
    const years = [...new Set(this.data().sessions.map((t) => t.date.slice(0, 4)))]
      .sort()
      .reverse();
    return [
      { key: 'all', label: 'All time' },
      { key: '30', label: 'Last 30 days' },
      { key: '90', label: 'Last 90 days' },
      { key: '365', label: 'Last 12 months' },
      ...years.map((y) => ({ key: `y${y}`, label: y })),
    ];
  });

  protected readonly activeCount = computed(() => {
    const f = this.filter();
    return [f.q.trim(), f.period !== 'all', f.kind !== 'all', f.bowId].filter(Boolean).length;
  });

  protected readonly summary = computed(() => {
    const f = this.filter();
    return [
      f.q.trim() ? `“${f.q.trim()}”` : '',
      f.period !== 'all' ? this.periods().find((p) => p.key === f.period)?.label : '',
      f.kind !== 'all' ? KIND_LABEL[f.kind] : '',
      f.bowId ? this.bows().find((b) => b.id === f.bowId)?.name : '',
    ]
      .filter(Boolean)
      .join(' · ');
  });

  /** Kinds of face shot in each session. */
  private readonly kindsBySession = computed(() => {
    const m = new Map<number, Set<TargetKind>>();
    for (const r of this.data().rounds) {
      let s = m.get(r.sessionId);
      if (!s) m.set(r.sessionId, (s = new Set()));
      s.add(getTarget(r.targetId).kind);
    }
    return m;
  });

  private readonly visible = computed(() => {
    const f = this.filter();
    const q = f.q.trim().toLowerCase();
    let from = '';
    let to = '9999';
    if (f.period.startsWith('y')) {
      from = `${f.period.slice(1)}-01-01`;
      to = `${f.period.slice(1)}-12-31`;
    } else if (f.period !== 'all') {
      const d = new Date();
      d.setDate(d.getDate() - Number(f.period));
      from = d.toISOString().slice(0, 10);
      to = todayIso();
    }
    return this.data().sessions.filter(
      (t) =>
        t.date >= from &&
        t.date <= to &&
        (!q || t.title.toLowerCase().includes(q) || t.location.toLowerCase().includes(q)) &&
        (f.kind === 'all' || !!this.kindsBySession().get(t.id!)?.has(f.kind)) &&
        (!f.bowId || t.bowId === f.bowId),
    );
  });
  protected readonly shown = computed(() => this.visible().length);

  protected readonly groups = computed(() => {
    const { bows, rounds } = this.data();
    const bowName = new Map(bows.map((b) => [b.id, b.name]));
    const dists = new Map<number, string[]>();
    for (const r of rounds) {
      const l = dists.get(r.sessionId) ?? [];
      const d = formatDimension(r.distance);
      if (d && !l.includes(d)) l.push(d);
      dists.set(r.sessionId, l);
    }
    const out: { month: string; rows: Row[] }[] = [];
    for (const t of this.visible()) {
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
