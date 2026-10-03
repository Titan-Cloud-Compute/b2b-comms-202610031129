import { Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CustomerInviteApiService, errorMessage } from './customer-invite-api.service';

/** Story: customer-invite — public page that redeems the emailed activation link. */
@Component({
  selector: 'app-activate',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="activate-page">
      <section class="card">
        <h1>Activate your account</h1>
        @if (done()) {
          <p class="success" role="status" data-testid="activate-success">
            Your account is active. <a routerLink="/login">Sign in</a>
          </p>
        } @else if (!token) {
          <p class="error" role="alert" data-testid="activate-error">This activation link is invalid.</p>
        } @else {
          <form class="stack" (ngSubmit)="activate()">
            <label for="activate-email">Email</label>
            <input id="activate-email" name="email" type="email" data-testid="activate-email"
                   [(ngModel)]="email" required />
            <label for="activate-password">Password</label>
            <input id="activate-password" name="password" type="password" data-testid="activate-password"
                   [(ngModel)]="password" required minlength="8" autocomplete="new-password" />
            <button type="submit" class="btn-primary" data-testid="activate-submit"
                    [disabled]="busy() || !email.trim() || password.length < 8">Activate account</button>
          </form>
          @if (error()) {
            <p class="error" role="alert" data-testid="activate-error">{{ error() }}</p>
          }
        }
      </section>
    </div>
  `,
  styles: [`
    .activate-page { display: flex; justify-content: center; padding: 48px 16px; }
    .card { width: 100%; max-width: 420px; }
    .stack { display: flex; flex-direction: column; gap: 8px; }
  `],
})
export class ActivateComponent {
  private readonly api = inject(CustomerInviteApiService);
  private readonly route = inject(ActivatedRoute);

  readonly token = (this.route.snapshot.queryParamMap.get('token') ?? '').trim().toLowerCase();
  email = this.route.snapshot.queryParamMap.get('email') ?? '';
  password = '';
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly done = signal(false);

  async activate(): Promise<void> {
    this.busy.set(true);
    this.error.set(null);
    try {
      await this.api.activate(this.email.trim(), this.password, this.token);
      this.done.set(true);
    } catch (e) {
      this.error.set(errorMessage(e, 'Activation failed. The link may be invalid or expired.'));
    } finally {
      this.busy.set(false);
    }
  }
}
