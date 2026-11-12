require('dotenv').config();
const { test, expect } = require('../fixtures/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const path = require('path');
const fs = require('fs');

test.describe('Negative Testing: Login Failure', () => {
  test('Submit invalid credentials, assert rejection, and capture screenshot POT', async ({ page }) => {
    test.setTimeout(45_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);

    const invalidEmail = 'nonexistent.user.pw@stenotest.invalid';
    const invalidPassword = 'WrongPassword@999';

    console.log(`\n========================================`);
    console.log(`[Negative Test: Login Failure]`);
    console.log(`Testing with invalid email: "${invalidEmail}"`);
    console.log(`Testing with wrong password: "${invalidPassword}"`);
    console.log(`========================================\n`);

    // Capture HTTP response status for login API call
    let loginResponseStatus = null;
    let loginResponseBody = null;

    page.on('response', async (response) => {
      if (response.url().includes('/auth/login') || response.url().includes('/login')) {
        loginResponseStatus = response.status();
        try {
          loginResponseBody = await response.json();
        } catch (_) {}
      }
    });

    // 1. Open Login page
    await login.open();
    console.log(`Target URL: ${page.url()}`);

    // 2. Fill with invalid credentials
    console.log('[Step 1] Filling form with invalid credentials...');
    await login.email.fill(invalidEmail);
    await login.password.fill(invalidPassword);

    // 3. Click Sign In
    console.log('[Step 2] Clicking Sign In button...');
    await login.submit.click();

    // 4. Assert that login is rejected:
    // A) Should NOT navigate away from /login
    await page.waitForTimeout(1500);
    expect(page.url(), 'URL should remain on /login').toContain('/login');

    // B) Wait for and capture the error message (Toast notification or inline banner)
    console.log('[Step 3] Detecting failure notification / toast...');
    const toastError = page.locator('[data-sonner-toast][data-type="error"]').or(
      page.locator('[role="status"]').or(page.locator('div[role="alert"]'))
    ).or(page.locator('text=/invalid|failed|not found|unauthorized/i')).first();

    const isToastVisible = await toastError.isVisible({ timeout: 10_000 }).catch(() => false);
    let capturedErrorMessage = 'Unknown error';

    if (isToastVisible) {
      capturedErrorMessage = await toastError.innerText().catch(() => 'Error displayed');
      console.log(`[Step 3] Captured Error Message: "${capturedErrorMessage}"`);
    } else {
      console.log('[Step 3] No toast text found, but user remained unauthenticated on /login');
    }

    if (loginResponseStatus) {
      console.log(`[Step 3] Backend API Response Status: HTTP ${loginResponseStatus}`);
      if (loginResponseBody) {
        console.log(`[Step 3] Backend Response: ${JSON.stringify(loginResponseBody)}`);
      }
    }

    // C) Ensure dashboard/MFA elements never appeared
    const welcome = page.getByRole('heading', { name: /welcome back/i });
    const sidebar = page.locator('[data-sidebar="sidebar"]');
    await expect(welcome).not.toBeVisible();
    await expect(sidebar).not.toBeVisible();

    // 5. Capture POT Screenshot of the failure state
    console.log('[Step 4] Capturing Proof of Testing (POT) screenshot for negative test...');
    const suiteName = app.getSuiteName();
    const potDir = path.resolve(process.cwd(), 'pot', suiteName, 'negative');
    if (!fs.existsSync(potDir)) {
      fs.mkdirSync(potDir, { recursive: true });
    }

    const screenshotPath = path.join(potDir, 'login_failed_proof.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });

    // Also take screenshot via AppPage helper for standard role folder
    await app.takeScreenshot('admin', 'negative_login_failed');

    console.log(`\n========================================`);
    console.log(`Negative Test PASSED: System successfully rejected invalid login!`);
    console.log(`- API Status: HTTP ${loginResponseStatus || 'Blocked/Rejected'}`);
    console.log(`- UI Error Toast: "${capturedErrorMessage}"`);
    console.log(`- POT Screenshot saved at: pot/${suiteName}/negative/login_failed_proof.png`);
    console.log(`- POT Admin copy saved at: pot/${suiteName}/admin/admin_negative_login_failed.png`);
    console.log(`========================================\n`);
  });
});
