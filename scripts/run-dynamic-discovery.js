const { baseURL } = require('../env');
const { chromium } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

async function discoverPagesForRole(roleConfig) {
  console.log(`\n===============================================================`);
  console.log(`Dynamic Navigation Discovery: ${roleConfig.role}`);
  console.log(`Target URL: ${baseURL}`);
  console.log(`===============================================================`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    baseURL,
    viewport: { width: 1440, height: 900 },
  });
  const page = await context.newPage();

  try {
    const login = new LoginPage(page);
    const app = new AppPage(page);

    console.log(`1. Navigating to ${baseURL}/login ...`);
    await login.open();

    console.log(`2. Logging in with ${roleConfig.email} ...`);
    await login.login(roleConfig);

    console.log(`3. Waiting for sidebar navigation menu ...`);
    const sidebar = page.locator('[data-sidebar="content"]');
    await sidebar.waitFor({ state: 'visible', timeout: 20_000 });

    const menuButtons = sidebar.locator('[data-sidebar="menu-button"]');
    await menuButtons.first().waitFor({ state: 'visible', timeout: 10_000 });

    const totalButtons = await menuButtons.count();
    const discoveredItems = [];

    for (let i = 0; i < totalButtons; i++) {
      const text = (await menuButtons.nth(i).innerText()).trim();
      if (text) {
        discoveredItems.push({ index: i, label: text });
      }
    }

    console.log(`\nFound ${discoveredItems.length} dynamic pages/routes for ${roleConfig.role}:`);

    const visitedPages = [];

    for (const item of discoveredItems) {
      const btn = menuButtons.nth(item.index);
      await btn.scrollIntoViewIfNeeded();
      await btn.click();

      await page.waitForLoadState('domcontentloaded');
      await page.waitForTimeout(600);

      const currentUrl = page.url();
      let heading = await page.locator('h1, h2, [role="heading"]').first().innerText().catch(() => '');
      heading = heading.replace(/\s+/g, ' ').trim() || 'N/A';

      visitedPages.push({
        '#': visitedPages.length + 1,
        'Page Name': item.label,
        'Navigated URL': currentUrl,
        'Heading/Title': heading,
      });

      console.log(`  [${visitedPages.length}/${discoveredItems.length}] ${item.label.padEnd(20)} -> ${currentUrl}`);
    }

    console.log(`\nAll ${visitedPages.length} pages were dynamically navigated without any hardcoding!`);
    console.table(visitedPages);

    return visitedPages;
  } finally {
    await browser.close();
  }
}

(async () => {
  const platformAdmin = {
    role: 'Platform Admin',
    email: process.env.PLATFORM_EMAIL,
    password: process.env.PLATFORM_PASSWORD,
  };

  const orgAdmin = {
    role: 'Organization Admin',
    email: process.env.ORGADMIN_EMAIL,
    password: process.env.ORGADMIN_PASSWORD,
  };

  if (platformAdmin.email && platformAdmin.password) {
    await discoverPagesForRole(platformAdmin);
  }

  if (orgAdmin.email && orgAdmin.password) {
    await discoverPagesForRole(orgAdmin);
  }
})().catch(err => {
  console.error('Fatal error during dynamic page discovery:', err);
  process.exit(1);
});
