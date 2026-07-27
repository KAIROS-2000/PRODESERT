const baseUrl = (process.env.INTEGRATION_API_URL ?? 'http://localhost:4000/api/v1').replace(
  /\/$/,
  '',
);
const origin = process.env.INTEGRATION_ORIGIN ?? 'http://localhost:3001';
const password = process.env.INTEGRATION_STAFF_PASSWORD ?? process.env.SEED_STAFF_PASSWORD;

if (!password) {
  throw new Error(
    'Set INTEGRATION_STAFF_PASSWORD (or SEED_STAFF_PASSWORD) before running this smoke test.',
  );
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function sessionClient() {
  const cookies = new Map();
  const storeCookies = (response) => {
    const setCookies = response.headers.getSetCookie?.() ?? [];
    for (const value of setCookies) {
      const [pair] = value.split(';', 1);
      const separator = pair.indexOf('=');
      if (separator > 0) cookies.set(pair.slice(0, separator), pair.slice(separator + 1));
    }
  };

  return async (path, init = {}) => {
    const headers = new Headers(init.headers);
    headers.set('Origin', origin);
    if (cookies.size > 0) {
      headers.set(
        'Cookie',
        [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; '),
      );
    }
    const response = await fetch(`${baseUrl}${path}`, { ...init, headers });
    storeCookies(response);
    return response;
  };
}

async function authenticate(email) {
  const request = sessionClient();
  const csrfResponse = await request('/auth/csrf');
  assert(csrfResponse.ok, `CSRF issue failed for ${email}: ${csrfResponse.status}`);
  const { csrfToken } = await csrfResponse.json();
  assert(typeof csrfToken === 'string', 'CSRF response did not contain a token.');

  const login = await request('/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify({ email, password }),
  });
  assert(login.ok, `Login failed for ${email}: ${login.status}`);
  return request;
}

async function expectStatus(request, path, expected) {
  const response = await request(path);
  assert(response.status === expected, `${path}: expected ${expected}, got ${response.status}`);
}

const admin = await authenticate('admin.local@pro-dessert.test');
const manager = await authenticate('manager.local@pro-dessert.test');
const content = await authenticate('content.local@pro-dessert.test');

for (const path of [
  '/admin/dashboard',
  '/admin/orders?limit=5',
  '/admin/payments?limit=5',
  '/admin/reservations?limit=5',
  '/admin/catalog/products?limit=5',
  '/admin/integration/overview',
  '/admin/audit?limit=5',
  '/content/banners',
  '/content/promotions',
  '/content/pages',
]) {
  await expectStatus(admin, path, 200);
}

await expectStatus(manager, '/admin/dashboard', 200);
await expectStatus(manager, '/admin/integration/overview', 403);
await expectStatus(content, '/admin/catalog/products?limit=5', 200);
await expectStatus(content, '/admin/orders?limit=5', 403);

console.log('admin_integration_smoke_passed');
