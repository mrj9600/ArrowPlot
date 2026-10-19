import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { applyTheme } from './app/core/theme';

applyTheme();
bootstrapApplication(App, appConfig).catch((err) => console.error(err));
