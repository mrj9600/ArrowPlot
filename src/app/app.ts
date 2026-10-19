import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import {
  ActivatedRouteSnapshot,
  NavigationEnd,
  Router,
  RouterLink,
  RouterLinkActive,
  RouterOutlet,
} from '@angular/router';
import { SwUpdate } from '@angular/service-worker';
import { filter } from 'rxjs';
import { Repo } from './core/repo.service';
import { Icon } from './ui/icon';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, RouterLink, RouterLinkActive, Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <main><router-outlet /></main>
    @if (updateReady()) {
      <div class="update">
        A new version of ArrowPlot is ready.
        <button class="btn sm primary" type="button" (click)="reload()">Update</button>
      </div>
    }
    @if (showNav()) {
      <nav aria-label="Main">
        <a routerLink="/" routerLinkActive="on" [routerLinkActiveOptions]="{ exact: true }"
          ><app-icon name="list" /><span>Trainings</span></a
        >
        <a routerLink="/stats" routerLinkActive="on"
          ><app-icon name="chart" /><span>Statistics</span></a
        >
        <a routerLink="/equipment" routerLinkActive="on"
          ><app-icon name="bow" /><span>Equipment</span></a
        >
        <a routerLink="/more" routerLinkActive="on"><app-icon name="more" /><span>More</span></a>
      </nav>
    }
  `,
  styles: `
    nav {
      position: fixed;
      left: 0;
      right: 0;
      bottom: 0;
      z-index: 10;
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      height: calc(var(--nav-h) + var(--safe-bottom));
      padding-bottom: var(--safe-bottom);
      background: var(--surface);
      border-top: 1px solid var(--line);
    }
    nav a {
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 2px;
      color: var(--muted);
      text-decoration: none;
      font-size: 11.5px;
      font-weight: 600;
    }
    nav a app-icon {
      padding: 3px 18px;
      border-radius: 999px;
    }
    nav a.on {
      color: var(--fg);
    }
    nav a.on app-icon {
      background: var(--accent-soft);
      color: var(--accent);
    }
    .update {
      position: fixed;
      left: 12px;
      right: 12px;
      z-index: 20;
      bottom: calc(var(--nav-h) + var(--safe-bottom) + 12px);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      background: var(--bar);
      color: var(--bar-ink);
      padding: 10px 12px 10px 16px;
      border-radius: 12px;
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.3);
      max-width: 560px;
      margin: 0 auto;
    }
  `,
})
export class App {
  private readonly router = inject(Router);
  protected readonly showNav = signal(true);
  protected readonly updateReady = signal(false);

  constructor() {
    inject(Repo).init();
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd)).subscribe(() => {
      let r: ActivatedRouteSnapshot | null = this.router.routerState.snapshot.root;
      let hide = false;
      while (r) {
        if (r.data['hideNav']) hide = true;
        r = r.firstChild;
      }
      this.showNav.set(!hide);
    });
    const sw = inject(SwUpdate);
    if (sw.isEnabled) {
      sw.versionUpdates
        .pipe(filter((e) => e.type === 'VERSION_READY'))
        .subscribe(() => this.updateReady.set(true));
    }
  }

  reload() {
    document.location.reload();
  }
}
