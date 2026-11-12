require('dotenv').config();
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { UsersPage } = require('../pages/users.page');
const { getUserFormData } = require('../fixtures/data');

const authFile = path.resolve(__dirname, '../.auth/org-admin.json');
const hasAuthCache = fs.existsSync(authFile);

test.describe('Create User Automation', () => {
  if (hasAuthCache) {
    test.use({ storageState: authFile });
  }

  test('Create a direct user in the organization via UsersPage POM', async ({ page }) => {
    test.setTimeout(60_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const usersPage = new UsersPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const userData = getUserFormData();
    console.log(`\n========================================`);
    console.log(`[Task: Create User] Creating user (POM Architecture):`);
    console.log(`- Display Name: ${userData.displayName}`);
    console.log(`- Email: ${userData.email}`);
    console.log(`- Role Target: ${userData.role}`);
    console.log(`========================================\n`);

    // 1. Sign in (Bypassed instantly if storageState is cached)
    if (!hasAuthCache) {
      console.log('[Step 0] Logging in via UI form...');
      await login.open();
      await login.login({ email, password });
    } else {
      console.log('⚡ Using cached storageState (.auth/org-admin.json). Bypassed login form!');
    }

    // 2. Navigate to Users page & capture before screenshot
    console.log('[Step 1] Navigating to /users...');
    await usersPage.openUsers();
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'users_list_before');

    // 3. Create user via POM
    console.log(`[Step 2] Submitting user "${userData.displayName}" via UsersPage...`);
    await usersPage.createUser(userData);

    // 4. Verify completion and capture POT
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'user_created_success');

    console.log(`[Step 3] User "${userData.displayName}" created successfully!`);
    console.log(`========================================\n`);
  });
});
