import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { firstValueFrom, take, toArray } from 'rxjs';
import { SharedChannelService } from './shared-channel.service';

function makePrisma() {
  const channels: any[] = [];
  const messages: any[] = [];
  const users = [
    { id: 'v1', email: 'manager@demo.local', name: 'Vendor' },
    { id: 'c1', email: 'user@demo.local', name: 'Customer' },
    { id: 'x1', email: 'other@demo.local', name: 'Other' },
  ];
  let seq = 0;
  const prisma: any = {
    user: {
      findMany: jest.fn(async ({ where }: any) =>
        users.filter((u) => where.email.in.includes(u.email.toLowerCase())),
      ),
      findUnique: jest.fn(async ({ where }: any) => users.find((u) => u.id === where.id) ?? null),
    },
    customer: { upsert: jest.fn(async () => ({})) },
    sharedChannel: {
      create: jest.fn(async ({ data }: any) => {
        const ch = {
          id: `ch${++seq}`,
          name: data.name,
          createdById: data.createdById,
          createdAt: new Date(),
          members: data.members.create.map((m: any) => ({ ...m })),
        };
        channels.push(ch);
        return ch;
      }),
      findUnique: jest.fn(async ({ where }: any) => channels.find((c) => c.id === where.id) ?? null),
      findMany: jest.fn(async ({ where }: any) =>
        channels.filter((c) => c.members.some((m: any) => m.userId === where.members.some.userId)),
      ),
    },
    sharedChannelMember: {
      upsert: jest.fn(async ({ create }: any) => {
        const ch = channels.find((c) => c.id === create.channelId);
        ch.members.push({ ...create });
        return create;
      }),
    },
    message: {
      create: jest.fn(async ({ data }: any) => {
        const m = { id: `m${++seq}`, createdAt: new Date(), ...data };
        messages.push(m);
        return m;
      }),
      findMany: jest.fn(async ({ where }: any) => messages.filter((m) => m.channelId === where.channelId)),
    },
  };
  return prisma;
}

describe('SharedChannelService', () => {
  const vendor = { userId: 'v1', role: 'MANAGER' };
  const customer = { userId: 'c1', role: 'USER' };
  const outsider = { userId: 'x1', role: 'USER' };
  let svc: SharedChannelService;

  beforeEach(() => {
    svc = new SharedChannelService(makePrisma());
  });

  it('vendor creates a channel with a customer; it lists for both', async () => {
    const ch = await svc.create(vendor, { name: 'Acme', customerEmails: ['user@demo.local'] });
    expect(ch.members.map((m) => m.role).sort()).toEqual(['CUSTOMER', 'VENDOR']);
    expect((await svc.list(vendor)).map((c) => c.id)).toEqual([ch.id]);
    expect((await svc.list(customer)).map((c) => c.id)).toEqual([ch.id]);
    expect(await svc.list(outsider)).toEqual([]);
  });

  it('customers cannot create channels', async () => {
    await expect(svc.create(customer, { name: 'x' })).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects unknown customer emails', async () => {
    await expect(
      svc.create(vendor, { name: 'x', customerEmails: ['nobody@demo.local'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('vendor adds a customer by email later', async () => {
    const ch = await svc.create(vendor, { name: 'Acme' });
    const updated = await svc.addMember(ch.id, vendor, { email: 'user@demo.local' });
    expect(updated.members.some((m) => m.userId === 'c1' && m.role === 'CUSTOMER')).toBe(true);
  });

  it('non-members cannot read or post messages', async () => {
    const ch = await svc.create(vendor, { name: 'Acme', customerEmails: ['user@demo.local'] });
    await expect(svc.messages(ch.id, outsider)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.postMessage(ch.id, outsider, { body: 'hi' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(svc.messages('missing', vendor)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('customer message is stored and pushed to the live stream', async () => {
    const ch = await svc.create(vendor, { name: 'Acme', customerEmails: ['user@demo.local'] });
    const live = firstValueFrom(svc.stream(ch.id).pipe(take(1), toArray()));
    const msg = await svc.postMessage(ch.id, customer, { body: 'Hello vendor' });
    expect((await live)[0]).toEqual(msg);
    expect((await svc.messages(ch.id, vendor)).map((m) => m.body)).toEqual(['Hello vendor']);
  });
});
