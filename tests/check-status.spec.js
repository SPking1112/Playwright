require('dotenv').config();
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

test.describe('Check Status Automation', () => {
  test('Check and report status of Cases, Jobs, and Sync Processing', async ({ page }) => {
    test.setTimeout(90_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    console.log(`\n========================================`);
    console.log(`[Task: Check Status] Auditing S1 Status Across Modules`);
    console.log(`========================================\n`);

    // 1. Sign in
    await login.open();
    await login.login({ email, password });

    // 2. Check Cases
    console.log('[Module 1: Cases] Inspecting cases list...');
    await app.navigateTo('Cases', '/cases');
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'status_cases');

    const caseRows = page.locator('table tbody tr');
    const caseCount = await caseRows.count().catch(() => 0);
    console.log(`- Total Cases Found on first page: ${caseCount}`);

    const caseSample = [];
    for (let i = 0; i < Math.min(caseCount, 5); i++) {
      const rowText = await caseRows.nth(i).innerText().catch(() => '');
      const parts = rowText.split('\t').map(s => s.trim()).filter(Boolean);
      caseSample.push({ index: i + 1, details: parts.slice(0, 3).join(' | ') });
    }
    if (caseSample.length > 0) {
      console.log('  Recent Cases Sample:');
      caseSample.forEach(c => console.log(`    [#${c.index}] ${c.details}`));
    }

    // 3. Check Jobs
    console.log('\n[Module 2: Jobs] Inspecting jobs list and statuses...');
    await app.navigateTo('Jobs', '/jobs');
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'status_jobs');

    const jobRows = page.locator('table tbody tr');
    const jobCount = await jobRows.count().catch(() => 0);
    const jobHeaders = await page.getByRole('columnheader').allTextContents();
    const statusColumnIndex = jobHeaders.findIndex((header) => header.trim() === 'Status');
    expect(statusColumnIndex, 'Jobs table must include a Status column').toBeGreaterThanOrEqual(0);
    console.log(`- Total Jobs Found on first page: ${jobCount}`);

    const jobSample = [];
    for (let i = 0; i < Math.min(jobCount, 5); i++) {
      const row = jobRows.nth(i);
      const rowText = await row.innerText().catch(() => '');
      const status = (await row.getByRole('cell').nth(statusColumnIndex).innerText()).trim() || 'N/A';
      const parts = rowText.split('\t').map(s => s.trim()).filter(Boolean);
      jobSample.push({ index: i + 1, name: parts[0] || 'Unknown', status });
    }
    if (jobSample.length > 0) {
      console.log('  Recent Jobs & Statuses:');
      jobSample.forEach(j => console.log(`    [#${j.index}] Job: "${j.name}" -> Status: [${j.status}]`));
    }

    // 4. Check Sync Queue if accessible
    console.log('\n[Module 3: Sync Queue] Checking sync jobs processing queue...');
    try {
      await page.goto('/sync-editor/queue', { timeout: 15_000 });
      await app.waitForPageContent();
      await app.takeScreenshot('admin', 'status_sync_queue');

      const queueRows = page.locator('table tbody tr');
      const queueCount = await queueRows.count().catch(() => 0);
      console.log(`- Sync Queue Items Found: ${queueCount}`);
    } catch (_) {
      console.log('- Sync Queue route not directly reachable or permissions restricted for current role.');
    }

    console.log('\n========================================');
    console.log('Status Audit Completed Successfully!');
    console.log('Screenshots saved in pot/check-status/admin/:');
    console.log('- admin_status_cases.png');
    console.log('- admin_status_jobs.png');
    console.log('- admin_status_sync_queue.png');
    console.log('========================================\n');
  });
});
