import { test, expect } from './base.js';

// E2E spec for the User API Keys feature.
// Steps:
//  1. Log in (via stored auth state), navigate to /profile.
//  2. Fill the key name input, click Create.
//  3. Assert the reveal dialog appears; capture the plaintext key.
//  4. Close the dialog; verify key row visible with prefix and "Never" last-used.
//  5. Use APIRequestContext to call GET /api/audits with the Bearer key — expect 200.
//  6. Reload /profile; expand "Recent accesses"; assert at least one "listed audits" row.
//  7. Click Revoke; assert the create form returns.
//  8. Call GET /api/audits with revoked key — expect 401.

test.describe('API Keys — profile panel', () => {

  test('create, use, verify access log, and revoke an API key', async ({ page, request }) => {
    // Step 1: Navigate to the profile page (auth state loaded from storageState)
    await page.goto('/profile');
    await expect(page.locator('[data-testid="api-key-card"]')).toBeVisible();

    // Step 2: Fill the name input and click Create
    const nameInput = page.locator('[data-testid="api-key-name-input"]');
    await expect(nameInput).toBeVisible();
    await nameInput.fill('e2e');

    const createBtn = page.locator('[data-testid="api-key-create-btn"]');
    await expect(createBtn).toBeVisible();
    await createBtn.click();

    // Step 3: Assert the reveal dialog appears and capture the key text
    // The dialog contains a readonly textarea with the plaintext key
    const revealTextarea = page.locator('q-dialog textarea, dialog textarea, [role="dialog"] textarea').first();
    // Also accept a q-input rendered textarea inside the dialog
    const keyTextarea = page.locator('q-dialog').locator('textarea').first();
    await expect(keyTextarea).toBeVisible({ timeout: 10000 });
    const capturedKey = await keyTextarea.inputValue();
    expect(capturedKey).toMatch(/^pwndoc_[0-9a-f]{64}$/);

    // Step 4: Close the dialog and verify the key row is visible
    // Click the Close button
    await page.getByRole('button', { name: /close/i }).click();

    // The key panel should now show the key metadata (prefix visible, "Never" for last used)
    await expect(page.locator('[data-testid="api-key-revoke-btn"]')).toBeVisible();
    const cardText = await page.locator('[data-testid="api-key-card"]').textContent();
    expect(cardText).toContain('pwndoc_');
    // lastUsed should show "Never" since we haven't used the key yet
    expect(cardText).toMatch(/never/i);

    // Step 5: Use APIRequestContext to call GET /api/audits with the Bearer key
    const apiResp = await request.get('/api/audits', {
      headers: {
        'Authorization': `Bearer ${capturedKey}`
      }
    });
    expect(apiResp.status()).toBe(200);

    // Step 6: Reload the profile page and verify the access log
    await page.goto('/profile');
    await expect(page.locator('[data-testid="api-key-card"]')).toBeVisible();

    // Expand the "Recent accesses" expansion item by clicking it
    const expansionLabel = page.locator('.q-expansion-item, [class*="expansion"]').first();
    // Try clicking the label/header of the expansion item
    const recentAccessesToggle = page.getByText(/Recent accesses/i).first();
    await expect(recentAccessesToggle).toBeVisible();
    await recentAccessesToggle.click();

    // Wait for the table to appear and check for "listed audits"
    await expect(page.getByText('listed audits')).toBeVisible({ timeout: 5000 });

    // Step 7: Click Revoke and verify the create form returns
    await page.locator('[data-testid="api-key-revoke-btn"]').click();

    // After revoke, the name input should be visible again
    await expect(page.locator('[data-testid="api-key-name-input"]')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('[data-testid="api-key-revoke-btn"]')).not.toBeVisible();

    // Step 8: Call GET /api/audits with the revoked key — expect 401
    const revokedResp = await request.get('/api/audits', {
      headers: {
        'Authorization': `Bearer ${capturedKey}`
      }
    });
    expect(revokedResp.status()).toBe(401);
  });
});
