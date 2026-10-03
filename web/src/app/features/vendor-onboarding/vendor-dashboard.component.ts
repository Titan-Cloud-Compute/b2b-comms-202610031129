import { Component, OnInit, inject, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  VENDOR_DOCUMENT_STATUS_LABELS,
  VendorDocument,
  VendorDocumentStatus,
  VendorOnboardingApi,
  VendorProfile,
} from './vendor-onboarding-api.service';

@Component({
  selector: 'app-vendor-dashboard',
  standalone: true,
  imports: [FormsModule, DatePipe, RouterLink],
  template: `
    <div class="vendor-page" data-testid="vendor-dashboard">
      <header class="page-header">
        <h1>Vendor dashboard</h1>
        @if (profile(); as p) {
          <p class="subtitle">{{ p.companyName }} · {{ p.contactEmail }} · <a routerLink="/vendor/onboarding">Edit profile</a></p>
        }
      </header>

      <section class="card">
        <h2>Upload compliance documents</h2>
        <form class="upload-form" data-testid="vendor-document-upload" (ngSubmit)="upload()">
          <div class="form-group">
            <label for="vd-type">Document type</label>
            <input id="vd-type" name="documentType" type="text" [(ngModel)]="documentType" />
          </div>
          <div class="form-group">
            <label for="vd-file">File</label>
            <input id="vd-file" name="file" type="file" (change)="onFile($event)" />
          </div>
          @if (error()) {
            <p class="error" role="alert">{{ error() }}</p>
          }
          <button type="submit" class="btn-primary" [disabled]="!file() || uploading()">
            {{ uploading() ? 'Uploading…' : 'Upload document' }}
          </button>
        </form>
      </section>

      <section class="card">
        <h2>Document library</h2>
        @if (documents().length === 0) {
          <p class="empty" data-testid="vendor-document-empty">No documents uploaded yet.</p>
        } @else {
          <ul class="doc-list" data-testid="vendor-document-library">
            @for (doc of documents(); track doc.id) {
              <li class="doc-row" data-testid="vendor-document-row">
                <div>
                  <div class="doc-name">{{ doc.fileName }}</div>
                  <div class="doc-meta">{{ doc.documentType }} · {{ doc.createdAt | date: 'mediumDate' }}</div>
                </div>
                <span class="status" data-testid="vendor-document-status">{{ statusLabel(doc.status) }}</span>
              </li>
            }
          </ul>
        }
      </section>
    </div>
  `,
  styles: [`
    .vendor-page { max-width: 800px; margin: 0 auto; padding: 2rem 1rem; display: flex; flex-direction: column; gap: 1.5rem; }
    h1 { font-size: var(--font-size-xl); color: var(--color-text-primary); margin: 0 0 0.25rem; }
    h2 { font-size: var(--font-size-lg, 1.125rem); margin: 0 0 1rem; color: var(--color-text-primary); }
    .subtitle { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin: 0; }
    .card { background: white; border-radius: var(--radius-card); border: 1px solid var(--color-border); padding: 2rem; }
    .upload-form { display: flex; flex-direction: column; gap: 1rem; }
    .form-group { display: flex; flex-direction: column; gap: 0.375rem; }
    .form-group label { font-size: var(--font-size-sm); font-weight: 600; color: var(--color-text-primary); }
    .form-group input { padding: 0.625rem 0.75rem; font-size: var(--font-size-input, 1rem); border: 1px solid var(--color-gray-300); border-radius: var(--radius-btn); min-height: 44px; }
    .doc-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.75rem; }
    .doc-row { display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; }
    .doc-name { font-weight: 600; color: var(--color-text-primary); }
    .doc-meta, .empty { color: var(--color-text-secondary); font-size: var(--font-size-sm); }
    .status { font-size: var(--font-size-sm); font-weight: 600; }
    .error { color: var(--color-error, #b91c1c); margin: 0; }
  `],
})
export class VendorDashboardComponent implements OnInit {
  private api = inject(VendorOnboardingApi);

  profile = signal<VendorProfile | null>(null);
  documents = signal<VendorDocument[]>([]);
  file = signal<File | null>(null);
  uploading = signal(false);
  error = signal<string | null>(null);
  documentType = 'Compliance document';

  async ngOnInit(): Promise<void> {
    try {
      this.profile.set(await this.api.getProfile());
    } catch {
      this.profile.set(null);
    }
    await this.refresh();
  }

  statusLabel(status: VendorDocumentStatus): string {
    return VENDOR_DOCUMENT_STATUS_LABELS[status] ?? status;
  }

  onFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.file.set(input.files?.[0] ?? null);
  }

  async upload(): Promise<void> {
    const file = this.file();
    if (!file) return;
    this.uploading.set(true);
    this.error.set(null);
    try {
      const doc = await this.api.uploadDocument(file, this.documentType);
      this.documents.update((docs) => [doc, ...docs.filter((d) => d.id !== doc.id)]);
      this.file.set(null);
    } catch {
      this.error.set('Upload failed. Please try again.');
    } finally {
      this.uploading.set(false);
    }
  }

  private async refresh(): Promise<void> {
    try {
      const docs = await this.api.listDocuments();
      this.documents.set(Array.isArray(docs) ? docs : []);
    } catch {
      this.documents.set([]);
    }
  }
}
