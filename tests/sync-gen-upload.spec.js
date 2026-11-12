require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

test.describe('Sync Generator - Org Admin Upload Transcript and Media', () => {
  test('Login as Org Admin, open Sync Gen, upload Sullivan.txt and Sullivan1.mp4', async ({ page }) => {
    test.setTimeout(0); // Unlimited timeout for large media file upload

    const login = new LoginPage(page);
    const app = new AppPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const { getFixtureFilePaths } = require('../fixtures/data');
    const { transcript: transcriptPath, media: mediaPath } = getFixtureFilePaths();

    expect(fs.existsSync(transcriptPath), `Transcript file missing at ${transcriptPath}`).toBeTruthy();
    expect(fs.existsSync(mediaPath), `Media file missing at ${mediaPath}`).toBeTruthy();

    console.log(`[SyncGen Test] Transcript file found: ${transcriptPath} (${fs.statSync(transcriptPath).size} bytes)`);
    console.log(`[SyncGen Test] Media file found: ${mediaPath} (${fs.statSync(mediaPath).size} bytes)`);

    // 1. Login as Org Admin
    await login.open();
    await login.login({ email, password });
    await app.takeScreenshot('admin', 'dashboard');

    // 2. Navigate to Jobs
    console.log('[SyncGen Test] Navigating to Jobs...');
    await app.navigateTo('Jobs', '/jobs');
    await app.takeScreenshot('admin', 'jobs');

    // 3. Find and open a Job
    console.log('[SyncGen Test] Locating an available job...');
    // Look for clickable job rows or links in table
    const jobRows = page.locator('table tbody tr');
    const jobCards = page.locator('[data-testid="job-card"], div.rounded-lg.border:has-text("Job")');

    let navigatedToJob = false;

    if (await jobRows.first().isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[SyncGen Test] Clicking first job in table...');
      // Click first clickable link or row
      const firstLink = jobRows.first().locator('a, button').first();
      if (await firstLink.isVisible()) {
        await firstLink.click();
      } else {
        await jobRows.first().click();
      }
      navigatedToJob = true;
    } else if (await jobCards.first().isVisible({ timeout: 3000 }).catch(() => false)) {
      console.log('[SyncGen Test] Clicking first job card...');
      await jobCards.first().click();
      navigatedToJob = true;
    }

    if (!navigatedToJob) {
      console.log('[SyncGen Test] No jobs found in table, checking for existing job or creating one...');
      // Check if there is a "New Job" or "Create Job" button
      const createJobBtn = page.getByRole('button', { name: /create job|new job/i }).first();
      if (await createJobBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await createJobBtn.click();
        await page.waitForTimeout(1000);
      }
    }

    // Wait for Job Details page
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'job_details');

    // 4. Locate and Open Sync Generator from Job Details page
    console.log('[SyncGen Test] Looking for Sync Generator card...');
    const syncGenCard = page.locator('div:has-text("Sync Generator")').last();
    await syncGenCard.scrollIntoViewIfNeeded().catch(() => {});

    const openSyncBtn = page.getByRole('button', { name: /open sync generator|set up sync job|create sync job/i }).first();
    const createSyncBtn = page.getByRole('button', { name: /create sync job/i }).first();

    if (await openSyncBtn.isVisible({ timeout: 10_000 }).catch(() => false)) {
      console.log('[SyncGen Test] Clicking Open/Create Sync Generator button...');
      await openSyncBtn.click();
    } else if (await createSyncBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      console.log('[SyncGen Test] Clicking Create Sync Job button...');
      await createSyncBtn.click();
    } else {
      console.log('[SyncGen Test] Searching for any Sync Generator link or button...');
      const anySyncBtn = page.locator('button:has-text("Sync"), a[href*="/sync-generator/"]').first();
      await expect(anySyncBtn).toBeVisible({ timeout: 10_000 });
      await anySyncBtn.click();
    }

    // 5. Land on Sync Generator Setup page
    await page.waitForURL(/\/sync-generator\/[^/]+\/setup/, { timeout: 25_000 });
    console.log(`[SyncGen Test] Landed on Sync Generator Setup: ${page.url()}`);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_setup');

    // 6. Upload Transcript
    const transcriptFileName = path.basename(transcriptPath);
    console.log(`[SyncGen Test] Uploading transcript: ${transcriptFileName}`);
    const transcriptInput = page.locator('input[type="file"][accept*=".txt"], input[type="file"][accept*=".mdb"]').first();
    await expect(transcriptInput).toBeAttached({ timeout: 10_000 });
    await transcriptInput.setInputFiles(transcriptPath);

    // Wait for upload processing and potential Set Transcript Lines modal
    await page.waitForTimeout(1500);

    const lineModal = page.locator('role=dialog[name*="Transcript Lines" i], div[role="dialog"]:has-text("Set Transcript Lines")').first();
    if (await lineModal.isVisible({ timeout: 8000 }).catch(() => false)) {
      console.log('[SyncGen Test] Set Transcript Lines modal appeared. Capturing screenshot and saving...');
      await app.takeScreenshot('admin', 'sync_gen_transcript_lines_modal');

      const confirmBtn = lineModal.getByRole('button', { name: /confirm defaults|save|close/i }).first();
      await confirmBtn.click();
      await page.waitForTimeout(1000);
    }

    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_transcript_uploaded');
    console.log(`[SyncGen Test] Transcript "${transcriptFileName}" uploaded successfully.`);

    // 7. Upload Media
    const mediaFileName = path.basename(mediaPath);
    console.log(`[SyncGen Test] Uploading media: ${mediaFileName}`);
    const mediaInput = page.locator('input[type="file"][accept*=".mp4"], input[type="file"][accept*=".mov"]').first();
    await expect(mediaInput).toBeAttached({ timeout: 10_000 });
    await mediaInput.setInputFiles(mediaPath);

    // Capture initial upload state
    await page.waitForTimeout(2000);
    await app.takeScreenshot('admin', 'sync_gen_media_uploading');

    // Wait for upload progress / completion with no timeout
    console.log('[SyncGen Test] Waiting for media upload to finalize (no timeout)...');
    const cancelUploadBtn = page.locator('button[title="Cancel upload"]').first();
    if (await cancelUploadBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await cancelUploadBtn.waitFor({ state: 'detached', timeout: 0 });
    }
    const removeMediaBtn = page.locator('button[title="Remove media"]').first();
    await expect(removeMediaBtn).toBeVisible({ timeout: 0 });

    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_media_uploaded');
    await app.takeScreenshot('admin', 'sync_gen_ready');

    console.log('[SyncGen Test] All uploads and POT screenshots completed successfully!');
  });
});
