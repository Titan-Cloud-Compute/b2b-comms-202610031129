import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Observable, Subject, filter, map } from 'rxjs';
import { PrismaService } from '../../prisma/prisma.service';
import type {
  SharedChannelDto,
  SharedChannelMessageDto,
} from '../../shared/contracts/shared-channel';

/** Roles allowed to act as a vendor (create channels, add customers). */
export const VENDOR_ROLES = ['MANAGER', 'ADMIN', 'SUPER_ADMIN'];

export interface ChannelActor {
  userId: string;
  role: string;
}

type ChannelRow = {
  id: string;
  name: string;
  createdById: string;
  createdAt: Date;
  members: { userId: string; email: string; role: string }[];
};

type MessageRow = {
  id: string;
  channelId: string;
  authorId: string;
  authorEmail: string;
  body: string;
  createdAt: Date;
};

@Injectable()
export class SharedChannelService {
  /** In-process fan-out of newly posted messages to SSE subscribers. */
  private readonly events = new Subject<SharedChannelMessageDto>();

  constructor(private readonly prisma: PrismaService) {}

  private toChannel(row: ChannelRow): SharedChannelDto {
    return {
      id: row.id,
      name: row.name,
      createdById: row.createdById,
      createdAt: row.createdAt.toISOString(),
      members: row.members.map((m) => ({
        userId: m.userId,
        email: m.email,
        role: m.role === 'VENDOR' ? 'VENDOR' : 'CUSTOMER',
      })),
    };
  }

  private toMessage(row: MessageRow): SharedChannelMessageDto {
    return {
      id: row.id,
      channelId: row.channelId,
      authorId: row.authorId,
      authorEmail: row.authorEmail,
      body: row.body,
      createdAt: row.createdAt.toISOString(),
    };
  }

  private assertVendor(actor: ChannelActor): void {
    if (!VENDOR_ROLES.includes(actor.role)) {
      throw new ForbiddenException('Only vendors can manage shared channels');
    }
  }

  /** Throws 404 when the channel is missing, 403 when the caller is not a member. */
  async assertMember(channelId: string, actor: ChannelActor) {
    const channel = await this.prisma.sharedChannel.findUnique({
      where: { id: channelId },
      include: { members: true },
    });
    if (!channel) throw new NotFoundException('Channel not found');
    const member = channel.members.find((m) => m.userId === actor.userId);
    if (!member) throw new ForbiddenException('Not a member of this channel');
    return { channel, member };
  }

  private async resolveCustomers(emails: string[]) {
    const normalized = Array.from(
      new Set(emails.map((e) => String(e ?? '').trim().toLowerCase()).filter(Boolean)),
    );
    if (normalized.length === 0) return [];
    const users = await this.prisma.user.findMany({
      where: { email: { in: normalized, mode: 'insensitive' } },
      select: { id: true, email: true, name: true },
    });
    const found = new Set(users.map((u) => u.email.toLowerCase()));
    const missing = normalized.filter((e) => !found.has(e));
    if (missing.length) {
      throw new BadRequestException(`No customer account for: ${missing.join(', ')}`);
    }
    for (const u of users) {
      await this.prisma.customer.upsert({
        where: { userId: u.id },
        create: { userId: u.id, email: u.email, name: u.name ?? null },
        update: {},
      });
    }
    return users;
  }

  async list(actor: ChannelActor): Promise<SharedChannelDto[]> {
    const rows = await this.prisma.sharedChannel.findMany({
      where: { members: { some: { userId: actor.userId } } },
      include: { members: true },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map((r) => this.toChannel(r));
  }

  async get(channelId: string, actor: ChannelActor): Promise<SharedChannelDto> {
    const { channel } = await this.assertMember(channelId, actor);
    return this.toChannel(channel);
  }

  async create(
    actor: ChannelActor,
    body: { name?: string; customerEmails?: string[] },
  ): Promise<SharedChannelDto> {
    this.assertVendor(actor);
    const name = String(body?.name ?? '').trim();
    if (!name) throw new BadRequestException('Channel name is required');
    const customers = await this.resolveCustomers(
      Array.isArray(body?.customerEmails) ? body.customerEmails : [],
    );
    const vendor = await this.prisma.user.findUnique({
      where: { id: actor.userId },
      select: { email: true },
    });
    const row = await this.prisma.sharedChannel.create({
      data: {
        name,
        createdById: actor.userId,
        members: {
          create: [
            { userId: actor.userId, email: vendor?.email ?? '', role: 'VENDOR' },
            ...customers
              .filter((c) => c.id !== actor.userId)
              .map((c) => ({ userId: c.id, email: c.email, role: 'CUSTOMER' as const })),
          ],
        },
      },
      include: { members: true },
    });
    return this.toChannel(row);
  }

  async addMember(
    channelId: string,
    actor: ChannelActor,
    body: { email?: string },
  ): Promise<SharedChannelDto> {
    this.assertVendor(actor);
    const { member } = await this.assertMember(channelId, actor);
    if (member.role !== 'VENDOR') throw new ForbiddenException('Only the vendor can add members');
    const [customer] = await this.resolveCustomers([String(body?.email ?? '')]);
    if (!customer) throw new BadRequestException('Customer email is required');
    await this.prisma.sharedChannelMember.upsert({
      where: { channelId_userId: { channelId, userId: customer.id } },
      create: { channelId, userId: customer.id, email: customer.email, role: 'CUSTOMER' },
      update: {},
    });
    return this.get(channelId, actor);
  }

  async messages(channelId: string, actor: ChannelActor): Promise<SharedChannelMessageDto[]> {
    await this.assertMember(channelId, actor);
    const rows = await this.prisma.message.findMany({
      where: { channelId },
      orderBy: { createdAt: 'asc' },
      take: 500,
    });
    return rows.map((r) => this.toMessage(r));
  }

  async postMessage(
    channelId: string,
    actor: ChannelActor,
    body: { body?: string },
  ): Promise<SharedChannelMessageDto> {
    const { member } = await this.assertMember(channelId, actor);
    const text = String(body?.body ?? '').trim();
    if (!text) throw new BadRequestException('Message body is required');
    const row = await this.prisma.message.create({
      data: { channelId, authorId: actor.userId, authorEmail: member.email, body: text },
    });
    const dto = this.toMessage(row);
    this.events.next(dto);
    return dto;
  }

  /** Live stream of new messages for one channel (membership must be checked first). */
  stream(channelId: string): Observable<SharedChannelMessageDto> {
    return this.events.asObservable().pipe(
      filter((m) => m.channelId === channelId),
      map((m) => m),
    );
  }
}
