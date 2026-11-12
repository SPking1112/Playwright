require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

const accounts = [
  { role: 'Platform', roleName: 'platform', email: process.env.PLATFORM_EMAIL, password: process.env.PLATFORM_PASSWORD },
  { role: 'Organization Admin', roleName: 'admin', email: process.env.ORGADMIN_EMAIL, password: process.env.ORGADMIN_PASSWORD },
  { role: 'Manager', roleName: 'manager', email: process.env.MANAGER_EMAIL, password: process.env.MANAGER_PASSWORD },
  { role: 'Billing', roleName: 'billing', email: process.env.BILLING_EMAIL, password: process.env.BILLING_PASSWORD },
  { role: 'Reporter', roleName: 'reporter', email: process.env.REPORTER_EMAIL, password: process.env.REPORTER_PASSWORD },
  { role: 'Member', roleName: 'member', email: process.env.MEMBER_EMAIL, password: process.env.MEMBER_PASSWORD },
];

for (const account of accounts) {
  const hasCredentials = Boolean(account.email && account.password);

  test(`${account.role}: login, navigate, screenshot, and logout`, async ({ page }) => {
    test.skip(!hasCredentials, `Set ${account.role} credentials in .env to enable this test.`);
    test.setTimeout(90_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);

    await login.open();
    await login.login(account);

    // Initial dashboard screenshot
    await app.waitForPageContent();
    await app.takeScreenshot(account.roleName, 'dashboard');

    // Optional navigation check
    const navigationLabel = process.env.NAVIGATION_LABEL || 'Dashboard';
    const navigationPath = process.env.NAVIGATION_PATH || '/';
    await app.navigateTo(navigationLabel, navigationPath);
    await expect(page).not.toHaveURL(/\/login/i);

    // Logout and capture logout screen
    await app.logout();
    await app.takeScreenshot(account.roleName, 'logout');
  });
}
