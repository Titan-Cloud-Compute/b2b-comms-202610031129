import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { ROLES_KEY } from '../../auth/roles.guard';
import { CustomerInviteController } from './customer-invite.controller';
import { CustomerInviteService } from './customer-invite.service';

function makeDeps() {
  const tx = {
    registrationToken: {
      create: jest.fn(async (args: any) => args.data),
      findMany: jest.fn(async () => [] as any[]),
    },
    customerInvite: {
      create: jest.fn(async (args: any) => ({ id: 'ci1', createdAt: new Date(), acceptedAt: null, ...args.data })),
      findMany: jest.fn(async () => [] as any[]),
    },
  };
  const prisma = { runAsAdmin: jest.fn(async (fn: any) => fn(tx)) };
  const mailer = { sendCustomerInvite: jest.fn(async () => undefined) };
  const service = new CustomerInviteService(prisma as any, mailer as any);
  return { tx, prisma, mailer, service };
}

describe('CustomerInviteService', () => {
  const saved = process.env.APP_URL;
  beforeEach(() => {
    process.env.APP_URL = 'https://portal.example.com/';
  });
  afterAll(() => {
    if (saved === undefined) delete process.env.APP_URL;
    else process.env.APP_URL = saved;
  });

  it('mints a 48-hex USER registration token and emails an /activate link', async () => {
    const { tx, mailer, service } = makeDeps();
    const res = await service.invite('admin1', '  Customer@Acme.test ');

    const tokenData = tx.registrationToken.create.mock.calls[0][0].data;
    expect(tokenData.token).toMatch(/^[a-f0-9]{48}$/);
    expect(tokenData.role).toBe('USER');
    expect(tokenData.createdById).toBe('admin1');
    expect(tokenData.expiresAt).toBeInstanceOf(Date);

    const inviteData = tx.customerInvite.create.mock.calls[0][0].data;
    expect(inviteData).toMatchObject({ email: 'customer@acme.test', token: tokenData.token, invitedById: 'admin1' });

    expect(mailer.sendCustomerInvite).toHaveBeenCalledWith(
      'customer@acme.test',
      `https://portal.example.com/#/activate?token=${tokenData.token}&email=customer%40acme.test`,
    );
    expect(res.status).toBe('PENDING');
    expect(res).not.toHaveProperty('token');
  });

  it('rejects a missing or malformed email without touching the DB', async () => {
    const { tx, mailer, service } = makeDeps();
    await expect(service.invite('admin1', 'nope')).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.invite('admin1', undefined)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.registrationToken.create).not.toHaveBeenCalled();
    expect(mailer.sendCustomerInvite).not.toHaveBeenCalled();
  });

  it('lists invites with ACCEPTED once the registration token is consumed', async () => {
    const { tx, service } = makeDeps();
    const future = new Date(Date.now() + 60_000);
    tx.customerInvite.findMany.mockResolvedValue([
      { id: 'a', email: 'a@x.test', token: 't1', status: 'PENDING', expiresAt: future, acceptedAt: null, createdAt: new Date() },
      { id: 'b', email: 'b@x.test', token: 't2', status: 'PENDING', expiresAt: future, acceptedAt: null, createdAt: new Date() },
    ]);
    tx.registrationToken.findMany.mockResolvedValue([{ token: 't1', consumed: true, consumedAt: new Date() }]);
    const list = await service.list();
    expect(list.map((i) => i.status)).toEqual(['ACCEPTED', 'PENDING']);
  });
});

describe('CustomerInviteController', () => {
  it('is restricted to ADMIN', () => {
    expect(Reflect.getMetadata(ROLES_KEY, CustomerInviteController)).toEqual(['ADMIN']);
  });
});
