import { Injectable, inject } from '@angular/core';
import { ApiClient } from '../../shared/api/api-client.service';

export type CustomerInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

export interface CustomerInviteDto {
  id: string;
  email: string;
  status: CustomerInviteStatus;
  expiresAt: string;
  acceptedAt: string | null;
  createdAt: string;
}

/** Story: customer-invite — client for /api/customer-invites and invite redemption. */
@Injectable({ providedIn: 'root' })
export class CustomerInviteApiService {
  private readonly api = inject(ApiClient);

  list(): Promise<CustomerInviteDto[]> {
    return this.api.get<CustomerInviteDto[]>('customer-invites');
  }

  invite(email: string): Promise<CustomerInviteDto> {
    return this.api.post<CustomerInviteDto>('customer-invites', { email });
  }

  /** Redeem an emailed invitation: create the account via the auth signup endpoint. */
  activate(email: string, password: string, registrationToken: string): Promise<unknown> {
    return this.api.post('auth/signup', { email, password, registrationToken });
  }
}

export function errorMessage(e: unknown, fallback: string): string {
  const err = e as { error?: { message?: unknown }; message?: unknown } | null;
  const m = err?.error?.message ?? err?.message;
  if (Array.isArray(m)) return m.join(', ');
  return typeof m === 'string' && m ? m : fallback;
}
