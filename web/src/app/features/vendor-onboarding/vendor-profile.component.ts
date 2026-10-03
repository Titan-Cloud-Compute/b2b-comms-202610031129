import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { VendorOnboardingApi, VendorProfileInput } from './vendor-onboarding-api.service';

@Component({
  selector: 'app-vendor-profile',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="vendor-page">
      <header class="page-header">
        <h1>Vendor profile</h1>
        <p class="subtitle">Tell us about your company and who we should contact.</p>
      </header>
      <form class="card" data-testid="vendor-profile-form" (ngSubmit)="submit()" #f="ngForm">
        <div class="form-group">
          <label for="vp-company">Company name</label>
          <input id="vp-company" name="companyName" type="text" required [(ngModel)]="model.companyName" />
        </div>
        <div class="form-group">
          <label for="vp-contact-name">Contact name</label>
          <input id="vp-contact-name" name="contactName" type="text" required [(ngModel)]="model.contactName" />
        </div>
        <div class="form-group">
          <label for="vp-contact-email">Contact email</label>
          <input id="vp-contact-email" name="contactEmail" type="email" required email [(ngModel)]="model.contactEmail" />
        </div>
        <div class="form-group">
          <label for="vp-contact-phone">Contact phone (optional)</label>
          <input id="vp-contact-phone" name="contactPhone" type="tel" [(ngModel)]="model.contactPhone" />
        </div>
        <div class="form-group">
          <label for="vp-address">Company address (optional)</label>
          <input id="vp-address" name="address" type="text" [(ngModel)]="model.address" />
        </div>
        @if (error()) {
          <p class="error" role="alert">{{ error() }}</p>
        }
        <button type="submit" class="btn-primary" [disabled]="saving() || f.invalid">
          {{ saving() ? 'Saving…' : 'Save profile' }}
        </button>
      </form>
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 2rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    .subtitle { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .card { background: white; border-radius: var(--radius-card); border: 1px solid var(--color-border); padding: 2rem; display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-group label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary); }
    .form-group input { padding: 0.625rem 0.75rem; font-size: var(--font-size-input, 1rem); border: 1px solid var(--color-gray-300); border-radius: var(--radius-btn); min-height: 44px; }
    .error { color: var(--color-error, #b91c1c); margin: 0; }
  `],
})
export class VendorProfileComponent implements OnInit {
  private api = inject(VendorOnboardingApi);
  private router = inject(Router);

  model: VendorProfileInput = { companyName: '', contactName: '', contactEmail: '', contactPhone: '', address: '' };
  saving = signal(false);
  error = signal<string | null>(null);

  async ngOnInit(): Promise<void> {
    try {
      const existing = await this.api.getProfile();
      if (existing) {
        this.model = {
          companyName: existing.companyName,
          contactName: existing.contactName,
          contactEmail: existing.contactEmail,
          contactPhone: existing.contactPhone ?? '',
          address: existing.address ?? '',
        };
      }
    } catch {
      // No profile yet (or API unavailable) — start with an empty form.
    }
  }

  async submit(): Promise<void> {
    this.saving.set(true);
    this.error.set(null);
    try {
      await this.api.saveProfile(this.model);
      await this.router.navigate(['/vendor']);
    } catch {
      this.error.set('Could not save your profile. Check the fields and try again.');
    } finally {
      this.saving.set(false);
    }
  }
}
