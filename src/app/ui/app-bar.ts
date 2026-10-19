import { Location } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { Router } from '@angular/router';
import { Icon } from './icon';

@Component({
  selector: 'app-bar',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header>
      @if (back()) {
        <button class="icon-btn" type="button" (click)="goBack()" aria-label="Back">
          <app-icon name="back" />
        </button>
      } @else {
        <img src="logo.svg" alt="" class="logo" />
      }
      <div class="t">
        <h1>{{ title() }}</h1>
        @if (subtitle()) {
          <div class="s">{{ subtitle() }}</div>
        }
      </div>
      <div class="actions"><ng-content /></div>
    </header>
  `,
  styles: `
    :host {
      position: sticky;
      top: 0;
      z-index: 10;
      display: block;
    }
    header {
      display: flex;
      align-items: center;
      gap: 6px;
      min-height: calc(56px + var(--safe-top));
      padding: var(--safe-top) 6px 0 8px;
      background: var(--bar);
      color: var(--bar-ink);
      box-shadow: 0 1px 6px rgba(0, 0, 0, 0.18);
    }
    .logo {
      width: 30px;
      height: 30px;
      margin: 0 6px 0 6px;
    }
    .t {
      flex: 1;
      min-width: 0;
    }
    h1 {
      font-size: 19px;
      font-weight: 650;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .s {
      font-size: 12.5px;
      opacity: 0.75;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .actions {
      display: flex;
      align-items: center;
    }
  `,
})
export class AppBar {
  readonly title = input('ArrowPlot');
  readonly subtitle = input<string | null | undefined>(null);
  /** Route to go back to when there is no history (deep link), or empty for a top-level page. */
  readonly back = input<string | null>(null);

  private readonly location = inject(Location);
  private readonly router = inject(Router);

  goBack() {
    const nav = this.router.lastSuccessfulNavigation();
    if (nav?.previousNavigation) this.location.back();
    else this.router.navigateByUrl(this.back() || '/');
  }
}
