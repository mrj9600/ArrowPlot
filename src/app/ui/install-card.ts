import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { installPrompt, isInstalled, platform, promptInstall } from '../core/install';
import { Icon } from './icon';

/** Explains how to install ArrowPlot, with a one-tap button where the browser allows it. */
@Component({
  selector: 'app-install-card',
  imports: [Icon],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (!installed()) {
      @if (prompt()) {
        <div class="card row">
          <img src="logo.svg" width="40" height="40" alt="" />
          <div class="spacer small">
            Install ArrowPlot to use it like an app, offline, with its own icon.
          </div>
          <button class="btn primary" type="button" (click)="install()">
            <app-icon name="download" /> Install
          </button>
        </div>
      } @else if (!compact()) {
        <div class="card small" style="display:grid;gap:6px">
          <b>Install ArrowPlot</b>
          @if (platform === 'ios') {
            <span>In Safari, tap the Share button, then <b>Add to Home Screen</b>.</span>
          } @else {
            <span
              >In Chrome, tap the ⋮ menu, then <b>Install app</b> (or
              <b>Add to Home screen</b>).</span
            >
          }
          <span class="muted">
            If you opened the link from another app (Gmail, Messenger, Facebook …), open it in
            {{ platform === 'ios' ? 'Safari' : 'Chrome' }} first: apps' built-in browsers can't
            install. If the option is missing, reload the page once and try again.
          </span>
        </div>
      }
    }
  `,
})
export class InstallCard {
  /** Compact: only show when the browser offers a one-tap install. */
  readonly compact = input(false);
  protected readonly prompt = installPrompt;
  protected readonly installed = isInstalled;
  protected readonly platform = platform;

  protected install() {
    promptInstall();
  }
}
