import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';

export interface VendorProfile {
  id: string;
  companyName: string;
  contactName: string;
  contactEmail: string;
  contactPhone: string | null;
  address: string | null;
}

export type VendorProfileInput = Omit<VendorProfile, 'id'>;

export type VendorDocumentStatus = 'PENDING_REVIEW' | 'APPROVED' | 'REJECTED';

export interface VendorDocument {
  id: string;
  documentType: string;
  fileName: string;
  sizeBytes: number;
  status: VendorDocumentStatus;
  createdAt: string;
}

export const VENDOR_DOCUMENT_STATUS_LABELS: Record<VendorDocumentStatus, string> = {
  PENDING_REVIEW: 'Pending review',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

const BASE = '/api/vendor-onboarding';

@Injectable({ providedIn: 'root' })
export class VendorOnboardingApi {
  private http = inject(HttpClient);

  getProfile(): Promise<VendorProfile | null> {
    return firstValueFrom(this.http.get<VendorProfile | null>(`${BASE}/profile`));
  }

  saveProfile(input: VendorProfileInput): Promise<VendorProfile> {
    return firstValueFrom(this.http.post<VendorProfile>(`${BASE}/profile`, input));
  }

  listDocuments(): Promise<VendorDocument[]> {
    return firstValueFrom(this.http.get<VendorDocument[]>(`${BASE}/documents`));
  }

  uploadDocument(file: File, documentType: string): Promise<VendorDocument> {
    const form = new FormData();
    form.append('file', file, file.name);
    form.append('documentType', documentType);
    return firstValueFrom(this.http.post<VendorDocument>(`${BASE}/documents`, form));
  }
}
