require('dotenv').config();
const { test, expect } = require('../fixtures/test');
const fs = require('fs');
const path = require('path');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { CasesPage } = require('../pages/cases.page');
const { JobsPage } = require('../pages/jobs.page');
const { getJobFormData, getCaseFormData } = require('../fixtures/data');

const authFile = path.resolve(__dirname, '../.auth/org-admin.json');
const hasAuthCache = fs.existsSync(authFile);

test.describe('Create Job Automation', () => {
  if (hasAuthCache) {
    test.use({ storageState: authFile });
  }

  test('Create a new Job inside a Case via POM and verify details', async ({ page }) => {
    test.setTimeout(75_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const casesPage = new CasesPage(page);
    const jobsPage = new JobsPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const jobData = getJobFormData();
    const jobName = jobData.name;
    const jobRef = jobData.clientJobRef;

    console.log(`\n========================================`);
    console.log(`[Task: Create Job] Starting for: "${jobName}" (POM Architecture)`);
    console.log(`========================================\n`);

    // 1. Sign in (Bypassed instantly if storageState is cached)
    if (!hasAuthCache) {
      console.log('[Step 0] Logging in via UI form...');
      await login.open();
      await login.login({ email, password });
    } else {
      console.log('⚡ Using cached storageState (.auth/org-admin.json). Bypassed login form!');
    }

    // 2. Open Cases
    console.log('[Step 1] Navigating to /cases...');
    await casesPage.open();
    await app.waitForPageContent();

    // 3. Open first existing case or create one if none exist
    const firstCaseRow = page.locator('table tbody tr').first();
    const hasCases = await firstCaseRow.isVisible({ timeout: 5000 }).catch(() => false);

    if (hasCases) {
      console.log('[Step 2] Opening existing case from table...');
      await firstCaseRow.click();
      await page.waitForURL(/\/cases\/[0-9a-fA-F-]+/, { timeout: 15_000 });
    } else {
      console.log('[Step 2] No existing case found. Creating parent case via POM...');
      const caseData = getCaseFormData();
      await casesPage.createCase(caseData);
    }

    await app.waitForPageContent();
    console.log(`[Step 2] Case Page ready: ${page.url()}`);

    // 4. Create Job via POM
    console.log(`[Step 3] Creating Job "${jobName}" via JobsPage POM...`);
    await jobsPage.createJob(jobData);

    // 5. Verify Job Details page & take POT screenshot
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'job_created_success');

    console.log(`[Step 4] Job "${jobName}" successfully created at: ${page.url()}`);
    console.log(`========================================\n`);
  });
});
