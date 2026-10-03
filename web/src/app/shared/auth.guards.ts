import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { AuthService } from './auth.service';

/**
 * Functional guard: requires an authenticated session.
 * Redirects to /login?returnUrl=<current path> when signed out.
 */
export const authGuard: CanActivateFn = (_route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (auth.isAuthenticated()) return true;

  return router.createUrlTree(['/login'], {
    queryParams: { returnUrl: state.url },
  });
};

/**
 * Functional guard: requires one of the roles listed in route.data['roles'].
 * - No roles list → allow all authenticated users.
 * - Signed out → redirect to /login?returnUrl=<current path>.
 * - Wrong role → redirect to /dashboard.
 */
export const roleGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.isAuthenticated()) {
    return router.createUrlTree(['/login'], {
      queryParams: { returnUrl: state.url },
    });
  }

  const allowedRoles = route.data?.['roles'] as string[] | undefined;
  if (!allowedRoles || allowedRoles.length === 0) return true;

  const userRole = auth.user()?.role;
  if (userRole && allowedRoles.includes(userRole)) return true;

  return router.createUrlTree(['/dashboard']);
};
