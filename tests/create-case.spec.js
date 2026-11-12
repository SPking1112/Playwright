require('dotenv').config();
const { test, expect } = require('../fixtures/test');
const fs = require('fs');
const path = require('path');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { CasesPage } = require('../pages/cases.page');
const { getCaseFormData } = require('../fixtures/data');

const authFile = path.resolve(__dirname, '../.auth/org-admin.json');
const hasAuthCache = fs.existsSync(authFile);

test.describe('Create Case Automation', () => {
  if (hasAuthCache) {
    test.use({ storageState: authFile });
  }

  test('Create a new Case and verify in list and details via POM', async ({ page }) => {
    test.setTimeout(60_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const casesPage = new CasesPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const caseData = getCaseFormData();
    const caseName = caseData.name;

    console.log(`\n========================================`);
    console.log(`[Task: Create Case] Starting for: "${caseName}" (POM Architecture)`);
    console.log(`========================================\n`);

    // 1. Sign in (Bypassed instantly if storageState is cached)
    if (!hasAuthCache) {
      console.log('[Step 0] Logging in via UI form...');
      await login.open();
      await login.login({ email, password });
    } else {
      console.log('⚡ Using cached storageState (.auth/org-admin.json). Bypassed login form!');
    }

    // 2. Open Cases & Capture before screenshot
    console.log('[Step 1] Navigating to /cases...');
    await casesPage.open();
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'cases_list_before');

    // 3. Create Case via POM
    console.log(`[Step 2] Creating Case "${caseName}" via CasesPage...`);
    await casesPage.createCase(caseData);

    // 4. Verify loaded page & screenshot
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'case_created_success');

    console.log(`[Step 3] Case "${caseName}" successfully created at: ${page.url()}`);
    console.log(`========================================\n`);
  });
});
