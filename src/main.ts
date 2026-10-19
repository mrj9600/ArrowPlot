import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { listenForInstallPrompt } from './app/core/install';
import { applyTheme } from './app/core/theme';

listenForInstallPrompt();
applyTheme();
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
