import { Component, OnDestroy, computed, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ApiClient } from '../../shared/api/api-client.service';
import { AuthService } from '../../shared/auth.service';
import { SharedChannelDto, SharedChannelMessageDto } from './shared-channel.types';

const VENDOR_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

@Component({
  selector: 'app-shared-channel',
  standalone: true,
  imports: [FormsModule, RouterLink],
  template: `
    <div class="channels-page">
      <header class="page-header">
        <h1>Channels</h1>
        <p class="subtitle">Shared channels between vendors and customers.</p>
      </header>

      @if (error()) {
        <p class="error" role="alert" data-testid="channel-error">{{ error() }}</p>
      }

      <div class="layout">
        <section class="card">
          @if (isVendor()) {
            <form class="stack" data-testid="create-channel-form" (ngSubmit)="createChannel()">
              <h2>New shared channel</h2>
              <label for="channel-name">Channel name</label>
              <input id="channel-name" name="channelName" data-testid="channel-name-input"
                     [(ngModel)]="newName" required placeholder="e.g. Acme Corp" />
              <label for="channel-customer">Customer email</label>
              <input id="channel-customer" name="customerEmail" type="email"
                     data-testid="customer-email-input" [(ngModel)]="newCustomerEmail"
                     placeholder="customer@example.com" />
              <button type="submit" class="btn-primary" data-testid="create-channel-submit"
                      [disabled]="busy() || !newName.trim()">Create channel</button>
            </form>
          }

          <h2>Your channels</h2>
          <ul class="channel-list" data-testid="channel-list">
            @for (ch of channels(); track ch.id) {
              <li>
                <a data-testid="channel-item" [routerLink]="['/channels', ch.id]"
                   [class.active]="ch.id === activeId()">{{ ch.name }}</a>
              </li>
            } @empty {
              <li class="muted" data-testid="channel-list-empty">No channels yet.</li>
            }
          </ul>
        </section>

        @if (activeChannel(); as ch) {
          <section class="card" data-testid="channel-view">
            <h2 data-testid="channel-title">{{ ch.name }}</h2>
            <p class="muted" data-testid="channel-members">
              @for (m of ch.members; track m.userId) {
                <span>{{ m.email }} ({{ m.role === 'VENDOR' ? 'vendor' : 'customer' }}) </span>
              }
            </p>

            @if (isVendor() && isChannelVendor(ch)) {
              <form class="row" data-testid="add-member-form" (ngSubmit)="addMember()">
                <input name="memberEmail" type="email" data-testid="add-member-input"
                       [(ngModel)]="memberEmail" placeholder="customer@example.com" />
                <button type="submit" class="btn-secondary" data-testid="add-member-submit"
                        [disabled]="busy() || !memberEmail.trim()">Add customer</button>
              </form>
            }

            <ul class="message-list" data-testid="message-list">
              @for (m of messages(); track m.id) {
                <li data-testid="message-item">
                  <strong>{{ m.authorEmail }}</strong>: <span class="body">{{ m.body }}</span>
                </li>
              } @empty {
                <li class="muted">No messages yet.</li>
              }
            </ul>

            <form class="row" data-testid="send-message-form" (ngSubmit)="sendMessage()">
              <input name="draft" data-testid="message-input" [(ngModel)]="draft"
                     placeholder="Write a message…" />
              <button type="submit" class="btn-primary" data-testid="send-message"
                      [disabled]="busy() || !draft.trim()">Send</button>
            </form>
          </section>
        }
      </div>
    </div>
  `,
  styles: [`
    .channels-page { max-width: 1000px; margin: 0 auto; padding: 2rem 1rem; }
    .page-header { margin-bottom: 1.5rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-md, 1rem); margin: 0 0 0.75rem; }
    .subtitle, .muted { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    .layout { display: grid; grid-template-columns: minmax(240px, 1fr) 2fr; gap: 1rem; }
    .card { background: white; border: 1px solid var(--color-border); border-radius: var(--radius-card); padding: 1.25rem; }
    .stack { display: flex; flex-direction: column; gap: 0.5rem; margin-bottom: 1.5rem; }
    .row { display: flex; gap: 0.5rem; margin: 0.75rem 0; }
    .row input { flex: 1; }
    .channel-list, .message-list { list-style: none; padding: 0; margin: 0; }
    .channel-list a { display: block; padding: 0.4rem 0.5rem; border-radius: var(--radius-card); color: inherit; text-decoration: none; }
    .channel-list a.active { background: var(--color-border); }
    .message-list { max-height: 400px; overflow-y: auto; }
    .message-list li { padding: 0.35rem 0; }
    .error { color: var(--color-error); }
    @media (max-width: 720px) { .layout { grid-template-columns: 1fr; } }
  `],
})
export class SharedChannelComponent implements OnDestroy {
  private api = inject(ApiClient);
  private auth = inject(AuthService);
  private route = inject(ActivatedRoute);
  private router = inject(Router);

