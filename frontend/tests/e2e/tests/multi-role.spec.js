import { test, expect } from '@playwright/test';

// Verifies multi-role users get the union of permissions:
// A user assigned both `user` (base) and `reviewer` should see the reviewer
// features (e.g. "Awaiting my review" toggle on the audits list) but must NOT
// gain master-data CRUD capabilities that only `data-manager` provides.
test.describe('Multi-role user', () => {
  const username = 'multi-e2e';
  const password = 'MultiE2E123';

  test('reviewer add-on grants review toggle but not data-manager perms', async ({ page, request }) => {
    // Arrange: create the user as admin via API
    const login = await request.post('/api/users/token', {
      data: { username: 'admin', password: 'Admin123' }
    });
    expect(login.ok()).toBeTruthy();

    const create = await request.post('/api/users', {
      data: {
        username,
        password,
        firstname: 'Multi',
        lastname: 'Role',
        roles: ['user', 'reviewer']
      }
    });
    // 201 on first run, 422 if already exists (tests may rerun) — both fine
    expect([201, 422]).toContain(create.status());

    // Act: sign in as that user through the UI (fresh session — no stored state)
    await page.context().clearCookies();
    await page.goto('/login');
    await page.getByRole('textbox', { name: 'Username' }).fill(username);
    await page.getByLabel('Password').fill(password);
    await page.getByRole('button', { name: 'Login' }).click();
    await expect(page).toHaveURL('/audits');

    // Assert reviewer-specific UI is present: the "Awaiting my review" toggle
    // is rendered when the user has audits:review (see audits/list/index.vue).
    await expect(page.getByText(/Awaiting my review/i)).toBeVisible();

    // Assert the user does NOT have data-manager permissions: the "Add language"
    // button on the Custom Data page requires languages:create.
    await page.goto('/data/custom');
    await expect(page.getByRole('button', { name: /Add Language/i })).toHaveCount(0);
  });
});
