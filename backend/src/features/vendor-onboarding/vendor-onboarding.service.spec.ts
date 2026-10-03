import { BadRequestException, NotFoundException } from '@nestjs/common';
import { VendorOnboardingService } from './vendor-onboarding.service';

function makeDeps() {
  const prisma = {
    vendorProfile: {
      findUnique: jest.fn(),
      upsert: jest.fn(async (args: any) => ({ id: 'vp1', ...args.create })),
    },
    vendorDocument: {
      findMany: jest.fn(async () => []),
      create: jest.fn(async (args: any) => ({ id: 'vd1', status: 'PENDING_REVIEW', ...args.data })),
    },
  };
  const minio = { putObject: jest.fn(async (key: string) => ({ etag: 'e', bucket: 'b', key })) };
  const service = new VendorOnboardingService(prisma as any, minio as any);
  return { prisma, minio, service };
}

describe('VendorOnboardingService', () => {
  it('upserts the profile keyed by the signed-in user', async () => {
    const { prisma, service } = makeDeps();
    const res = await service.upsertProfile('u1', {
      companyName: ' Acme ',
      contactName: 'Jane',
      contactEmail: 'jane@acme.test',
    });
    expect(prisma.vendorProfile.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1' } }),
    );
    expect(res.companyName).toBe('Acme');
  });

  it('rejects a profile missing required fields or with a bad email', async () => {
    const { service } = makeDeps();
    await expect(service.upsertProfile('u1', { companyName: '' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.upsertProfile('u1', { companyName: 'A', contactName: 'B', contactEmail: 'nope' }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('refuses document access before a profile exists', async () => {
    const { prisma, service } = makeDeps();
    prisma.vendorProfile.findUnique.mockResolvedValue(null);
    await expect(service.listDocuments('u1')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('stores an upload in MinIO and records it as PENDING_REVIEW', async () => {
    const { prisma, minio, service } = makeDeps();
    prisma.vendorProfile.findUnique.mockResolvedValue({ id: 'vp1', userId: 'u1' });
    const doc = await service.uploadDocument('u1', {
      originalname: 'w9 form.pdf',
      mimetype: 'application/pdf',
      size: 3,
      buffer: Buffer.from('abc'),
    });
    expect(minio.putObject).toHaveBeenCalledWith(
      expect.stringMatching(/^vendor-onboarding\/vp1\/.+-w9_form\.pdf$/),
      expect.any(Buffer),
      3,
      'application/pdf',
    );
    expect(doc.status).toBe('PENDING_REVIEW');
    expect(prisma.vendorDocument.create.mock.calls[0][0].data).not.toHaveProperty('status');
  });

  it('rejects an empty upload', async () => {
    const { service } = makeDeps();
    await expect(service.uploadDocument('u1', undefined)).rejects.toBeInstanceOf(BadRequestException);
  });
});