  readonly channels = signal<SharedChannelDto[]>([]);
  readonly messages = signal<SharedChannelMessageDto[]>([]);
  readonly activeId = signal<string | null>(null);
  readonly busy = signal(false);
  readonly error = signal<string | null>(null);

  readonly isVendor = computed(() => VENDOR_ROLES.includes(this.auth.user()?.role ?? ''));
  readonly activeChannel = computed(
    () => this.channels().find((c) => c.id === this.activeId()) ?? null,
  );

  newName = '';
  newCustomerEmail = '';
  memberEmail = '';
  draft = '';

  private source: EventSource | null = null;
  private readonly sub = this.route.paramMap.subscribe((p) => {
    this.openChannel(p.get('id'));
  });

  constructor() {
    void this.loadChannels();
  }

  ngOnDestroy(): void {
    this.sub.unsubscribe();
    this.closeStream();
  }

  isChannelVendor(ch: SharedChannelDto): boolean {
    const me = this.auth.user();
    return ch.members.some(
      (m) => m.role === 'VENDOR' && (m.userId === me?.id || m.email === me?.email),
    );
  }

  private describe(e: unknown): string {
    const err = e as { message?: string; error?: { message?: string } };
    return err?.error?.message || err?.message || 'Something went wrong';
  }

  async loadChannels(): Promise<void> {
    try {
      const list = await this.api.get<SharedChannelDto[]>('channels');
      this.channels.set(Array.isArray(list) ? list : []);
    } catch (e) {
      this.error.set(this.describe(e));
    }
  }

  private upsertChannel(ch: SharedChannelDto): void {
    this.channels.update((list) => [ch, ...list.filter((c) => c.id !== ch.id)]);
  }

  private addMessage(m: SharedChannelMessageDto): void {
    if (!m || !m.id) return;
    this.messages.update((list) => (list.some((x) => x.id === m.id) ? list : [...list, m]));
  }

  private async openChannel(id: string | null): Promise<void> {
    this.closeStream();
    this.activeId.set(id);
    this.messages.set([]);
    if (!id) return;
    try {
      const list = await this.api.get<SharedChannelMessageDto[]>(`channels/${id}/messages`);
      if (this.activeId() !== id) return;
      (Array.isArray(list) ? list : []).forEach((m) => this.addMessage(m));
    } catch (e) {
      this.error.set(this.describe(e));
    }
    this.openStream(id);
  }

  private openStream(id: string): void {
    if (typeof EventSource === 'undefined') return;
    const es = new EventSource(`api/channels/${encodeURIComponent(id)}/stream`, { withCredentials: true });
    es.onmessage = (ev: MessageEvent) => {
      try {
        const m = JSON.parse(ev.data) as SharedChannelMessageDto;
        if (m.channelId === this.activeId()) this.addMessage(m);
      } catch {
        /* ignore malformed frames */
      }
    };
    this.source = es;
  }

  private closeStream(): void {
    this.source?.close();
    this.source = null;
  }

  async createChannel(): Promise<void> {
    const name = this.newName.trim();
    if (!name) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const email = this.newCustomerEmail.trim();
      const ch = await this.api.post<SharedChannelDto>('channels', {
        name,
        customerEmails: email ? [email] : [],
      });
      this.newName = '';
      this.newCustomerEmail = '';
      if (ch?.id) {
        this.upsertChannel(ch);
        await this.router.navigate(['/channels', ch.id]);
      } else {
        await this.loadChannels();
      }
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async addMember(): Promise<void> {
    const id = this.activeId();
    const email = this.memberEmail.trim();
    if (!id || !email) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const ch = await this.api.post<SharedChannelDto>(`channels/${id}/members`, { email });
      this.memberEmail = '';
      if (ch?.id) this.upsertChannel(ch);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }

  async sendMessage(): Promise<void> {
    const id = this.activeId();
    const body = this.draft.trim();
    if (!id || !body) return;
    this.busy.set(true);
    this.error.set(null);
    try {
      const m = await this.api.post<SharedChannelMessageDto>(`channels/${id}/messages`, { body });
      this.draft = '';
      this.addMessage(m);
    } catch (e) {
      this.error.set(this.describe(e));
    } finally {
      this.busy.set(false);
    }
  }
}
