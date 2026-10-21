import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/sessions').then((m) => m.SessionsPage) },
  {
    path: 'session/new',
    loadComponent: () => import('./pages/session-form').then((m) => m.SessionFormPage),
  },
  {
    path: 'session/:id',
    loadComponent: () => import('./pages/session-detail').then((m) => m.SessionDetailPage),
  },
  {
    path: 'session/:id/edit',
    loadComponent: () => import('./pages/session-form').then((m) => m.SessionFormPage),
  },
  {
    path: 'session/:sessionId/round/new',
    loadComponent: () => import('./pages/round-form').then((m) => m.RoundFormPage),
  },
  {
    path: 'round/:id',
    loadComponent: () => import('./pages/round-detail').then((m) => m.RoundDetailPage),
  },
  {
    path: 'round/:id/edit',
    loadComponent: () => import('./pages/round-form').then((m) => m.RoundFormPage),
  },
  {
    path: 'round/:id/end/:end',
    loadComponent: () => import('./pages/end-input').then((m) => m.EndInputPage),
    data: { hideNav: true },
  },
  { path: 'stats', loadComponent: () => import('./pages/stats').then((m) => m.StatsPage) },
  {
    path: 'equipment',
    loadComponent: () => import('./pages/equipment').then((m) => m.EquipmentPage),
  },
  { path: 'bow/:id', loadComponent: () => import('./pages/bow-form').then((m) => m.BowFormPage) },
  {
    path: 'standard-round/:id',
    loadComponent: () => import('./pages/standard-round-form').then((m) => m.StandardRoundFormPage),
  },
  {
    path: 'arrow/:id',
    loadComponent: () => import('./pages/arrow-form').then((m) => m.ArrowFormPage),
  },
  { path: 'more', loadComponent: () => import('./pages/more').then((m) => m.MorePage) },
  {
    path: 'import/archdps',
    loadComponent: () => import('./pages/import-archdps').then((m) => m.ImportArchDpsPage),
  },
  {
    path: 'import/mytargets',
    loadComponent: () => import('./pages/import-mytargets').then((m) => m.ImportMyTargetsPage),
  },
  {
    path: 'import/scoresheet',
    loadComponent: () => import('./pages/import-scoresheet').then((m) => m.ImportScoresheetPage),
  },
  {
    path: 'import/mantisx',
    loadComponent: () => import('./pages/import-mantisx').then((m) => m.ImportMantisPage),
  },
  {
    path: 'timer',
    loadComponent: () => import('./pages/timer').then((m) => m.TimerPage),
    data: { hideNav: true },
  },
  { path: '**', redirectTo: '' },
];
