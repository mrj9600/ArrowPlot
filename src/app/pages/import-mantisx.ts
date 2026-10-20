import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dim } from '../core/dimension';
import { fmtDate } from '../core/format';
import {
  addPositionsToSession,
  annotateSessions,
  createSessionFromMantis,
  MantisImportOptions,
  MantisSession,
  parseMantis,
  planSession,
} from '../core/import/mantisx';
import { Arrow, Bow, LengthUnit } from '../core/models';
import { Repo } from '../core/repo.service';
import { getTarget } from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';

type Action = 'new' | 'positions' | 'skip';

@Component({
  selector: 'app-import-mantisx',
  imports: [AppBar, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Import MantisX" back="/more" />
    <div class="page">
      <div class="card" style="display:grid;gap:10px">
        <p style="margin:0">
          Export your shots from the MantisX app as CSV and pick the file here. Each session can
          become a new session, or give arrow positions to a session you entered as scores only
          (same day, same scores).
        </p>
        <label class="btn primary" style="justify-self:start"
          ><app-icon name="upload" /> Choose CSV file
          <input type="file" accept=".csv,text/csv,text/plain" hidden (change)="pick($event)"
        /></label>
        @if (error()) {
          <div class="notice err small">{{ error() }}</div>
        }
      </div>

      @if (sessions().length) {
        <div class="card" style="display:grid;gap:12px">
          <h3>Settings for new sessions</h3>
          <div class="grid2 stack">
            <label class="field"
              ><span>Title</span
              ><input
                class="input"
                [value]="opt().title"
                (input)="patch({ title: $any($event.target).value })"
            /></label>
            <label class="field"
              ><span>Distance</span>
              <div class="row">
                <input
                  class="input"
                  type="number"
                  inputmode="decimal"
                  [value]="opt().distance.value"
                  (input)="setDistance(+$any($event.target).value)"
                />
                <select
                  class="input"
                  style="width:72px;flex:none"
                  (change)="setUnit($any($event.target).value)"
                >
                  <option value="m" [selected]="opt().distance.unit === 'm'">m</option>
                  <option value="yd" [selected]="opt().distance.unit === 'yd'">yd</option>
                </select>
              </div>
            </label>
            <label class="field"
              ><span>Bow</span>
              <select class="input" (change)="patch({ bowId: +$any($event.target).value || null })">
                <option value="">No bow</option>
                @for (b of bows(); track b.id) {
                  <option [value]="b.id" [selected]="b.id === opt().bowId">{{ b.name }}</option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Arrows</span>
              <select class="input" (change)="setArrow(+$any($event.target).value || null)">
                <option value="">No arrows (5 mm assumed)</option>
                @for (a of arrows(); track a.id) {
                  <option [value]="a.id" [selected]="a.id === opt().arrowId">{{ a.name }}</option>
                }
              </select>
            </label>
            <label class="field"
              ><span>WA face size</span>
              <select class="input" (change)="patch({ faceCm: +$any($event.target).value })">
                @for (s of faceSizes; track s) {
                  <option [value]="s" [selected]="s === opt().faceCm">{{ s }} cm</option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Scoring</span>
              <select class="input" (change)="patch({ scoringStyle: +$any($event.target).value })">
                @for (s of styles; track $index) {
                  <option [value]="$index" [selected]="$index === opt().scoringStyle">
                    {{ s.name }}
                  </option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Arrows per end</span>
              <input
                class="input"
                type="number"
                min="1"
                max="12"
                [value]="opt().shotsPerEnd"
                (input)="
                  patch({ shotsPerEnd: Math.min(12, Math.max(1, +$any($event.target).value || 3)) })
                "
              />
            </label>
          </div>
          <label class="check small"
            ><input
              type="checkbox"
              [checked]="opt().keepMantisScore"
              (change)="patch({ keepMantisScore: $any($event.target).checked })"
            />
            Keep MantisX's score: nudge arrows sitting on a line (by a millimetre or two) so they
            keep the ring MantisX gave them. Unticked, line cutters score the higher ring like in
            MyTargets.</label
          >
        </div>

        <div class="section-title">{{ sessions().length }} sessions</div>
        <div class="card flush">
          <ul class="list">
            @for (s of rows(); track s.s.sid) {
              <li class="item sess">
                <div class="main">
                  <div class="title">{{ fmtDate(s.s.date, true) }} · {{ time(s.s) }}</div>
                  <div class="sub">
                    {{ s.s.shots.length }} arrows with position{{
                      s.s.totalRows > s.s.shots.length ? ' (of ' + s.s.totalRows + ')' : ''
                    }}
                    · MantisX {{ s.plan.mantisPoints }} → here {{ s.plan.reached }}/{{
                      s.plan.total
                    }}
                  </div>
                  @if (s.s.imported) {
                    <div class="sub warn">Already imported as “{{ s.s.imported.title }}”</div>
                  }
                  @if (!s.s.imported && skippedBefore().has(s.s.sid)) {
                    <div class="sub">Skipped last time</div>
                  }
                  @if (s.s.match) {
                    <div class="sub good">Matches “{{ s.s.match.title }}” (scores only)</div>
                  }
                  @if (s.plan.leftOut) {
                    <div class="sub">
                      {{
                        s.plan.leftOut === 1
                          ? "The last arrow doesn't fill an end and is"
                          : 'The last ' + s.plan.leftOut + " arrows don't fill an end and are"
                      }}
                      left out.
                    </div>
                  }
                </div>
                <select class="input act" (change)="setAction(s.s.sid, $any($event.target).value)">
                  <option value="new" [selected]="s.action === 'new'">New session</option>
                  @if (s.s.match) {
                    <option value="positions" [selected]="s.action === 'positions'">
                      Add positions
                    </option>
                  }
                  <option value="skip" [selected]="s.action === 'skip'">Skip</option>
                </select>
              </li>
            }
          </ul>
        </div>
        <button
          class="btn primary block"
          type="button"
          (click)="run()"
          [disabled]="busy() || !toDo()"
        >
          Import {{ toDo() }} session{{ toDo() === 1 ? '' : 's' }}
        </button>
      }
      @if (done()) {
        <div class="notice ok">{{ done() }} <a routerLink="/">Go to sessions</a></div>
      }
    </div>
  `,
  styles: `
    .sess {
      align-items: flex-start;
      cursor: default;
    }
    .sess .sub {
      white-space: normal;
    }
    .act {
      width: 150px;
      flex: none;
    }
    .warn {
      color: #a06800;
    }
    .good {
      color: var(--good);
    }
  `,
})
export class ImportMantisPage {
  private readonly repo = inject(Repo);
  protected readonly Math = Math;
  protected readonly fmtDate = fmtDate;
  protected readonly faceSizes = [40, 60, 80, 122];
  protected readonly styles = getTarget(0).styles;
  protected readonly bows = signal<Bow[]>([]);
  protected readonly arrows = signal<Arrow[]>([]);
  protected readonly sessions = signal<MantisSession[]>([]);
  protected readonly actions = signal<Record<string, Action>>({});
  /** Sessions the user chose to skip in earlier imports; they start as Skip next time. */
  protected readonly skippedBefore = signal(new Set<string>());
  protected readonly error = signal('');
  protected readonly done = signal('');
  protected readonly busy = signal(false);
  protected readonly opt = signal<MantisImportOptions>({
    title: 'MantisX',
    bowId: null,
    arrowId: null,
    arrowDiameter: null,
    distance: dim(18, 'm'),
    faceCm: 40,
    scoringStyle: 0,
    shotsPerEnd: 3,
    keepMantisScore: true,
  });

  protected readonly rows = computed(() =>
    this.sessions().map((s) => ({
      s,
      plan: planSession(s, this.opt()),
      action: this.actions()[s.sid] ?? 'skip',
    })),
  );
  protected readonly toDo = computed(() => this.rows().filter((r) => r.action !== 'skip').length);

  constructor() {
    this.init();
  }

  private async init() {
    const [bows, arrows] = await Promise.all([this.repo.bows(), this.repo.arrows()]);
    this.bows.set(bows);
    this.arrows.set(arrows);
    const saved = await this.repo.getSetting<Partial<MantisImportOptions>>('mantisOptions', {});
    const last = await this.repo.getSetting<{ bowId?: number; arrowId?: number }>(
      'lastSession',
      {},
    );
    const o = { ...this.opt(), bowId: last.bowId ?? null, arrowId: last.arrowId ?? null, ...saved };
    o.arrowDiameter = arrows.find((a) => a.id === o.arrowId)?.diameter ?? null;
    this.opt.set(o);
  }

  protected patch(p: Partial<MantisImportOptions>) {
    this.opt.update((o) => ({ ...o, ...p }));
  }
  protected setArrow(id: number | null) {
    this.patch({
      arrowId: id,
      arrowDiameter: this.arrows().find((a) => a.id === id)?.diameter ?? null,
    });
  }
  protected setDistance(v: number) {
    if (isFinite(v) && v > 0) this.patch({ distance: dim(v, this.opt().distance.unit) });
  }
  protected setUnit(u: LengthUnit) {
    this.patch({ distance: dim(this.opt().distance.value, u) });
  }
  protected setAction(sid: string, a: Action) {
    this.actions.update((m) => ({ ...m, [sid]: a }));
    // Remember skips right away, so skipping everything and leaving also counts.
    const s = this.sessions().find((x) => x.sid === sid);
    if (!s || s.imported) return;
    const next = new Set(this.skippedBefore());
    if (a === 'skip') next.add(sid);
    else next.delete(sid);
    this.skippedBefore.set(next);
    this.repo.setSetting('mantisSkipped', [...next]);
  }
  protected time(s: MantisSession) {
    return s.start.toTimeString().slice(0, 5);
  }

  protected async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.error.set('');
    this.done.set('');
    try {
      const sessions = parseMantis(await f.text());
      if (!sessions.length)
        throw new Error('No shots with a target position were found in this file.');
      await annotateSessions(sessions);
      const skipped = new Set(await this.repo.getSetting<string[]>('mantisSkipped', []));
      this.skippedBefore.set(skipped);
      const actions: Record<string, Action> = {};
      for (const s of sessions)
        actions[s.sid] = s.imported || skipped.has(s.sid) ? 'skip' : s.match ? 'positions' : 'new';
      this.actions.set(actions);
      this.sessions.set(sessions);
    } catch (err) {
      this.sessions.set([]);
      this.error.set((err as Error).message);
    }
  }

  protected async run() {
    this.busy.set(true);
    this.error.set('');
    let created = 0;
    let updated = 0;
    const o = this.opt();
    try {
      for (const r of this.rows()) {
        if (r.action === 'new' && r.plan.ends.length) {
          await createSessionFromMantis(r.s, o, this.repo);
          created++;
        } else if (r.action === 'positions') {
          await addPositionsToSession(r.s, this.repo);
          updated++;
        }
      }
      const { title, distance, faceCm, scoringStyle, shotsPerEnd, keepMantisScore } = o;
      await this.repo.setSetting('mantisOptions', {
        title,
        distance,
        faceCm,
        scoringStyle,
        shotsPerEnd,
        keepMantisScore,
      });
      this.done.set(
        `Created ${created} session${created === 1 ? '' : 's'}${updated ? ` and added positions to ${updated}` : ''}.`,
      );
      this.sessions.set([]);
    } catch (err) {
      this.error.set(`Import stopped: ${(err as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }
}
