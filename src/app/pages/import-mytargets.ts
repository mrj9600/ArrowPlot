import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import { fmtDate } from '../core/format';
import {
  importMyTargets,
  MyTargetsPreview,
  MyTargetsResult,
  readMyTargetsBackup,
} from '../core/import/mytargets';
import { Repo } from '../core/repo.service';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';

@Component({
  selector: 'app-import-mytargets',
  imports: [AppBar, RouterLink, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="Import MyTargets" back="/more" />
    <div class="page">
      <div class="card" style="display:grid;gap:10px">
        <p style="margin:0">
          Pick a MyTargets backup file. MyTargets names them <code>MyTargets_backup_….zip</code>;
          you find them under Settings → Backup in MyTargets (saved to the phone's storage or Google
          Drive). A bare <code>data.db</code> also works.
        </p>
        <p class="small muted" style="margin:0">
          The file is read on this device only. Your MyTargets data is not changed.
        </p>
        <label class="btn primary" style="justify-self:start"
          ><app-icon name="upload" /> Choose backup file
          <input
            type="file"
            accept=".zip,.db,application/zip,application/octet-stream"
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

      @if (preview(); as p) {
        <div class="card" style="display:grid;gap:10px">
          <h3>{{ p.fileName }}</h3>
          <div class="stats-grid">
            <div class="stat">
              <div class="k">Sessions</div>
              <div class="v">{{ p.sessions.length }}</div>
              <div class="h">
                {{ p.firstDate ? fmtDate(p.firstDate) + ' – ' + fmtDate(p.lastDate!) : '' }}
              </div>
            </div>
            <div class="stat">
              <div class="k">Arrows shot</div>
              <div class="v">{{ p.shotCount }}</div>
            </div>
            <div class="stat">
              <div class="k">Bows / arrow sets</div>
              <div class="v">{{ p.bows.length }} / {{ p.arrows.length }}</div>
            </div>
            <div class="stat">
              <div class="k">Photos</div>
              <div class="v">{{ p.files.size }}</div>
            </div>
          </div>
          @if (p.existingCount) {
            <div class="notice small">
              {{ p.existingCount }} of these sessions were imported before.
              @if (p.newCount) {
                Only the {{ p.newCount }} new ones are added.
              } @else {
                There is nothing new to add.
              }
            </div>
            <label class="check small"
              ><input
                type="checkbox"
                [checked]="replace()"
                (change)="replace.set($any($event.target).checked)"
              />
              Replace the earlier imported copies with the versions in this file</label
            >
          }
          <button
            class="btn primary"
            type="button"
            (click)="run()"
            [disabled]="!!busy() || (!p.newCount && !replace())"
          >
            Import {{ replace() ? p.sessions.length : p.newCount }} sessions
          </button>
        </div>
      }

      @if (result(); as r) {
        <div class="notice ok">
          Imported {{ r.sessions }} sessions, {{ r.bows }} bows, {{ r.arrows }} arrow sets and
          {{ r.images }} photos.
          @if (r.skipped) {
            {{ r.skipped }} already imported sessions were skipped.
          }
          <a routerLink="/">Go to sessions</a>
        </div>
      }
    </div>
  `,
})
export class ImportMyTargetsPage {
  private readonly repo = inject(Repo);
  protected readonly fmtDate = fmtDate;
  protected readonly preview = signal<MyTargetsPreview | null>(null);
  protected readonly result = signal<MyTargetsResult | null>(null);
  protected readonly busy = signal('');
  protected readonly error = signal('');
  protected readonly replace = signal(false);

  protected async pick(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.preview.set(null);
    this.result.set(null);
    this.error.set('');
    this.busy.set(`Reading ${f.name} …`);
    try {
      this.preview.set(await readMyTargetsBackup(f));
    } catch (err) {
      console.error(err);
      this.error.set((err as Error).message || String(err));
    } finally {
      this.busy.set('');
    }
  }

  protected async run() {
    const p = this.preview();
    if (!p) return;
    this.busy.set('Importing …');
    this.error.set('');
    try {
      this.result.set(await importMyTargets(p, this.repo, this.replace()));
      this.preview.set(null);
    } catch (err) {
      console.error(err);
      this.error.set(`Import failed: ${(err as Error).message}`);
    } finally {
      this.busy.set('');
    }
  }
}
