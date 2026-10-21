import { ChangeDetectionStrategy, Component, computed, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { formatDimension } from '../core/dimension';
import { extractJson, importSheet, planSheet, SheetPlan } from '../core/import/scoresheet';
import { scoresheetPrompt } from '../core/import/scoresheet-prompt';
import { Arrow, Bow } from '../core/models';
import { Repo } from '../core/repo.service';
import { faceLabel } from '../core/targets';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';

type EditField = 'date' | 'title' | 'location';

@Component({
  selector: 'app-import-scoresheet',
  imports: [AppBar, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Import scoresheet" back="/more" />
    <div class="page">
      <div class="card" style="display:grid;gap:10px">
        <h3 style="margin:0">1. Let an AI read the sheet</h3>
        <p style="margin:0">
          Give an AI chat (Claude, ChatGPT, …) a photo of the scoresheet together with these
          instructions. It answers with JSON that ArrowPlot can import.
        </p>
        <div class="row" style="gap:8px;flex-wrap:wrap">
          <button class="btn primary" type="button" (click)="copyPrompt()">
            {{ copied() ? 'Copied' : 'Copy instructions' }}
          </button>
          <button class="btn" type="button" (click)="downloadPrompt()">Download as .md</button>
        </div>
        <p class="small muted" style="margin:0">
          The photo goes to the AI service you choose, not to ArrowPlot. Check the result before
          importing: handwriting is easy to misread.
        </p>
      </div>

      <div class="card" style="display:grid;gap:10px">
        <h3 style="margin:0">2. Paste the answer</h3>
        <textarea
          class="input answer"
          placeholder="Paste the AI's whole answer here"
          [value]="text()"
          (input)="setText($any($event.target).value)"
        ></textarea>
        <label class="btn" style="justify-self:start"
          ><app-icon name="upload" /> Or choose a .json file
          <input
            type="file"
            accept=".json,.txt,application/json,text/plain"
            hidden
            (change)="pick($event)"
        /></label>
        @if (error()) {
          <div class="notice err small">{{ error() }}</div>
        }
      </div>

      @if (plan(); as p) {
        <div class="card" style="display:grid;gap:12px">
          <h3 style="margin:0">3. Check and import</h3>
          @for (s of p.sessions; track $index) {
            <div class="sess">
              @let i = $index;
              <div class="grid2 stack">
                <label class="field"
                  ><span>Date</span>
                  <input
                    class="input"
                    type="date"
                    [value]="s.date"
                    (input)="edit(i, 'date', $any($event.target).value)"
                  />
                </label>
                <label class="field"
                  ><span>Title</span>
                  <input
                    class="input"
                    [value]="s.title"
                    (input)="edit(i, 'title', $any($event.target).value)"
                  />
                </label>
              </div>
              <label class="field"
                ><span>Location</span>
                <input
                  class="input"
                  [value]="s.location"
                  (input)="edit(i, 'location', $any($event.target).value)"
                />
              </label>
              @for (r of s.rounds; track $index) {
                <div class="small">
                  {{ roundText(r) }}
                  <div [class.bad]="r.writtenTotal !== null && r.writtenTotal !== r.reached">
                    {{ r.ends.length }} ends · {{ r.reached }} points{{
                      r.writtenTotal !== null
                        ? r.writtenTotal === r.reached
                          ? ' (same as the sheet)'
                          : ' (sheet says ' + r.writtenTotal + ')'
                        : ''
                    }}
                  </div>
                  @for (m of r.endMismatches; track m) {
                    <div class="bad">{{ m }}</div>
                  }
                  @if (r.fromTotals) {
                    <div class="muted">
                      {{ r.fromTotals }} end{{ r.fromTotals === 1 ? '' : 's' }} from totals only:
                      the arrows are spread out to match.
                    </div>
                  }
                </div>
              }
            </div>
          }
          @if (p.uncertain.length || p.problems.length) {
            <div class="notice warn small">
              <b>Please check</b>
              <ul>
                @for (u of p.uncertain; track $index) {
                  <li>{{ u }}</li>
                }
                @for (u of p.problems; track $index) {
                  <li>{{ u }}</li>
                }
              </ul>
            </div>
          }
          <div class="grid2 stack">
            <label class="field"
              ><span>Bow</span>
              <select class="input" (change)="bowId.set(+$any($event.target).value || null)">
                <option value="">No bow</option>
                @for (b of bows(); track b.id) {
                  <option [value]="b.id" [selected]="b.id === bowId()">{{ b.name }}</option>
                }
              </select>
            </label>
            <label class="field"
              ><span>Arrows</span>
              <select class="input" (change)="arrowId.set(+$any($event.target).value || null)">
                <option value="">No arrows</option>
                @for (a of arrows(); track a.id) {
                  <option [value]="a.id" [selected]="a.id === arrowId()">{{ a.name }}</option>
                }
              </select>
            </label>
          </div>
          <button
            class="btn primary"
            type="button"
            (click)="run()"
            [disabled]="busy() || !p.sessions.length"
          >
            Import {{ p.sessions.length }} session{{ p.sessions.length === 1 ? '' : 's' }}
          </button>
        </div>
      }

      @if (done().length) {
        <div class="notice ok">
          Imported.
          @for (id of done(); track id) {
            <a [routerLink]="['/session', id]">Open session</a>
          }
        </div>
      }
    </div>
  `,
  styles: `
    .answer {
      min-height: 140px;
      font-family: ui-monospace, monospace;
      font-size: 12px;
    }
    .sess {
      display: grid;
      gap: 4px;
      padding-bottom: 8px;
      border-bottom: 1px solid var(--line);
    }
    .bad {
      color: var(--bad, #c62828);
    }
    ul {
      margin: 4px 0 0;
      padding-left: 18px;
    }
  `,
})
export class ImportScoresheetPage {
  private readonly repo = inject(Repo);

  protected readonly text = signal('');
  protected readonly error = signal('');
  protected readonly busy = signal(false);
  protected readonly copied = signal(false);
  protected readonly done = signal<number[]>([]);
  protected readonly bows = signal<Bow[]>([]);
  protected readonly arrows = signal<Arrow[]>([]);
  protected readonly bowId = signal<number | null>(null);
  protected readonly arrowId = signal<number | null>(null);

  /** Date, title and location typed over what the sheet (or the AI) gave, per session. */
  private readonly edits = signal<Partial<Record<EditField, string>>[]>([]);
  private readonly read = computed<SheetPlan | null>(() => {
    const t = this.text().trim();
    if (!t) return null;
    try {
      return planSheet(extractJson(t));
    } catch {
      return null;
    }
  });
  protected readonly plan = computed<SheetPlan | null>(() => {
    const p = this.read();
    if (!p) return null;
    const e = this.edits();
    return { ...p, sessions: p.sessions.map((s, i) => ({ ...s, ...e[i] })) };
  });

  constructor() {
    void this.loadGear();
  }

  private async loadGear() {
    const [bows, arrows] = await Promise.all([this.repo.bows(), this.repo.arrows()]);
    this.bows.set(bows);
    this.arrows.set(arrows);
    if (bows.length === 1) this.bowId.set(bows[0].id!);
    if (arrows.length === 1) this.arrowId.set(arrows[0].id!);
  }

  protected edit(i: number, field: EditField, v: string) {
    if (field === 'date' && !v) return;
    this.edits.update((l) => {
      const next = [...l];
      next[i] = { ...next[i], [field]: field === 'date' ? v : v.trim() };
      return next;
    });
  }

  protected setText(v: string) {
    this.text.set(v);
    this.edits.set([]);
    this.done.set([]);
    this.error.set('');
    if (!v.trim()) return;
    try {
      planSheet(extractJson(v));
    } catch (e) {
      this.error.set((e as Error).message);
    }
  }

  protected async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (f) this.setText(await f.text());
  }

  protected async copyPrompt() {
    try {
      await navigator.clipboard.writeText(scoresheetPrompt());
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      this.downloadPrompt();
    }
  }

  protected downloadPrompt() {
    const blob = new Blob([scoresheetPrompt()], { type: 'text/markdown' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'arrowplot-scoresheet-instructions.md';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  protected roundText(r: SheetPlan['sessions'][number]['rounds'][number]) {
    return [
      formatDimension(r.distance),
      faceLabel(r.model.id, r.diameter),
      r.model.styles[r.style]?.name,
      `${r.shotsPerEnd} arrow${r.shotsPerEnd === 1 ? '' : 's'} per end`,
      r.startTarget > 1 ? `from target ${r.startTarget}` : '',
    ]
      .filter(Boolean)
      .join(' · ');
  }

  protected async run() {
    const p = this.plan();
    if (!p || this.busy()) return;
    this.busy.set(true);
    try {
      this.done.set(
        await importSheet(p, { bowId: this.bowId(), arrowId: this.arrowId() }, this.repo),
      );
      this.text.set('');
    } catch (e) {
      this.error.set(`Import stopped: ${(e as Error).message}`);
    } finally {
      this.busy.set(false);
    }
  }
}
