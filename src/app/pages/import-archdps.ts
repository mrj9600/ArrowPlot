import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { dim } from '../core/dimension';
import { fmtDate } from '../core/format';
import {
  ArchDpsFile,
  existingArchRefs,
  importArchDps,
  planArchDps,
  readArchDps,
} from '../core/import/archdps';
import { LengthUnit } from '../core/models';
import { Repo } from '../core/repo.service';
import { getTarget } from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-import-archdps',
  imports: [AppBar, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Import 3D SKill Board" back="/more" />
    <div class="page">
      <div class="card" style="display:grid;gap:10px">
        <p style="margin:0">
          Pick a backup from the <b>3D SKill Board</b> app by 3DTurnier (named like
          <code>archDPS_2026-10-20.zip</code>). A bare <code>archDPS.sqlite</code> also works.
        </p>
        <p class="small muted" style="margin:0">
          Only scores are imported. Other archers, GPS tracks and the course directory in the backup
          are left out. The file is read on this device only.
        </p>
        <label class="btn primary" style="justify-self:start"
          ><app-icon name="upload" /> Choose backup file
          <input
            type="file"
            accept=".zip,.sqlite,application/zip,application/octet-stream"
            hidden
            (change)="pick($event)"
        /></label>
        @if (busy()) {
          <div class="notice small">{{ busy() }}</div>
        }
        @if (error()) {
          <div class="notice err small">{{ error() }}</div>
        }
      </div>

      @if (file(); as f) {
        <div class="card" style="display:grid;gap:12px">
          <h3 style="margin:0">{{ f.fileName }}</h3>
          @if (f.players.length > 1) {
            <label class="field"
              ><span>Whose scores?</span>
              <select class="input" (change)="playerId.set(+$any($event.target).value)">
                @for (p of f.players; track p.id) {
                  <option [value]="p.id" [selected]="p.id === playerId()">
                    {{ p.name }} · {{ p.sessions }} sessions
                  </option>
                }
              </select>
            </label>
          }
          @if (plan(); as p) {
            <div class="stats-grid">
              <div class="stat">
                <div class="k">Sessions</div>
                <div class="v">{{ p.planned.length }}</div>
                <div class="h">{{ range() }}</div>
              </div>
              <div class="stat">
                <div class="k">Arrows</div>
                <div class="v">{{ arrows() }}</div>
                <div class="h">{{ positioned() }} with position</div>
              </div>
              <div class="stat">
                <div class="k">Scores checked</div>
                <div class="v">{{ matching() }} / {{ p.planned.length }}</div>
                <div class="h">same total as 3D SKill Board</div>
              </div>
            </div>
            <table class="tbl">
              <thead>
                <tr>
                  <th>Scoring in 3D SKill Board</th>
                  <th>Sessions</th>
                </tr>
              </thead>
              <tbody>
                @for (t of p.byType; track t.label) {
                  <tr>
                    <td>{{ t.label }}</td>
                    <td>{{ t.sessions }}</td>
                  </tr>
                }
              </tbody>
            </table>
            @if (hasDisc()) {
              <div class="grid2">
                <label class="field"
                  ><span>10-ring sessions: distance</span>
                  <div class="row">
                    <input
                      class="input"
                      type="number"
                      inputmode="decimal"
                      [value]="discDistance()"
                      (input)="discDistance.set(+$any($event.target).value || 18)"
                    />
                    <select
                      class="input"
                      style="width:72px;flex:none"
                      (change)="discUnit.set($any($event.target).value)"
                    >
                      <option value="m" [selected]="discUnit() === 'm'">m</option>
                      <option value="yd" [selected]="discUnit() === 'yd'">yd</option>
                    </select>
                  </div>
                </label>
                <label class="field"
                  ><span>Face size</span>
                  <select class="input" (change)="discSize.set(+$any($event.target).value)">
                    @for (s of faceSizes; track s) {
                      <option [value]="s" [selected]="s === discSize()">{{ s }} cm</option>
                    }
                  </select>
                </label>
              </div>
              <p class="small muted" style="margin:-4px 0 0">
                3D SKill Board doesn't store distances or face sizes, so these apply to all 10-ring
                sessions. 3D and field sessions get no distance.
              </p>
            }
            @if (p.skipped.length) {
              <p class="notice warn small" style="margin:0">
                {{ p.skipped.length }} session{{ p.skipped.length === 1 ? '' : 's' }} can't be
                imported ({{ skippedReasons() }}).
              </p>
            }
            @if (mismatches().length) {
              <details class="small">
                <summary>
                  {{ mismatches().length }} session{{ mismatches().length === 1 ? '' : 's' }} with a
                  different total
                </summary>
                <ul style="margin:6px 0 0;padding-left:18px">
                  @for (m of mismatches(); track m.session.ref) {
                    <li>
                      {{ fmtDate(m.session.date) }} {{ m.session.name }}: here {{ m.reached }}, 3D
                      SKill Board {{ m.session.total }}
                    </li>
                  }
                </ul>
              </details>
            }
            @if (existing()) {
              <div class="notice small">
                {{ existing() }} of these sessions were imported before and are skipped.
              </div>
            }
            <button
              class="btn primary"
              type="button"
              (click)="run()"
              [disabled]="!!busy() || !toImport()"
            >
              Import {{ toImport() }} session{{ toImport() === 1 ? '' : 's' }}
            </button>
          }
        </div>
      }

      @if (done()) {
        <div class="notice ok">{{ done() }} <a routerLink="/">Go to sessions</a></div>
      }
    </div>
  `,
})
export class ImportArchDpsPage {
  private readonly repo = inject(Repo);
  protected readonly fmtDate = fmtDate;
  protected readonly faceSizes = getTarget(0).diameters.map((d) => d.value);

  protected readonly file = signal<ArchDpsFile | null>(null);
  protected readonly refs = signal(new Set<string>());
  protected readonly playerId = signal(0);
  protected readonly discDistance = signal(18);
  protected readonly discUnit = signal<LengthUnit>('m');
  protected readonly discSize = signal(40);
  protected readonly busy = signal('');
  protected readonly error = signal('');
  protected readonly done = signal('');

  protected readonly plan = computed(() => {
    const f = this.file();
    return f ? planArchDps(f, this.playerId(), this.refs()) : null;
  });
  protected readonly range = computed(() => {
    const l = this.plan()?.planned ?? [];
    return l.length ? `${fmtDate(l[0].session.date)} – ${fmtDate(l.at(-1)!.session.date)}` : '';
  });
  protected readonly arrows = computed(() =>
    (this.plan()?.planned ?? []).reduce(
      (a, p) => a + p.ends.reduce((b, e) => b + e.shots.length, 0),
      0,
    ),
  );
  protected readonly positioned = computed(() =>
    (this.plan()?.planned ?? []).reduce(
      (a, p) => a + p.ends.filter((e) => e.exact).reduce((b, e) => b + e.shots.length, 0),
      0,
    ),
  );
  protected readonly matching = computed(
    () => (this.plan()?.planned ?? []).filter((p) => p.matches).length,
  );
  protected readonly mismatches = computed(() =>
    (this.plan()?.planned ?? []).filter((p) => !p.matches),
  );
  protected readonly existing = computed(
    () => (this.plan()?.planned ?? []).filter((p) => p.exists).length,
  );
  protected readonly toImport = computed(
    () => (this.plan()?.planned ?? []).filter((p) => !p.exists).length,
  );
  protected readonly hasDisc = computed(() =>
    (this.plan()?.planned ?? []).some((p) => p.type.diameter === null),
  );
  protected readonly skippedReasons = computed(() =>
    [...new Set((this.plan()?.skipped ?? []).map((s) => s.reason))].join(', '),
  );

  protected async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.file.set(null);
    this.error.set('');
    this.done.set('');
    this.busy.set(`Reading ${f.name} …`);
    try {
      const data = await readArchDps(f);
      if (!data.players.length) throw new Error('No scores were found in this backup.');
      this.refs.set(await existingArchRefs());
      this.playerId.set(data.players[0].id);
      this.file.set(data);
    } catch (err) {
      console.error(err);
      this.error.set((err as Error).message || String(err));
    } finally {
      this.busy.set('');
    }
  }

  protected async run() {
    const p = this.plan();
    if (!p) return;
    this.busy.set('Importing …');
    this.error.set('');
    try {
      const n = await importArchDps(
        p,
        {
          discDistance: dim(this.discDistance(), this.discUnit()),
          discDiameter: dim(this.discSize(), 'cm'),
        },
        this.repo,
      );
      this.done.set(`Imported ${n} session${n === 1 ? '' : 's'}.`);
      this.file.set(null);
    } catch (err) {
      console.error(err);
      this.error.set(`Import stopped: ${(err as Error).message}`);
    } finally {
      this.busy.set('');
    }
  }
}
