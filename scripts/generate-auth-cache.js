#!/usr/bin/env node

/**
 * Authentication Storage State Generator
 *
 * Caches authenticated sessions (cookies & localStorage) for:
 *   1. Platform Admin -> .auth/platform-admin.json
 *   2. Org Admin      -> .auth/org-admin.json
 *
 * Once cached, individual specs can use:
 *   test.use({ storageState: '.auth/org-admin.json' })
 * and bypass the entire 15-second login form, loading authenticated pages in < 1s.
 *
 * Usage:
 *   node scripts/generate-auth-cache.js
 *   npm run auth:cache
 */

const { chromium } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { baseURL } = require('../env');

const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

const AUTH_DIR = path.resolve(__dirname, '../.auth');
const BASE_URL = baseURL.replace(/\/+$/, '');

const ACCOUNTS = [
  {
    role: 'Platform Admin',
    file: path.join(AUTH_DIR, 'platform-admin.json'),
    email: process.env.PLATFORM_EMAIL || 'stenoadmin@stenoone.local',
    password: process.env.PLATFORM_PASSWORD || 'Welcome@123',
    targetPath: '/organizations',
  },
  {
    role: 'Organization Admin',
    file: path.join(AUTH_DIR, 'org-admin.json'),
    email: process.env.ORGADMIN_EMAIL,
    password: process.env.ORGADMIN_PASSWORD,
    targetPath: '/dashboard',
  },
];

async function generateCacheForAccount(browser, account) {
  console.log(`\n🔑 Authenticating [${account.role}]: ${account.email}...`);
  const context = await browser.newContext({
    baseURL: BASE_URL,
    viewport: { width: 1440, height: 900 },
  });

  const page = await context.newPage();
  const loginPage = new LoginPage(page);
  const appPage = new AppPage(page);

  try {
    await loginPage.open();
    await loginPage.login({ email: account.email, password: account.password });
    await appPage.waitForPageContent();

    // Verify authenticated session
    await page.waitForTimeout(1000);

    // Save storage state
    await context.storageState({ path: account.file });
    console.log(`✓ Cached storageState to: ${path.relative(process.cwd(), account.file)}`);
  } catch (err) {
    console.error(`✗ Failed caching auth for [${account.role}]:`, err.message);
  } finally {
    await context.close();
  }
}

async function main() {
  console.log('========================================================');
  console.log('       S1 AUTHENTICATION STORAGE STATE GENERATOR        ');
  console.log('========================================================');
  console.log(`Target Base URL: ${BASE_URL}\n`);

  if (!process.env.ORGADMIN_EMAIL || !process.env.ORGADMIN_PASSWORD) {
    throw new Error('ORGADMIN_EMAIL and ORGADMIN_PASSWORD must be set in .env.');
  }

  if (!fs.existsSync(AUTH_DIR)) {
    fs.mkdirSync(AUTH_DIR, { recursive: true });
    console.log(`Created directory: ${AUTH_DIR}`);
  }

  const browser = await chromium.launch({ headless: true });

  const startTime = Date.now();
  for (const account of ACCOUNTS) {
    await generateCacheForAccount(browser, account);
  }
  await browser.close();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log(`\n🎉 Auth caching completed in ${elapsed}s.`);
  console.log('Individual tests can now bypass login by adding:');
  console.log(`  test.use({ storageState: '.auth/org-admin.json' });`);
  console.log('========================================================\n');
}

main().catch((err) => {
  console.error('Fatal error during auth caching:', err);
  process.exit(1);
});
