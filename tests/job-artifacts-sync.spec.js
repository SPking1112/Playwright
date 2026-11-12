require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('@playwright/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { CasesPage } = require('../pages/cases.page');
const { JobsPage } = require('../pages/jobs.page');
const { getCaseFormData, getJobFormData, getFixtureFilePaths, getMatchingFixturePair } = require('../fixtures/data');

test.describe('Job Details Artifacts Upload & Sync Gen Matching Files Flow (Without Processing)', () => {
  test('Upload 2 exhibits, open Sync Gen, import via Show Artifacts, upload matching transcript and media, and DO NOT process job', async ({ page }) => {
    test.setTimeout(0); // Unlimited timeout for media upload

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const casesPage = new CasesPage(page);
    const jobsPage = new JobsPage(page);

    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    const caseData = getCaseFormData();
    const jobData = getJobFormData();
    const { exhibits } = getFixtureFilePaths({ requiredExhibits: 2 });

    const caseName = caseData.name;
    const jobName = jobData.name;
    const jobRef = jobData.clientJobRef;

    // 1. Resolve a matching transcript and media pair from the external asset directory
    // (Prefer DYNAMIC_PAIR_NAME or the current job name when that pair is present)
    const targetDynamicName = process.env.DYNAMIC_PAIR_NAME || jobName;
    const matchingPair = getMatchingFixturePair({ baseName: targetDynamicName });
    const transcriptPath = matchingPair.transcript;
    const mediaPath = matchingPair.media;

    expect(fs.existsSync(transcriptPath), `Transcript file missing at: ${transcriptPath}`).toBeTruthy();
    expect(fs.existsSync(mediaPath), `Media file missing at: ${mediaPath}`).toBeTruthy();

    const transcriptBase = path.parse(transcriptPath).name.toLowerCase();
    const mediaBase = path.parse(mediaPath).name.toLowerCase();
    expect(transcriptBase, 'Transcript and Media must share the same base name').toBe(mediaBase);

    // 2. Ensure we have 2 exhibits
    const twoExhibits = (exhibits || []).slice(0, 2);
    expect(twoExhibits.length, 'At least 2 exhibit files must exist under TEST_ASSETS_DIR/exhibits').toBe(2);
    for (const exPath of twoExhibits) {
      expect(fs.existsSync(exPath), `Exhibit missing at: ${exPath}`).toBeTruthy();
    }

    console.log(`\n========================================`);
    console.log(`Starting Job Artifacts & Matching Files Setup Flow (POM & Dynamic Waits):`);
    console.log(`- Case Name: ${caseName}`);
    console.log(`- Job Name: ${jobName}`);
    console.log(`- Exhibit 1: ${twoExhibits[0]}`);
    console.log(`- Exhibit 2: ${twoExhibits[1]}`);
    console.log(`- Matching Base Name: "${matchingPair.baseName}"`);
    console.log(`- Transcript: ${path.basename(transcriptPath)} (${fs.statSync(transcriptPath).size} bytes)`);
    console.log(`- Media: ${path.basename(mediaPath)} (${fs.statSync(mediaPath).size} bytes)`);
    console.log(`- Execution rule: STAGE FILES ONLY -> DO NOT PROCESS JOB`);
    console.log(`========================================\n`);

    // Step 1: Sign in as Org Admin
    console.log('[Step 1] Signing in...');
    await login.open();
    await login.login({ email, password });

    // Step 2: Navigate to Cases and Create Case via POM
    console.log(`[Step 2] Creating Case "${caseName}" via CasesPage POM...`);
    await casesPage.open();
    await casesPage.createCase(caseData);
    await app.waitForPageContent();

    // Step 3: Create Job via POM
    console.log(`[Step 3] Creating Job "${jobName}" via JobsPage POM...`);
    await jobsPage.createJob(jobData);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'job_details');
    console.log(`[Step 3] Job Details loaded: ${page.url()}`);

    // Step 4: Upload Exhibits in Job Details
    console.log('[Step 4] Uploading 2 exhibit files in Job Details page...');
    await jobsPage.uploadArtifacts(twoExhibits);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'job_artifacts_uploaded');
    console.log('[Step 4] 2 exhibits uploaded into Job Artifacts successfully.');

    // Step 5: Open Sync Generator
    console.log('[Step 5] Opening Sync Generator setup...');
    await jobsPage.openSyncGenerator();
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_setup');
    console.log(`[Step 5] Sync Generator Setup loaded: ${page.url()}`);

    // Step 6: Import Exhibits via Show Artifacts
    console.log('[Step 6] Importing exhibits via Show Artifacts...');
    await jobsPage.importArtifactsViaShowArtifacts(2);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_exhibits_added');
    console.log('[Step 6] 2 exhibits added via Show Artifacts.');

    // Step 7: Upload matching Transcript
    const transcriptFileName = path.basename(transcriptPath);
    console.log(`[Step 7] Uploading Transcript: "${transcriptFileName}" (base name: ${matchingPair.baseName})...`);
    await jobsPage.uploadTranscript(transcriptPath);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_transcript_uploaded');
    console.log(`[Step 7] Transcript "${transcriptFileName}" uploaded successfully.`);

    // Step 8: Upload matching Media
    const mediaFileName = path.basename(mediaPath);
    console.log(`[Step 8] Uploading Media: "${mediaFileName}" (base name: ${matchingPair.baseName})...`);
    await jobsPage.uploadMedia(mediaPath);
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'sync_gen_media_uploaded');
    console.log(`[Step 8] Media "${mediaFileName}" uploaded and finalized.`);

    // Step 9: Verification & CRITICAL RULE: DO NOT PROCESS THE JOB
    console.log('\n[Step 9] Verifying staged setup state without processing...');
    const processBtn = page.getByRole('button', { name: /^Process$/i }).or(page.locator('button:has-text("Process")')).first();
    await expect(processBtn, 'Process button must be visible').toBeVisible({ timeout: 15_000 });

    console.log('>>> [RULE ENFORCED] Process button is visible and active, but NOT CLICKED.');
    await app.takeScreenshot('admin', 'sync_gen_ready_unprocessed');

    console.log('\n========================================');
    console.log('Artifacts, Transcript & Media Setup Completed Successfully (Unprocessed)!');
    console.log(`- Uploaded Transcript: ${transcriptFileName}`);
    console.log(`- Uploaded Media: ${mediaFileName}`);
    console.log(`- Verified Base Name Match: "${matchingPair.baseName}"`);
    console.log('- Status: Job staged and ready for alignment, NOT processed.');
    console.log('Screenshots saved in pot/admin/:');
    console.log('- admin_job_details.png');
    console.log('- admin_job_artifacts_uploaded.png');
    console.log('- admin_sync_gen_setup.png');
    console.log('- admin_sync_gen_exhibits_added.png');
    console.log('- admin_sync_gen_transcript_uploaded.png');
    console.log('- admin_sync_gen_media_uploaded.png');
    console.log('- admin_sync_gen_ready_unprocessed.png');
    console.log('========================================\n');
  });
});
