import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  backupFileName,
  BackupSummary,
  createBackup,
  inspectBackup,
  restoreBackup,
  saveFile,
} from '../core/import/backup';
import { Repo } from '../core/repo.service';
import { applyTheme, getTheme, Theme } from '../core/theme';
import { AppBar } from '../ui/app-bar';
import { Icon } from '../ui/icon';
import { InstallCard } from '../ui/install-card';
import { APP_VERSION } from '../version';

@Component({
  selector: 'app-more',
  imports: [AppBar, RouterLink, Icon, InstallCard],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-bar title="More" />
    <div class="page">
      <app-install-card />
      <div class="section-title">Import</div>
      <div class="card flush">
        <ul class="list">
          <li>
            <a class="item" routerLink="/import/mytargets"
              ><app-icon name="upload" />
              <div class="main">
                <div class="title">MyTargets backup</div>
                <div class="sub">Sessions, bows, arrows and photos from a MyTargets .zip</div>
              </div>
              <app-icon name="chevron" class="muted"
            /></a>
          </li>
          <li>
            <a class="item" routerLink="/import/mantisx"
              ><app-icon name="upload" />
              <div class="main">
                <div class="title">MantisX sessions</div>
                <div class="sub">Shots with positions from a MantisX CSV export</div>
              </div>
              <app-icon name="chevron" class="muted"
            /></a>
          </li>
          <li>
            <a class="item" routerLink="/import/scoresheet"
              ><app-icon name="upload" />
              <div class="main">
                <div class="title">Handwritten scoresheet</div>
                <div class="sub">Let an AI read a photo of the sheet, then import its answer</div>
              </div>
              <app-icon name="chevron" class="muted"
            /></a>
          </li>
          <li>
            <a class="item" routerLink="/import/archdps"
              ><app-icon name="upload" />
              <div class="main">
                <div class="title">3D SKill Board backup</div>
                <div class="sub">3D, field and target sessions from an archDPS .zip</div>
              </div>
              <app-icon name="chevron" class="muted"
            /></a>
          </li>
        </ul>
      </div>

      <div class="section-title">Backup</div>
      <div class="card" style="display:grid;gap:10px">
        <p class="small muted" style="margin:0">
          Your data lives only on this device, in this browser. Export a backup now and then and
          keep it somewhere safe (Drive, iCloud, e-mail). Clearing site data or uninstalling the app
          deletes everything.
        </p>
        <div class="row wrap">
          <button class="btn primary" type="button" (click)="exportBackup()" [disabled]="busy()">
            <app-icon name="download" /> Export backup
          </button>
          <label class="btn"
            ><app-icon name="upload" /> Restore backup
            <input type="file" accept=".zip,application/zip" hidden (change)="pickRestore($event)"
          /></label>
        </div>
        @if (msg(); as m) {
          <div class="notice small" [class.err]="m.err" [class.ok]="!m.err">{{ m.text }}</div>
        }
      </div>

      <div class="section-title">Settings</div>
      <div class="card" style="display:grid;gap:12px">
        <div class="row">
          <span style="flex:1">Theme</span>
          <div class="seg">
            @for (t of themes; track t) {
              <button type="button" [class.on]="theme() === t" (click)="setTheme(t)">
                {{ t[0].toUpperCase() + t.slice(1) }}
              </button>
            }
          </div>
        </div>
        <div class="row">
          <span style="flex:1">Zoom while placing arrows</span>
          <div class="seg">
            @for (z of zooms; track z) {
              <button type="button" [class.on]="zoom() === z" (click)="setZoom(z)">
                {{ z === 1 ? 'Off' : z + '×' }}
              </button>
            }
          </div>
        </div>
        <div class="row">
          <span style="flex:1">Storage</span>
          <span class="small" [class.muted]="!persisted()"
            >{{ persisted() ? 'Protected' : 'Best effort'
            }}{{ usage() ? ' · ' + usage() : '' }}</span
          >
        </div>
        @if (!persisted()) {
          <p class="small muted" style="margin:0">
            The browser may clear "best effort" storage when the device is low on space. Installing
            ArrowPlot to the home screen usually makes it protected.
            <button class="btn sm" type="button" (click)="persist()">Ask to protect</button>
          </p>
        }
      </div>

      <div class="section-title">Tools</div>
      <div class="card flush">
        <ul class="list">
          <li>
            <a class="item" routerLink="/timer"
              ><app-icon name="timer" />
              <div class="main">
                <div class="title">Shooting timer</div>
                <div class="sub">Walk-up, shooting time and warning, with sound</div>
              </div>
              <app-icon name="chevron" class="muted"
            /></a>
          </li>
        </ul>
      </div>

      <div class="section-title">About</div>
      <div class="card small" style="display:grid;gap:6px">
        <div class="row">
          <img src="logo.svg" width="40" height="40" alt="" />
          <div>
            <b>ArrowPlot</b>
            <div class="muted">Version {{ version.sha }} · {{ version.builtAt }}</div>
          </div>
        </div>
        <p style="margin:0">
          Archery score keeping with arrow plotting. Reads backups from the
          <a href="https://github.com/DreierF/MyTargets" target="_blank" rel="noopener"
            >MyTargets</a
          >
          app and shot exports from MantisX. ArrowPlot is not affiliated with either.
        </p>
        <p style="margin:0">
          Open source under the MIT license ·
          <a href="https://github.com/mrj9600/ArrowPlot" target="_blank" rel="noopener"
            >Source on GitHub</a
          >
        </p>
      </div>
    </div>

    <dialog #dlg (close)="pending.set(null)">
      @if (pending(); as p) {
        <h3>Restore this backup?</h3>
        <p class="small">
          Made {{ when(p.createdAt) }} · {{ p.sessions }} sessions, {{ p.bows }} bows,
          {{ p.arrows }} arrows, {{ p.images }} photos.
        </p>
        <p class="notice warn small">
          This replaces everything currently in ArrowPlot. Export a backup first if you want to keep
          it.
        </p>
        <div class="row" style="justify-content:flex-end">
          <button class="btn" type="button" (click)="dlg.close()">Cancel</button>
          <button class="btn primary" type="button" (click)="doRestore(); dlg.close()">
            Replace my data
          </button>
        </div>
      }
    </dialog>
  `,
})
export class MorePage {
  private readonly repo = inject(Repo);
  protected readonly version = APP_VERSION;
  protected readonly themes: Theme[] = ['system', 'light', 'dark'];
  protected readonly theme = signal<Theme>(getTheme());
  protected readonly zooms = [1, 2, 3, 4];
  protected readonly zoom = signal(3);
  protected readonly busy = signal(false);
  protected readonly msg = signal<{ text: string; err?: boolean } | null>(null);
  protected readonly pending = signal<(BackupSummary & { file: File }) | null>(null);
  protected readonly persisted = signal(false);
  protected readonly usage = signal('');

  constructor() {
    this.refreshStorage();
    this.repo.getSetting('inputZoom', 3).then((z) => this.zoom.set(z));
  }

  private async refreshStorage() {
    try {
      this.persisted.set((await navigator.storage?.persisted?.()) ?? false);
      const e = await navigator.storage?.estimate?.();
      if (e?.usage !== undefined) this.usage.set(`${(e.usage / 1024 / 1024).toFixed(1)} MB used`);
    } catch {
      /* unsupported */
    }
  }

  protected async persist() {
    try {
      await navigator.storage?.persist?.();
    } catch {
      /* unsupported */
    }
    this.refreshStorage();
  }

  protected when(iso: string) {
    const d = new Date(iso);
    return isNaN(d.getTime())
      ? 'at an unknown time'
      : d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  }

  protected setZoom(z: number) {
    this.zoom.set(z);
    this.repo.setSetting('inputZoom', z);
  }

  protected setTheme(t: Theme) {
    this.theme.set(t);
    applyTheme(t);
  }

  protected async exportBackup() {
    this.busy.set(true);
    this.msg.set(null);
    try {
      const name = backupFileName();
      const how = await saveFile(await createBackup(), name);
      await this.repo.setSetting('lastBackup', new Date().toISOString());
      this.msg.set({
        text: how === 'shared' ? `Shared ${name}.` : `Saved ${name} to your downloads.`,
      });
    } catch (e) {
      if ((e as Error).name !== 'AbortError')
        this.msg.set({ text: `Export failed: ${(e as Error).message}`, err: true });
    } finally {
      this.busy.set(false);
    }
  }

  protected async pickRestore(e: Event) {
    const input = e.target as HTMLInputElement;
    const f = input.files?.[0];
    input.value = '';
    if (!f) return;
    this.msg.set(null);
    try {
      this.pending.set(await inspectBackup(f));
      (document.querySelector('app-more dialog') as HTMLDialogElement).showModal();
    } catch (err) {
      this.msg.set({ text: (err as Error).message, err: true });
    }
  }

  protected async doRestore() {
    const p = this.pending();
    if (!p) return;
    this.busy.set(true);
    try {
      await restoreBackup(p.file);
      this.msg.set({ text: `Restored ${p.sessions} sessions.` });
    } catch (err) {
      this.msg.set({
        text: `Restore failed, nothing was changed: ${(err as Error).message}`,
        err: true,
      });
    } finally {
      this.busy.set(false);
    }
  }
}
