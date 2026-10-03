/**
 * Story: vendor-onboarding — a signed-in vendor with no profile is gated to
 * the profile form; after submitting it the vendor dashboard opens and an
 * uploaded compliance document is listed with status "Pending review".
 *
 * All /api/** calls are mocked in-memory (hermetic run).
 */
import { test, expect, type Page } from '@playwright/test';

async function mockApi(page: Page) {
  const store: {
    user: { id: string; email: string; role: string } | null;
    profile: Record<string, unknown> | null;
    documents: Array<Record<string, unknown>>;
  } = { user: null, profile: null, documents: [] };

  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      const body = req.postDataJSON() as { email?: string } | null;
      store.user = { id: 'u1', email: body?.email ?? 'vendor@example.com', role: 'USER' };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (apiPath === 'vendor-onboarding/profile') {
      if (method === 'GET') return json(store.profile);
      const body = req.postDataJSON() as Record<string, unknown>;
      store.profile = { id: 'vp1', ...body };
      return json(store.profile, 201);
    }
    if (apiPath === 'vendor-onboarding/documents') {
      if (!store.profile) return json({ message: 'Not Found' }, 404);
      if (method === 'GET') return json(store.documents);
      const multipart = req.postData() ?? '';
      const name = /filename="([^"]+)"/.exec(multipart)?.[1] ?? 'upload.bin';
      const doc = {
        id: `vd${store.documents.length + 1}`,
        documentType: 'Compliance document',
        fileName: name,
        sizeBytes: 10,
        status: 'PENDING_REVIEW',
        createdAt: new Date().toISOString(),
      };
      store.documents.unshift(doc);
      return json(doc, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('vendor without a profile is sent to onboarding, then reaches dashboard and uploads a document', async ({ page }) => {
  await page.goto('/#/login');
  await page.locator('#email').fill('vendor@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });

  // Dashboard is gated on profile completion.
  await page.goto('/#/vendor');
  await expect(page).toHaveURL(/#\/vendor\/onboarding/, { timeout: 10_000 });

  const form = page.locator('[data-testid="vendor-profile-form"]');
  await expect(form).toBeVisible();
  await form.locator('input[name="companyName"]').fill('Acme Supplies');
  await form.locator('input[name="contactName"]').fill('Jane Doe');
  await form.locator('input[name="contactEmail"]').fill('jane@acme.test');
  await form.locator('button[type="submit"]').click();

  await expect(page).toHaveURL(/#\/vendor$/, { timeout: 10_000 });
  await expect(page.locator('[data-testid="vendor-dashboard"]')).toBeVisible();
  await expect(page.locator('[data-testid="vendor-document-empty"]')).toBeVisible();

  await page.locator('#vd-file').setInputFiles({
    name: 'insurance-certificate.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4 test'),
  });
  await page.locator('[data-testid="vendor-document-upload"] button[type="submit"]').click();

  const row = page.locator('[data-testid="vendor-document-row"]').first();
  await expect(row).toContainText('insurance-certificate.pdf');
  await expect(row.locator('[data-testid="vendor-document-status"]')).toHaveText('Pending review');
});

test('signed-out visit to /#/vendor/onboarding redirects to login', async ({ page }) => {
  await page.goto('/#/vendor/onboarding');
  await expect(page).toHaveURL(/#\/login/, { timeout: 10_000 });
});
