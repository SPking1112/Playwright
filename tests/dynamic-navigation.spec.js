require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

test.describe('Dynamic Page Discovery & Navigation', () => {
  const accounts = [
    {
      role: 'Platform Admin',
      roleName: 'platform',
      email: process.env.PLATFORM_EMAIL,
      password: process.env.PLATFORM_PASSWORD,
    },
    {
      role: 'Organization Admin',
      roleName: 'orgadmin',
      email: process.env.ORGADMIN_EMAIL,
      password: process.env.ORGADMIN_PASSWORD,
    },
  ];

  for (const account of accounts) {
    test(`Dynamically discover and navigate all pages for ${account.role}`, async ({ page }) => {
      test.skip(!account.email || !account.password, `Credentials not set for ${account.role}`);
      test.setTimeout(120_000);

      const login = new LoginPage(page);
      const app = new AppPage(page);

      console.log(`\n======================================================`);
      console.log(`Starting Dynamic Page Discovery for: ${account.role}`);
      console.log(`======================================================`);

      // 1. Open the configured app URL and login
      await login.open();
      await login.login(account);

      // 2. Discover all sidebar navigation buttons dynamically
      const sidebarContent = page.locator('[data-sidebar="content"]');
      await sidebarContent.waitFor({ state: 'visible', timeout: 20_000 });
      const menuButtons = sidebarContent.locator('[data-sidebar="menu-button"]');
      await menuButtons.first().waitFor({ state: 'visible', timeout: 10_000 });

      const totalItems = await menuButtons.count();
      const discoveredPages = [];

      for (let i = 0; i < totalItems; i++) {
        const text = (await menuButtons.nth(i).innerText()).trim();
        if (text) {
          discoveredPages.push({ index: i, label: text });
        }
      }

      console.log(`Discovered ${discoveredPages.length} pages dynamically for ${account.role}:`);
      discoveredPages.forEach((p, idx) => console.log(`  ${idx + 1}. ${p.label}`));

      // 3. Dynamically navigate each page without hardcoding
      const results = [];

      for (const item of discoveredPages) {
        const btn = menuButtons.nth(item.index);
        await btn.scrollIntoViewIfNeeded();
        await btn.click();

        // Allow route transition to settle
        await page.waitForLoadState('domcontentloaded');
        await page.waitForTimeout(800);

        const currentUrl = page.url();
        const heading = await page.locator('h1, h2, [role="heading"]').first().innerText().catch(() => 'N/A');

        console.log(`  [Visited] ${item.label.padEnd(20)} -> ${currentUrl} (Heading: "${heading.trim()}")`);

        // Verify page didn't crash or bounce back to login
        await expect(page).not.toHaveURL(/\/login/i);

        results.push({
          pageIndex: results.length + 1,
          label: item.label,
          url: currentUrl,
          heading: heading.trim(),
        });
      }

      console.log(`\nDiscovered & Navigated ${results.length} total pages for ${account.role}.`);
      expect(results.length).toBe(discoveredPages.length);

      // 4. Logout
      await app.logout();
    });
  }
});
