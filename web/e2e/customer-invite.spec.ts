/**
 * Story: customer-invite — hermetic e2e. /api/** is served by an in-memory
 * mock: the admin invites a customer on /customer-invites, and the customer
 * redeems the emailed link on the public /activate page, which posts the
 * registration token to /api/auth/signup.
 */
import { test, expect, type Page } from '@playwright/test';

const TOKEN = 'a'.repeat(48);

type Invite = { id: string; email: string; status: string; expiresAt: string; acceptedAt: null; createdAt: string };

async function mockApi(page: Page, store: { invites: Invite[]; signups: unknown[] }): Promise<void> {
  let me: { id: string; email: string; role: string } | null = null;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const p = new URL(req.url()).pathname.replace(/^.*\/api\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && p === 'auth/login') {
      const email = (req.postDataJSON() as { email: string }).email;
      me = { id: 'u-admin', email, role: email.startsWith('admin') ? 'ADMIN' : 'USER' };
      return json(me);
    }
    if (method === 'POST' && p === 'auth/signup') {
      const body = req.postDataJSON() as { email: string; password: string; registrationToken?: string };
      store.signups.push(body);
      if (body.registrationToken !== TOKEN) return json({ message: 'invalid registration token' }, 400);
      return json({ id: 'u-customer', email: body.email, role: 'USER' }, 201);
    }
    if (method === 'GET' && p === 'users/me') return me ? json(me) : json({ message: 'Unauthorized' }, 401);
    if (!me) return json({ message: 'Unauthorized' }, 401);

    if (p === 'customer-invites' && method === 'GET') return json(store.invites);
    if (p === 'customer-invites' && method === 'POST') {
      if (me.role !== 'ADMIN') return json({ message: 'Forbidden' }, 403);
      const email = (req.postDataJSON() as { email: string }).email.trim().toLowerCase();
      const now = new Date().toISOString();
      const inv: Invite = { id: `ci-${store.invites.length + 1}`, email, status: 'PENDING', expiresAt: now, acceptedAt: null, createdAt: now };
      store.invites.unshift(inv);
      return json(inv, 201);
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

test.use({ serviceWorkers: 'block' });

test('admin invites a customer by email and sees it pending', async ({ page }) => {
  const store = { invites: [] as Invite[], signups: [] as unknown[] };
  await mockApi(page, store);
  await page.goto('/#/login');
  await page.locator('#email').fill('admin@example.com');
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
  await expect(page).not.toHaveURL(/#\/login/, { timeout: 10_000 });

  await page.evaluate(() => { window.location.hash = '#/customer-invites'; });
  await expect(page).toHaveURL(/#\/customer-invites/);
  await page.getByTestId('customer-invite-email').fill('customer@acme.test');
  await page.getByTestId('customer-invite-submit').click();

  await expect(page.getByTestId('customer-invite-sent')).toContainText('customer@acme.test');
  await expect(page.getByTestId('customer-invite-item')).toHaveCount(1);
  await expect(page.getByTestId('customer-invite-status')).toHaveText('PENDING');
  expect(store.invites.map((i) => i.email)).toEqual(['customer@acme.test']);
});

test('customer opens the activation link and sets a password', async ({ page }) => {
  const store = { invites: [] as Invite[], signups: [] as unknown[] };
  await mockApi(page, store);
  await page.goto(`/#/activate?token=${TOKEN}&email=customer%40acme.test`);

  await expect(page.getByTestId('activate-email')).toHaveValue('customer@acme.test');
  await page.getByTestId('activate-password').fill('s3cret-pass');
  await page.getByTestId('activate-submit').click();

  await expect(page.getByTestId('activate-success')).toBeVisible();
  expect(store.signups).toEqual([
    { email: 'customer@acme.test', password: 's3cret-pass', registrationToken: TOKEN },
  ]);
});
