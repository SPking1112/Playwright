require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('../fixtures/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { JobsPage } = require('../pages/jobs.page');

test.describe('End-to-End: Create Case, Job, Upload Files & Process Sync Job', () => {
  test('Create Case and Job, upload matching transcript and media, and process sync', async ({ page }) => {
    test.setTimeout(0); // Unlimited timeout to wait until large media upload & processing finishes completely

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const jobsPage = new JobsPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const {
      getCaseFormData,
      getJobFormData,
      getFixtureFilePaths,
      getMatchingFixturePair,
    } = require('../fixtures/data');
    const caseData = getCaseFormData();
    const jobData = getJobFormData();
    const { exhibits } = getFixtureFilePaths();
    const twoExhibits = (exhibits || []).slice(0, 2);

    const caseName = caseData.name;
    const jobName = jobData.name;
    const jobRef = jobData.clientJobRef;
    const matchingPair = getMatchingFixturePair();
    const transcriptPath = matchingPair.transcript;
    const mediaPath = matchingPair.media;
    const matchingBaseName = matchingPair.baseName;

    expect(fs.existsSync(transcriptPath), `Transcript file missing at ${transcriptPath}`).toBeTruthy();
    expect(fs.existsSync(mediaPath), `Media file missing at ${mediaPath}`).toBeTruthy();
    expect(
      path.parse(transcriptPath).name.toLowerCase(),
      'Transcript and media files must have the same base name',
    ).toBe(path.parse(mediaPath).name.toLowerCase());

    console.log(`\n========================================`);
    console.log(`Starting E2E Workflow using Stored Test Data:`);
    console.log(`- Case Name: ${caseName}`);
    console.log(`- Job Name: ${jobName}`);
    console.log(`- Job Category: ${jobData.category}`);
    console.log(`- Client Ref: ${jobRef}`);
    console.log(`- Matching Base Name: ${matchingBaseName}`);
    console.log(`- Transcript: ${path.basename(transcriptPath)} (${fs.statSync(transcriptPath).size} bytes)`);
    console.log(`- Media: ${path.basename(mediaPath)} (${fs.statSync(mediaPath).size} bytes)`);
    console.log(`- Exhibits (${twoExhibits.length}): ${twoExhibits.map(p => path.basename(p)).join(', ')}`);
    console.log(`========================================\n`);

    // 1. Sign in as Org Admin
    await login.open();
    await login.login({ email, password });
    await app.takeScreenshot('admin', 'dashboard');

    // 2. Navigate to Cases
    console.log('[Step 1] Navigating to Cases...');
    await app.navigateTo('Cases', '/cases');
    await app.takeScreenshot('admin', 'cases_list');

    // 3. Create New Case: "playwright"
    console.log(`[Step 2] Creating Case "${caseName}"...`);
    const openCreateCaseBtn = page.getByRole('button', { name: /create case|new case/i }).first();
    await expect(openCreateCaseBtn).toBeVisible({ timeout: 15_000 });
    await openCreateCaseBtn.click();

    const caseDialog = page.locator('div[role="dialog"]:has-text("Create Case")').first();
    await expect(caseDialog).toBeVisible({ timeout: 10_000 });

    // Fill Case Name (input #name)
    const caseNameInput = caseDialog.locator('#name').or(caseDialog.locator('#caseName')).or(caseDialog.getByLabel(/case name/i)).first();
    await expect(caseNameInput).toBeVisible({ timeout: 5000 });
    await caseNameInput.fill(caseName);

    // Fill Description (Required field #description)
    const descInput = caseDialog.locator('#description').or(caseDialog.locator('textarea')).first();
    await expect(descInput).toBeVisible({ timeout: 5000 });
    await descInput.fill(caseData.description || 'Automated test case for Stenograph One');

    // Wait for product instances to finish loading from API
    await caseDialog.locator('text=Loading products').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    // Select Product Instance (Required field #product)
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

    // If still on cases list, click the newly created case
    if (page.url().endsWith('/cases') || !page.url().includes('/cases/')) {
      const caseLink = page.locator(`table tbody tr:has-text("${caseName}"), a:has-text("${caseName}")`).first();
      if (await caseLink.isVisible({ timeout: 5000 }).catch(() => false)) {
        await caseLink.click();
      }
    }

    // Wait for Case Detail page
    await page.waitForURL(/\/cases\/[0-9a-fA-F-]+/, { timeout: 20_000 });
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'case_created');
    console.log(`[Step 2] Case Detail loaded: ${page.url()}`);

    // 4. Create New Job
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
    await jobDialog.waitFor({ state: 'detached', timeout: 1000 }).catch(() => {});
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

    // 5. In Job Details page: Upload 2 Exhibits into Artifacts
    if (twoExhibits.length > 0) {
      console.log(`[Step 4] Uploading ${twoExhibits.length} exhibits into Job Artifacts...`);
      const artifactFileInput = page.locator('input[type="file"]').last();
      await expect(artifactFileInput).toBeAttached({ timeout: 10_000 });
      await artifactFileInput.setInputFiles(twoExhibits);

      // Wait for upload spinner to settle
      await page.waitForTimeout(2000);
      const uploadingSpinner = page.locator('.animate-spin').first();
      if (await uploadingSpinner.isVisible({ timeout: 2000 }).catch(() => false)) {
        await uploadingSpinner.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
      }
      await app.waitForPageContent();
      await app.takeScreenshot('admin', 'job_artifacts_uploaded');
      console.log(`[Step 4] ${twoExhibits.length} exhibits uploaded into Job Artifacts.`);
    }

    // 6. Open Sync Generator
    console.log('[Step 5] Opening Sync Generator for this job...');
    const syncGenCard = page.locator('div:has-text("Sync Generator")').last();
    await syncGenCard.scrollIntoViewIfNeeded().catch(() => {});

    const openSyncBtn = page.getByRole('button', { name: /open sync generator|set up sync job|create sync job/i }).first();
    await expect(openSyncBtn).toBeVisible({ timeout: 15_000 });
    await openSyncBtn.click();

    await page.waitForURL(/\/sync-generator\/[^/]+\/setup/, { timeout: 25_000 });
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_setup');
    console.log(`[Step 5] Sync Generator Setup loaded: ${page.url()}`);

    // 7. In Sync Generator Setup: Import 2 Exhibits via "Show Artifacts"
    if (twoExhibits.length > 0) {
      console.log('[Step 6] Opening "Show Artifacts" to import 2 exhibits...');
      const exhibitsSection = page.locator('div:has-text("Exhibits")').last();
      await exhibitsSection.scrollIntoViewIfNeeded().catch(() => {});

      const showArtifactsBtn = exhibitsSection.getByRole('button', { name: /show artifacts/i }).first();
      if (await showArtifactsBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
        await showArtifactsBtn.click();

        const artifactsDialog = page.locator('div[role="dialog"]:has-text("Select Exhibits from Artifacts"), div[role="dialog"]:has-text("Artifacts")').first();
        await expect(artifactsDialog).toBeVisible({ timeout: 10_000 });
        await app.takeScreenshot('admin', 'show_artifacts_dialog');

        await artifactsDialog.locator('text=Loading artifacts').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
        await page.waitForTimeout(500);

        const addButtons = artifactsDialog.getByRole('button', { name: /^Add$/i });
        const count = await addButtons.count();
        const toAdd = Math.min(count, 2);
        for (let i = 0; i < toAdd; i++) {
          const currentAddBtn = artifactsDialog.getByRole('button', { name: /^Add$/i }).first();
          if (await currentAddBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
            await currentAddBtn.click();
            await page.waitForTimeout(800);
          }
        }

        const closeDialogBtn = artifactsDialog.getByRole('button', { name: /^Close$/i }).or(artifactsDialog.locator('button[aria-label="Close"]')).first();
        await closeDialogBtn.click().catch(() => page.keyboard.press('Escape'));
        await artifactsDialog.waitFor({ state: 'detached', timeout: 8000 }).catch(() => page.keyboard.press('Escape'));
        await app.waitForPageContent();
        await app.takeScreenshot('admin', 'sync_gen_exhibits_added');
        console.log('[Step 6] 2 exhibits imported and Show Artifacts dialog closed.');
      }
    }

    // 8. Upload the transcript and media pair with matching base names
    const transcriptFileName = path.basename(transcriptPath);
    console.log(`\n[Step 7] Uploading matching transcript "${transcriptFileName}"...`);
    await jobsPage.uploadTranscript(transcriptPath);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_transcript_uploaded');
    console.log(`[Step 7] Matching transcript "${transcriptFileName}" uploaded.`);

    const mediaFileName = path.basename(mediaPath);
    console.log(`[Step 8] Uploading matching media "${mediaFileName}"...`);
    await jobsPage.uploadMedia(mediaPath);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_media_uploaded');
    console.log(`[Step 8] Matching media "${mediaFileName}" uploaded and finalized.`);

    // 9. Process the sync job after both matching files are uploaded
    console.log('[Step 9] Starting sync processing...');
    const processButton = page.getByRole('button', { name: /^Process$/i }).first();
    await expect(processButton).toBeVisible({ timeout: 15_000 });
    await expect(processButton).toBeEnabled({ timeout: 15_000 });

    const processResponsePromise = page.waitForResponse(
      (response) => (response.url().includes('/sync/jobs') || response.url().includes('/orders'))
        && response.request().method() === 'POST',
      { timeout: 30_000 },
    );
    await processButton.click();
    const processResponse = await processResponsePromise;
    const processResponseError = await processResponse.finished();
    if (processResponseError) {
      throw new Error(`Sync processing request did not finish: ${processResponseError.message}`);
    }
    if (!processResponse.ok()) {
      throw new Error(`Sync processing API failed with HTTP ${processResponse.status()}.`);
    }

    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_job_processing');

    console.log('\n========================================');
    console.log('Sync processing request accepted successfully.');
    console.log(`- Matching Base Name: ${matchingBaseName}`);
    console.log(`- Transcript: ${transcriptFileName}`);
    console.log(`- Media: ${mediaFileName}`);
    console.log('All screenshots saved in pot/create-case-job-sync/admin/:');
    console.log('- admin_case_created.png');
    console.log('- admin_job_created.png');
    console.log('- admin_sync_gen_setup.png');
    console.log('- admin_sync_gen_transcript_uploaded.png');
    console.log('- admin_sync_gen_media_uploaded.png');
    console.log('- admin_sync_job_processing.png');
    console.log('========================================\n');
  });
});
