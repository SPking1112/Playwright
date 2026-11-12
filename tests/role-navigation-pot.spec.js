require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

/**
 * Role definitions matching the credentials in .env.
 * Output screenshots will be organized as:
 * pot/role-navigation-pot/<rolename>/<rolename>_<pagename>.png
 */
const roles = [
  {
    roleName: 'admin',
    displayName: 'Organization Admin',
    email: process.env.ORGADMIN_EMAIL,
    password: process.env.ORGADMIN_PASSWORD,
  },
  {
    roleName: 'platform',
    displayName: 'Platform Admin',
    email: process.env.PLATFORM_EMAIL,
    password: process.env.PLATFORM_PASSWORD,
  },
  {
    roleName: 'manager',
    displayName: 'Manager',
    email: process.env.MANAGER_EMAIL,
    password: process.env.MANAGER_PASSWORD,
  },
  {
    roleName: 'billing',
    displayName: 'Billing',
    email: process.env.BILLING_EMAIL,
    password: process.env.BILLING_PASSWORD,
  },
  {
    roleName: 'reporter',
    displayName: 'Reporter',
    email: process.env.REPORTER_EMAIL,
    password: process.env.REPORTER_PASSWORD,
  },
  {
    roleName: 'member',
    displayName: 'Member',
    email: process.env.MEMBER_EMAIL,
    password: process.env.MEMBER_PASSWORD,
  },
];

for (const role of roles) {
  test.describe(`Role: ${role.displayName} (${role.roleName})`, () => {
    const hasCredentials = Boolean(role.email && role.password);

    test(`Login, navigate all pages, capture POT screenshots, and logout`, async ({ page }) => {
      test.skip(!hasCredentials, `Missing credentials for ${role.displayName} in .env`);
      test.setTimeout(120_000);

      const login = new LoginPage(page);
      const app = new AppPage(page);

      // 1. Navigate to login page
      console.log(`\n========================================`);
      console.log(`Starting POT run for role: ${role.displayName} (${role.roleName})`);
      console.log(`Target URL: ${page.context()._options.baseURL || 'default'}/login`);
      console.log(`========================================`);

      await login.open();

      // 2. Perform authentication (handles MFA / QA OTP automatically)
      await login.login({ email: role.email, password: role.password });

      // 3. Capture initial landing / dashboard screenshot
      await app.waitForPageContent();
      await app.takeScreenshot(role.roleName, 'dashboard');

      // 4. Discover all available navigation pages in sidebar for this role
      let navItems = [];
      try {
        navItems = await app.getSidebarItems();
        console.log(`[${role.roleName}] Discovered ${navItems.length} sidebar items:`, navItems.map(i => i.label).join(', '));
      } catch (err) {
        console.warn(`[${role.roleName}] Could not automatically extract sidebar items:`, err.message);
      }

      // 5. Navigate through each page accessible to this role and capture screenshot
      const visitedPages = new Set(['dashboard']);

      for (const item of navItems) {
        const slug = app.sanitizeSlug(item.label);
        if (visitedPages.has(slug)) continue;
        visitedPages.add(slug);

        try {
          console.log(`[${role.roleName}] Navigating to: ${item.label} (${slug})`);
          await app.navigateTo(item.label);
          await app.takeScreenshot(role.roleName, slug);
        } catch (navErr) {
          console.warn(`[${role.roleName}] Failed navigating to ${item.label}:`, navErr.message);
          await app.takeScreenshot(role.roleName, `${slug}_error`);
        }
      }

      // 6. Logout and capture post-logout login screenshot
      console.log(`[${role.roleName}] Logging out...`);
      await app.logout();
      await app.takeScreenshot(role.roleName, 'logout');

      console.log(`[${role.roleName}] Completed all POT screenshots successfully.\n`);
    });
  });
}
