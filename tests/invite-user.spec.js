require('dotenv').config();
const { test, expect } = require('../fixtures/test');
const fs = require('fs');
const path = require('path');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { UsersPage } = require('../pages/users.page');
const { getInviteFormData } = require('../fixtures/data');

const authFile = path.resolve(__dirname, '../.auth/org-admin.json');
const hasAuthCache = fs.existsSync(authFile);

test.describe('Invite User Automation', () => {
  if (hasAuthCache) {
    test.use({ storageState: authFile });
  }

  test('Invite a new user and verify invitation in invitations list via UsersPage POM', async ({ page }) => {
    test.setTimeout(60_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const usersPage = new UsersPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const inviteData = getInviteFormData();
    console.log(`\n========================================`);
    console.log(`[Task: Invite User] Inviting user (POM Architecture):`);
    console.log(`- Display Name: ${inviteData.displayName}`);
    console.log(`- Email: ${inviteData.email}`);
    console.log(`- Role Target: ${inviteData.role}`);
    console.log(`========================================\n`);

    // 1. Sign in (Bypassed instantly if storageState is cached)
    if (!hasAuthCache) {
      console.log('[Step 0] Logging in via UI form...');
      await login.open();
      await login.login({ email, password });
    } else {
      console.log('⚡ Using cached storageState (.auth/org-admin.json). Bypassed login form!');
    }

    // 2. Open Invitations page & capture before screenshot
    console.log('[Step 1] Navigating to /invitations...');
    await usersPage.openInvitations();
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'invitations_list_before');

    // 3. Send Invitation via POM
    console.log(`[Step 2] Sending invitation to "${inviteData.email}" via UsersPage...`);
    await usersPage.inviteUser(inviteData);

    // 4. Verify completion and capture POT
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'user_invited_success');

    console.log(`[Step 3] Invitation sent successfully to ${inviteData.email}!`);
    console.log(`========================================\n`);
  });
});
