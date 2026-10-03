import { inject } from '@angular/core';
import { CanActivateFn, Router } from '@angular/router';
import { VendorOnboardingApi } from './vendor-onboarding-api.service';

/**
 * The vendor dashboard is only accessible once the vendor has submitted a
 * company profile. Without one, send them to the onboarding form.
 */
export const vendorProfileGuard: CanActivateFn = async () => {
  const api = inject(VendorOnboardingApi);
  const router = inject(Router);
  try {
    const profile = await api.getProfile();
    if (profile && profile.id) return true;
  } catch {
    // fall through to onboarding
  }
  return router.createUrlTree(['/vendor/onboarding']);
};
