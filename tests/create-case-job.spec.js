require('dotenv').config();
const { test, expect } = require('@playwright/test');
const fs = require('fs');
const path = require('path');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { getCaseFormData, getJobFormData } = require('../fixtures/data');

const authFile = path.resolve(__dirname, '../.auth/org-admin.json');
const hasAuthCache = fs.existsSync(authFile);

test.describe('Create Case and Job Flow with Sync Gen Screenshot', () => {
  if (hasAuthCache) {
    test.use({ storageState: authFile });
  }

  test('Create Case, create Job, open Sync Generator, and capture screenshots', async ({ page }) => {
    test.setTimeout(90_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const caseData = getCaseFormData();
    const jobData = getJobFormData();
    const caseName = caseData.name;
    const jobName = jobData.name;
    const jobRef = jobData.clientJobRef;

    console.log(`\n========================================`);
    console.log(`Starting Create Case & Job Flow:`);
    console.log(`- Case Name: ${caseName}`);
    console.log(`- Job Name: ${jobName}`);
    console.log(`- Client Ref: ${jobRef}`);
    console.log(`========================================\n`);

    // 1. Sign in as Org Admin (Bypassed instantly if storageState is cached)
    if (!hasAuthCache) {
      console.log('[Step 0] Logging in via UI form...');
      await login.open();
      await login.login({ email, password });
      await app.takeScreenshot('admin', 'dashboard');
    } else {
      console.log('⚡ Using cached storageState (.auth/org-admin.json). Bypassed login form!');
    }

    // 2. Navigate to Cases
    console.log('[Step 1] Navigating to Cases...');
    await app.navigateTo('Cases', '/cases');
    await app.takeScreenshot('admin', 'cases_list');

    // 3. Create New Case
    console.log(`[Step 2] Creating Case "${caseName}"...`);
    const openCreateCaseBtn = page.getByRole('button', { name: /create case|new case/i }).first();
    await expect(openCreateCaseBtn).toBeVisible({ timeout: 15_000 });
    await openCreateCaseBtn.click();

    const caseDialog = page.locator('div[role="dialog"]:has-text("Create Case")').first();
    await expect(caseDialog).toBeVisible({ timeout: 10_000 });

    // Fill Case Name
    const caseNameInput = caseDialog.locator('#name').or(caseDialog.locator('#caseName')).or(caseDialog.getByLabel(/case name/i)).first();
    await expect(caseNameInput).toBeVisible({ timeout: 5000 });
    await caseNameInput.fill(caseName);

    // Fill Description
    const descInput = caseDialog.locator('#description').or(caseDialog.locator('textarea')).first();
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.fill(caseData.description || 'Automated test case for Stenograph One');

    // Wait for product instances to finish loading from API
    await caseDialog.locator('text=Loading products').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    // Select Product Instance if needed
    const productSelect = caseDialog.locator('#product').first();
    if (await productSelect.isVisible({ timeout: 5000 }).catch(() => false)) {
      const selectText = await productSelect.innerText().catch(() => '');
      if (!selectText || selectText.includes('Select')) {
        await productSelect.click();
        await page.waitForTimeout(300);
        const firstOption = page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 4000 }).catch(() => false)) {
          await firstOption.click();
        }
      }
    }

    // Submit Create Case
    const submitCaseBtn = caseDialog.getByRole('button', { name: /create & open|create case/i }).first();
    await expect(submitCaseBtn).toBeEnabled({ timeout: 10_000 });
    await submitCaseBtn.click();
    await page.waitForTimeout(1000);

    // Navigate to Case Detail if still on list
    if (page.url().endsWith('/cases') || !page.url().includes('/cases/')) {
      const caseLink = page.locator(`table tbody tr:has-text("${caseName}"), a:has-text("${caseName}")`).first();
      if (await caseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await caseLink.click();
      }
    }

    await page.waitForURL(/\/cases\/[0-9a-fA-F-]+/, { timeout: 20_000 });
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'case_created');
    console.log(`[Step 2] Case Detail loaded: ${page.url()}`);

    // 4. Create New Job inside Case
    console.log(`[Step 3] Creating Job "${jobName}" inside case...`);
    const addJobBtn = page.getByRole('button', { name: /new job|add job|create job/i }).first();
    await expect(addJobBtn).toBeVisible({ timeout: 15_000 });
    await addJobBtn.click();

    const jobDialog = page.locator('div[role="dialog"]:has-text("Create Job")').first();
    await expect(jobDialog).toBeVisible({ timeout: 10_000 });

    // Fill Job Name
    const jobNameInput = jobDialog.locator('#job-name').or(jobDialog.getByLabel(/job name/i)).first();
    await expect(jobNameInput).toBeVisible({ timeout: 5000 });
    await jobNameInput.fill(jobName);

    // Select Category (Deposition)
    const categorySelect = jobDialog.locator('#job-category');
    if (await categorySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await categorySelect.click();
      await page.waitForTimeout(200);
      const option = page.locator('[role="option"]:has-text("Deposition"), [role="option"]').first();
      await expect(option).toBeVisible({ timeout: 3000 });
      await option.click();
    }

    // Fill Client Job Ref
    const jobRefInput = jobDialog.locator('#job-ref').or(jobDialog.getByLabel(/client job ref/i)).first();
    await expect(jobRefInput).toBeVisible({ timeout: 5000 });
    await jobRefInput.fill(jobRef);

    // Submit Create Job
    const submitJobBtn = jobDialog.getByRole('button', { name: /^Create Job$/i }).or(jobDialog.getByRole('button', { name: /create job/i })).first();
    await expect(submitJobBtn).toBeEnabled({ timeout: 10_000 });
    await submitJobBtn.click();

    // Wait for dialog to close
    await jobDialog.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
    await page.waitForTimeout(1000);

    // Navigate into the Job Details page by clicking the job in the table
    if (!page.url().includes('/jobs/')) {
      const jobRow = page.locator(`table tbody tr:has-text("${jobName}")`).first();
      await expect(jobRow).toBeVisible({ timeout: 15_000 });
      await jobRow.click();
    }

    await page.waitForURL(/\/jobs\/[0-9a-fA-F-]+/, { timeout: 25_000 });
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'job_created');
    console.log(`[Step 3] Job Details loaded: ${page.url()}`);

    // 5. Open Sync Generator from Job Details page
    console.log('[Step 4] Opening Sync Generator for this job...');
    const openSyncBtn = page.getByRole('button', { name: /open sync generator|set up sync job|create sync job/i }).first();
    const syncAccessRequired = page.getByText(/Contact your administrator to request access/).first();
    await expect(openSyncBtn.or(syncAccessRequired)).toBeVisible({ timeout: 15_000 });
    test.skip(
      await syncAccessRequired.isVisible(),
      'Sync Generator access is not provisioned for this organization.',
    );
    await openSyncBtn.click();

    await page.waitForURL(/\/sync-generator\/[^/]+\/setup/, { timeout: 25_000 });
    await app.waitForPageContent();

    // Capture high-res screenshot of the Sync Generator Setup page
    await app.takeScreenshot('admin', 'sync_gen_setup');
    console.log(`[Step 4] Sync Generator Setup screenshot captured: ${page.url()}`);

    console.log('\n========================================');
    console.log('Create Case & Job Flow Completed Successfully!');
    console.log('Screenshots saved in pot/create-case-job/admin/:');
    console.log('- admin_dashboard.png');
    console.log('- admin_cases_list.png');
    console.log('- admin_case_created.png');
    console.log('- admin_job_created.png');
    console.log('- admin_sync_gen_setup.png');
    console.log('========================================\n');
  });
});
