/**
 * Story: shared-channel — hermetic e2e. All /api/** calls are served by an
 * in-memory mock shared across pages, so a vendor (MANAGER) and a customer
 * (USER) see the same channels and messages. The vendor's open channel
 * receives the customer's message over the SSE stream (EventSource).
 */
import { test, expect, type Page } from '@playwright/test';

type Member = { userId: string; email: string; role: 'VENDOR' | 'CUSTOMER' };
type Channel = { id: string; name: string; createdById: string; createdAt: string; members: Member[] };
type Msg = { id: string; channelId: string; authorId: string; authorEmail: string; body: string; createdAt: string };

const USERS: Record<string, { id: string; role: string }> = {
  'manager@example.com': { id: 'u-manager', role: 'MANAGER' },
  'user@example.com': { id: 'u-user', role: 'USER' },
};

function makeStore() {
  return { channels: [] as Channel[], messages: [] as Msg[], seq: 0 };
}
type Store = ReturnType<typeof makeStore>;

async function mockApi(page: Page, store: Store): Promise<void> {
  let me: { id: string; email: string; role: string } | null = null;
  await page.route('**/api/**', async (route) => {
    const req = route.request();
    const method = req.method().toUpperCase();
    const p = new URL(req.url()).pathname.replace(/^.*\/api\//, '');
    const json = (body: unknown, status = 200) =>
      route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });

    if (method === 'POST' && p === 'auth/login') {
      const email = (req.postDataJSON() as { email: string }).email;
      const u = USERS[email] ?? { id: 'u-other', role: 'USER' };
      me = { id: u.id, email, role: u.role };
      return json(me);
    }
    if (method === 'GET' && p === 'users/me') return me ? json(me) : json({ message: 'Unauthorized' }, 401);
    if (!me) return json({ message: 'Unauthorized' }, 401);
    const mine = () => store.channels.filter((c) => c.members.some((m) => m.userId === me!.id));

    if (p === 'channels' && method === 'GET') return json(mine());
    if (p === 'channels' && method === 'POST') {
      const body = req.postDataJSON() as { name: string; customerEmails?: string[] };
      const ch: Channel = {
        id: `ch-${++store.seq}`,
        name: body.name,
        createdById: me.id,
        createdAt: new Date().toISOString(),
        members: [
          { userId: me.id, email: me.email, role: 'VENDOR' },
          ...(body.customerEmails ?? []).map((e) => ({ userId: USERS[e]?.id ?? e, email: e, role: 'CUSTOMER' as const })),
        ],
      };
      store.channels.push(ch);
      return json(ch, 201);
    }
    const m = p.match(/^channels\/([^/]+)\/(messages|members|stream)$/);
    if (m) {
      const ch = store.channels.find((c) => c.id === m[1]);
      if (!ch || !ch.members.some((x) => x.userId === me!.id)) return json({ message: 'Forbidden' }, 403);
      if (m[2] === 'messages' && method === 'GET') return json(store.messages.filter((x) => x.channelId === ch.id));
      if (m[2] === 'messages' && method === 'POST') {
        const msg: Msg = {
          id: `m-${++store.seq}`,
          channelId: ch.id,
          authorId: me.id,
          authorEmail: me.email,
          body: (req.postDataJSON() as { body: string }).body,
          createdAt: new Date().toISOString(),
        };
        store.messages.push(msg);
        return json(msg, 201);
      }
      if (m[2] === 'members' && method === 'POST') {
        const email = (req.postDataJSON() as { email: string }).email;
        ch.members.push({ userId: USERS[email]?.id ?? email, email, role: 'CUSTOMER' });
        return json(ch);
      }
      if (m[2] === 'stream') {
        const frames = store.messages
          .filter((x) => x.channelId === ch.id)
          .map((x) => `retry: 200\nevent: message\ndata: ${JSON.stringify(x)}\n\n`)
          .join('');
        return route.fulfill({ status: 200, contentType: 'text/event-stream', body: frames || 'retry: 200\n\n' });
      }
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
  await expect(page).toHaveURL(/#\/dashboard/, { timeout: 10_000 });
}

test.use({ serviceWorkers: 'block' });

test('sidebar offers Channels and the page renders for a customer without the create form', async ({ page }) => {
  await mockApi(page, makeStore());
  await loginAs(page, 'user@example.com');
  await page.locator('aside.sidebar a', { hasText: 'Channels' }).click();
  await expect(page).toHaveURL(/#\/channels/);
  await expect(page.getByTestId('channel-list')).toBeVisible();
  await expect(page.getByTestId('create-channel-form')).toHaveCount(0);
});

test('vendor creates a channel with a customer; customer posts; vendor sees it live', async ({ browser }) => {
  const store = makeStore();
  const vendorCtx = await browser.newContext({ serviceWorkers: 'block' });
  const customerCtx = await browser.newContext({ serviceWorkers: 'block' });
  const vendor = await vendorCtx.newPage();
  const customer = await customerCtx.newPage();
  await mockApi(vendor, store);
  await mockApi(customer, store);

  await loginAs(vendor, 'manager@example.com');
  await vendor.goto('/#/channels');
  await expect(vendor.getByTestId('create-channel-form')).toBeVisible();
  await vendor.getByTestId('channel-name-input').fill('Acme Supply');
  await vendor.getByTestId('customer-email-input').fill('user@example.com');
  await vendor.getByTestId('create-channel-submit').click();
  await expect(vendor.getByTestId('channel-item')).toHaveText(['Acme Supply']);
  await expect(vendor.getByTestId('channel-view')).toBeVisible();

  await loginAs(customer, 'user@example.com');
  await customer.goto('/#/channels');
  await expect(customer.getByTestId('channel-item')).toHaveText(['Acme Supply']);
  await customer.getByTestId('channel-item').click();
  await customer.getByTestId('message-input').fill('Hello from the customer');
  await customer.getByTestId('send-message').click();
  await expect(customer.getByTestId('message-item')).toContainText(['Hello from the customer']);

  // Vendor never reloads: the open channel's EventSource delivers the message.
  await expect(vendor.getByTestId('message-item')).toContainText(['Hello from the customer'], { timeout: 10_000 });

  await vendorCtx.close();
  await customerCtx.close();
});
