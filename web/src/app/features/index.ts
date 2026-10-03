import { Routes } from '@angular/router';
import { roleGuard } from '../shared/auth.guards';
import { vendorProfileGuard } from './vendor-onboarding/vendor-profile.guard';

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
export const FEATURE_ROUTES: Routes = [
  // Story: customer-invite — public page that redeems the emailed activation link.
  {
    path: 'activate',
    loadComponent: () =>
      import('./customer-invite/activate.component').then(m => m.ActivateComponent),
    data: { hideSupportFooter: true },
  },
];

/**
 * Feature routes rendered INSIDE the authenticated layout (sidebar shell).
 * app.routes.ts spreads these into the layout's children, which already sit
 * behind authGuard.
 */
export const LAYOUT_FEATURE_ROUTES: Routes = [
  // Story: vendor-onboarding (inside the authenticated layout shell)
  {
    path: 'vendor',
    pathMatch: 'full',
    canActivate: [vendorProfileGuard],
    loadComponent: () =>
      import('./vendor-onboarding/vendor-dashboard.component').then(m => m.VendorDashboardComponent),
  },
  {
    path: 'vendor/onboarding',
    loadComponent: () =>
      import('./vendor-onboarding/vendor-profile.component').then(m => m.VendorProfileComponent),
  },
  { path: 'vendor/documents', redirectTo: 'vendor', pathMatch: 'full' },
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
  // Story: customer-invite — admin-only invite screen.
  {
    path: 'customer-invites',
    canActivate: [roleGuard],
    data: { roles: ['ADMIN', 'SUPER_ADMIN'] },
    loadComponent: () =>
      import('./customer-invite/customer-invite.component').then(m => m.CustomerInviteComponent),
  },
];
