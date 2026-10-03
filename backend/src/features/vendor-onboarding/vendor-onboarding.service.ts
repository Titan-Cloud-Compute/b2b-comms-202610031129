import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { MinioService } from '../../lib/integrations/minio.service';

export interface VendorProfileInput {
  companyName?: string;
  contactName?: string;
  contactEmail?: string;
  contactPhone?: string | null;
  address?: string | null;
}

export interface UploadedVendorFile {
  originalname: string;
  mimetype?: string;
  size: number;
  buffer: Buffer;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const MAX_VENDOR_DOCUMENT_BYTES = 20 * 1024 * 1024;

function clean(v: unknown): string {
  return typeof v === 'string' ? v.trim() : '';
}

@Injectable()
export class VendorOnboardingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly minio: MinioService,
  ) {}

  /** Returns the caller's vendor profile, or null when none was submitted yet. */
  getProfile(userId: string) {
    return this.prisma.vendorProfile.findUnique({ where: { userId } });
  }

  /** Creates or updates the caller's company profile + contact details. */
  async upsertProfile(userId: string, input: VendorProfileInput) {
    const companyName = clean(input?.companyName);
    const contactName = clean(input?.contactName);
    const contactEmail = clean(input?.contactEmail);
    const contactPhone = clean(input?.contactPhone) || null;
    const address = clean(input?.address) || null;

    const errors: string[] = [];
    if (!companyName) errors.push('companyName is required');
    if (!contactName) errors.push('contactName is required');
    if (!contactEmail) errors.push('contactEmail is required');
    else if (!EMAIL_RE.test(contactEmail)) errors.push('contactEmail must be a valid email');
    if (errors.length) throw new BadRequestException(errors);

    const data = { companyName, contactName, contactEmail, contactPhone, address };
    return this.prisma.vendorProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  private async requireProfile(userId: string) {
    const profile = await this.getProfile(userId);
    if (!profile) {
      throw new NotFoundException('Complete your vendor profile before managing documents.');
    }
    return profile;
  }

  /** Lists the caller's compliance documents, newest first. */
  async listDocuments(userId: string) {
    const profile = await this.requireProfile(userId);
    return this.prisma.vendorDocument.findMany({
      where: { vendorProfileId: profile.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Stores the file in MinIO and records it with status PENDING_REVIEW. */
  async uploadDocument(userId: string, file: UploadedVendorFile | undefined, documentType?: string) {
    if (!file || !file.buffer || !file.size) {
      throw new BadRequestException('A non-empty file is required');
    }
    if (file.size > MAX_VENDOR_DOCUMENT_BYTES) {
      throw new BadRequestException('File exceeds the 20 MB limit');
    }
    const profile = await this.requireProfile(userId);
    const safeName = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    const storageKey = `vendor-onboarding/${profile.id}/${randomUUID()}-${safeName}`;
    await this.minio.putObject(storageKey, file.buffer, file.size, file.mimetype);
    return this.prisma.vendorDocument.create({
      data: {
        vendorProfileId: profile.id,
        documentType: clean(documentType) || 'Compliance document',
        fileName: file.originalname,
        contentType: file.mimetype ?? null,
        sizeBytes: file.size,
        storageKey,
      },
    });
  }
}
