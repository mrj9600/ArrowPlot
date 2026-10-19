import { signal } from '@angular/core';

/** Chrome's install prompt event (not in the TypeScript DOM types). */
interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

const standalone = () =>
  matchMedia('(display-mode: standalone)').matches ||
  (navigator as Navigator & { standalone?: boolean }).standalone === true;

/** The browser's install prompt, once it has offered one. */
export const installPrompt = signal<BeforeInstallPromptEvent | null>(null);
/** True when ArrowPlot runs as an installed app. */
export const isInstalled = signal(standalone());

export type Platform = 'ios' | 'android' | 'other';
export const platform: Platform = /iphone|ipad|ipod/i.test(navigator.userAgent)
  ? 'ios'
  : /android/i.test(navigator.userAgent)
    ? 'android'
    : 'other';

/** Must run before the app boots: Chrome fires the event once, early in the page load. */
export function listenForInstallPrompt() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    installPrompt.set(e as BeforeInstallPromptEvent);
  });
  window.addEventListener('appinstalled', () => {
    installPrompt.set(null);
    isInstalled.set(true);
  });
}

export async function promptInstall(): Promise<boolean> {
  const e = installPrompt();
  if (!e) return false;
  await e.prompt();
  const { outcome } = await e.userChoice;
  installPrompt.set(null);
  return outcome === 'accepted';
}
