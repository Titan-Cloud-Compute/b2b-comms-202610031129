import { Routes } from '@angular/router';

/**
 * Feature route registry.
 *
 * Each story appends its Angular routes to this array.
 * app.routes.ts spreads FEATURE_ROUTES before the wildcard catch-all so new
 * feature routes are picked up automatically.
 *
 * Example (in features/my-feature/my-feature.routes.ts):
 *
 *   import { FEATURE_ROUTES } from '../index';
 *   FEATURE_ROUTES.push({ path: 'my-feature', loadComponent: () => ... });
 *
 * Or add routes here directly.
 */
export const FEATURE_ROUTES: Routes = [];

/**
 * Feature routes rendered INSIDE the authenticated layout (sidebar shell).
 * app.routes.ts spreads these into the layout's children, which already sit
 * behind authGuard.
 */
export const LAYOUT_FEATURE_ROUTES: Routes = [
  {
    path: 'channels',
    loadComponent: () =>
      import('./shared-channel/shared-channel.component').then(m => m.SharedChannelComponent),
  },
  {
    path: 'channels/:id',
    loadComponent: () =>
      import('./shared-channel/shared-channel.component').then(m => m.SharedChannelComponent),
  },
];
