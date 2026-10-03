import { Component, OnInit, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { CustomerInviteApiService, CustomerInviteDto, errorMessage } from './customer-invite-api.service';

/** Story: customer-invite — admin page to invite customers by email. */
@Component({
  selector: 'app-customer-invite',
  standalone: true,
  imports: [FormsModule],
  template: `
    <div class="invite-page">
      <header class="page-header">
        <h1>Customer invites</h1>
        <p class="subtitle">Invite a customer by email. They receive an activation link to set their password.</p>
      </header>

      <section class="card">
        <form class="stack" data-testid="customer-invite-form" (ngSubmit)="send()">
          <label for="customer-invite-email">Customer email</label>
          <input id="customer-invite-email" name="email" type="email" data-testid="customer-invite-email"
                 [(ngModel)]="email" required placeholder="customer@example.com" />
          <button type="submit" class="btn-primary" data-testid="customer-invite-submit"
                  [disabled]="busy() || !email.trim()">Invite</button>
        </form>
        @if (error()) {
          <p class="error" role="alert" data-testid="customer-invite-error">{{ error() }}</p>
        }
        @if (sentTo()) {
          <p class="success" role="status" data-testid="customer-invite-sent">Invitation sent to {{ sentTo() }}.</p>
        }
      </section>

      <section class="card">
        <h2>Invitations</h2>
        <ul class="invite-list" data-testid="customer-invite-list">
          @for (inv of invites(); track inv.id) {
            <li data-testid="customer-invite-item">
              <span>{{ inv.email }}</span>
              <span class="status" data-testid="customer-invite-status">{{ inv.status }}</span>
            </li>
          } @empty {
            <li class="muted" data-testid="customer-invite-empty">No invitations yet.</li>
          }
        </ul>
      </section>
    </div>
  `,
  styles: [`
    .invite-page { padding: 24px; max-width: 720px; }
    .card { margin-top: 16px; }
    .stack { display: flex; flex-direction: column; gap: 8px; }
    .invite-list { list-style: none; padding: 0; }
    .invite-list li { display: flex; justify-content: space-between; padding: 6px 0; }
  `],
})
export class CustomerInviteComponent implements OnInit {
  private readonly api = inject(CustomerInviteApiService);

  email = '';
  readonly invites = signal<CustomerInviteDto[]>([]);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);
  readonly sentTo = signal<string | null>(null);

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    try {
      this.invites.set(await this.api.list());
    } catch (e) {
      this.error.set(errorMessage(e, 'Could not load invitations.'));
    }
  }

  async send(): Promise<void> {
    const email = this.email.trim();
    if (!email) return;
    this.busy.set(true);
    this.error.set(null);
    this.sentTo.set(null);
    try {
      const inv = await this.api.invite(email);
      this.invites.update((list) => [inv, ...list.filter((i) => i.id !== inv.id)]);
      this.sentTo.set(inv.email);
      this.email = '';
    } catch (e) {
      this.error.set(errorMessage(e, 'Could not send the invitation.'));
    } finally {
      this.busy.set(false);
    }
  }
}
