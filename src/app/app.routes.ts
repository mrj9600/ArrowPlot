import { Routes } from '@angular/router';

export const routes: Routes = [
  { path: '', loadComponent: () => import('./pages/trainings').then((m) => m.TrainingsPage) },
  {
    path: 'training/new',
    loadComponent: () => import('./pages/training-form').then((m) => m.TrainingFormPage),
  },
  {
    path: 'training/:id',
    loadComponent: () => import('./pages/training-detail').then((m) => m.TrainingDetailPage),
  },
  {
    path: 'training/:id/edit',
    loadComponent: () => import('./pages/training-form').then((m) => m.TrainingFormPage),
  },
  {
    path: 'training/:trainingId/round/new',
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
    path: 'lab/ocr',
    loadComponent: () => import('./pages/ocr-lab').then((m) => m.OcrLabPage),
  },
  {
    path: 'import/archdps',
    loadComponent: () => import('./pages/import-archdps').then((m) => m.ImportArchDpsPage),
  },
  {
    path: 'import/mytargets',
    loadComponent: () => import('./pages/import-mytargets').then((m) => m.ImportMyTargetsPage),
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
