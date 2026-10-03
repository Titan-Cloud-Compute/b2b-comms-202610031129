import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MailerService } from '../../auth/mailer.service';

/** Invitations stay redeemable for 7 days. */
export const CUSTOMER_INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type CustomerInviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED';

export interface CustomerInviteDto {
  id: string;
  email: string;
  status: CustomerInviteStatus;
  expiresAt: Date;
  acceptedAt: Date | null;
  createdAt: Date;
}

/** Public base URL of the web app (no trailing slash). */
export function appBaseUrl(): string {
  const raw = process.env.APP_URL || process.env.APP_PUBLIC_URL || 'http://localhost:4200';
  return raw.replace(/\/+$/, '');
}

/** The SPA uses hash routing, so the activation page lives at /#/activate. */
export function activationUrl(token: string, email: string): string {
  return `${appBaseUrl()}/#/activate?token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
}

@Injectable()
export class CustomerInviteService {
  private readonly logger = new Logger('CustomerInviteService');

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
  ) {}

  /**
   * Mint a single-use USER registration token for `rawEmail`, record the
   * invite, and email the activation link. The customer redeems it on the
   * /activate page, which posts to the existing /api/auth/signup.
   */
  async invite(invitedById: string, rawEmail: unknown): Promise<CustomerInviteDto> {
    const email = typeof rawEmail === 'string' ? rawEmail.trim().toLowerCase() : '';
    if (!EMAIL_RE.test(email)) throw new BadRequestException('a valid email is required');

    const token = randomBytes(24).toString('hex'); // 48 hex chars — matches SignupSchema
    const expiresAt = new Date(Date.now() + CUSTOMER_INVITE_TTL_MS);

    const invite = await this.prisma.runAsAdmin(async (tx) => {
      await tx.registrationToken.create({
        data: { token, role: 'USER', createdById: invitedById, expiresAt },
      });
      return tx.customerInvite.create({
        data: { email, token, invitedById, expiresAt, status: 'PENDING' },
      });
    });

    await this.mailer.sendCustomerInvite(email, activationUrl(token, email));
    this.logger.log(`customer invite ${invite.id} sent by user=${invitedById}`);
    return this.toDto(invite, false);
  }

  /** All invites, newest first; status reflects whether the token was redeemed. */
  async list(): Promise<CustomerInviteDto[]> {
    return this.prisma.runAsAdmin(async (tx) => {
      const invites = await tx.customerInvite.findMany({ orderBy: { createdAt: 'desc' } });
      if (invites.length === 0) return [];
      const tokens = await tx.registrationToken.findMany({
        where: { token: { in: invites.map((i) => i.token) } },
        select: { token: true, consumed: true, consumedAt: true },
      });
      const byToken = new Map(tokens.map((t) => [t.token, t] as const));
      return invites.map((i) => {
        const t = byToken.get(i.token);
        const consumed = !!t?.consumed;
        return this.toDto(
          { ...i, acceptedAt: i.acceptedAt ?? (consumed ? (t?.consumedAt ?? null) : null) },
          consumed,
        );
      });
    });
  }

  private toDto(
    i: { id: string; email: string; status: string; expiresAt: Date; acceptedAt: Date | null; createdAt: Date },
    consumed: boolean,
  ): CustomerInviteDto {
    let status: CustomerInviteStatus = 'PENDING';
    if (consumed || i.status === 'ACCEPTED') status = 'ACCEPTED';
    else if (i.expiresAt.getTime() < Date.now()) status = 'EXPIRED';
    return {
      id: i.id,
      email: i.email,
      status,
      expiresAt: i.expiresAt,
      acceptedAt: i.acceptedAt,
      createdAt: i.createdAt,
    };
  }
}
