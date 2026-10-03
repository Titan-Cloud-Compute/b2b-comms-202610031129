/**
 * Auth-foundation spec — verifies route guards, role model and sidebar role label.
 *
 * All /api/** calls are mocked; the role returned is keyed by the email used to
 * log in:  manager@example.com → MANAGER, admin@example.com → ADMIN,
 *          anything else → USER.
 *
 * serviceWorkers:'block' — the build ships ngsw-worker.js; once it registers,
 * app fetches go through the worker and page.route never intercepts them.
 */
import { test, expect, type Page } from '@playwright/test';

type SessionUser = { id: string; email: string; role: string } | null;

function roleForEmail(email: string): string {
  if (email === 'admin@example.com') return 'ADMIN';
  if (email === 'manager@example.com') return 'MANAGER';
  return 'USER';
}

async function mockApi(page: Page): Promise<void> {
  const store: { user: SessionUser } = { user: null };
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const apiPath = new URL(req.url()).pathname
      .replace(/^.*\/api\//, '').replace(/^api\//, '').replace(/^\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && apiPath === 'auth/login') {
      const body = req.postDataJSON() as { email?: string } | null;
      const email = body?.email ?? 'user@example.com';
      store.user = { id: '1', email, role: roleForEmail(email) };
      return json(store.user);
    }
    if (method === 'GET' && apiPath === 'users/me') {
      return store.user ? json(store.user) : json({ message: 'Unauthorized' }, 401);
    }
    if (method === 'POST' && apiPath === 'auth/logout') {
      store.user = null;
      return json({ ok: true });
    }
    if (method === 'GET') return json([]);
    return json({ ok: true });
  });
}

async function loginAs(page: Page, email: string): Promise<void> {
  await page.goto('/#/login');
  await page.locator('#email').fill(email);
  await page.locator('#password').fill('password1234');
  await page.locator('button[type="submit"]').click();
}

test.use({ serviceWorkers: 'block' });
test.beforeEach(async ({ page }) => { await mockApi(page); });

test('signed-out visit to /#/dashboard redirects to /#/login with returnUrl', async ({ page }) => {
  await page.goto('/#/dashboard');
  await page.waitForLoadState('networkidle');
  expect(page.url()).toMatch(/#\/login/);
  expect(page.url()).toContain('returnUrl');
  expect(page.url()).toContain('dashboard');
});

test('MANAGER signs in to /#/dashboard and sidebar shows "Manager"', async ({ page }) => {
  await loginAs(page, 'manager@example.com');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await expect(page.locator('aside.sidebar')).toBeVisible();
  const roleEl = page.locator('aside.sidebar .user-role');
  await expect(roleEl).toContainText('Manager');
});

test('MANAGER visiting /#/admin/overview is redirected to /#/dashboard', async ({ page }) => {
  await loginAs(page, 'manager@example.com');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await page.goto('/#/admin/overview');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 5_000 });
});

test('USER visiting /#/admin/overview is redirected to /#/dashboard', async ({ page }) => {
  await loginAs(page, 'user@example.com');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
  await page.goto('/#/admin/overview');
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 5_000 });
});

test('ADMIN signs in and reaches /#/admin/overview', async ({ page }) => {
  await loginAs(page, 'admin@example.com');
  await expect(page).toHaveURL(/#\/admin\/overview/, { timeout: 10_000 });
  await expect(page.locator('main.main-content [data-placeholder]').first()).toBeVisible();
});

test('public landing page / renders signed-out without redirect', async ({ page }) => {
  await page.goto('/#/');
  await page.waitForLoadState('networkidle');
  expect(page.url()).not.toMatch(/#\/login/);
});
