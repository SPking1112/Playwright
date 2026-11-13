const path = require('path');
const { expect } = require('@playwright/test');

class JobsPage {
  constructor(page) {
    this.page = page;
    this.addJobButton = page.getByRole('button', { name: /new job|add job|create job/i }).first();
    this.jobDialog = page.locator('div[role="dialog"]:has-text("Create Job")').first();
    this.jobNameInput = this.jobDialog.locator('#job-name').or(this.jobDialog.getByLabel(/job name/i)).first();
    this.categorySelect = this.jobDialog.locator('#job-category');
    this.jobRefInput = this.jobDialog.locator('#job-ref').or(this.jobDialog.getByLabel(/client job ref/i)).first();
    this.submitJobButton = this.jobDialog.getByRole('button', { name: /^Create Job$/i }).or(this.jobDialog.getByRole('button', { name: /create job/i })).first();
  }

  async open() {
    await this.page.goto('/jobs');
  }

  async openCreateDialog() {
    await expect(this.addJobButton).toBeVisible({ timeout: 15_000 });
    await this.addJobButton.click();
    await expect(this.jobDialog).toBeVisible({ timeout: 10_000 });
    await expect(this.jobNameInput).toBeVisible({ timeout: 5000 });
  }

  async createJob(jobData) {
    await this.openCreateDialog();

    await this.jobNameInput.fill(jobData.name);

    if (await this.categorySelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      await this.categorySelect.click();
      const option = this.page.locator('[role="option"]:has-text("Deposition"), [role="option"]').first();
      await expect(option).toBeVisible({ timeout: 3000 });
      await option.click();
    }

    if (jobData.clientJobRef && (await this.jobRefInput.isVisible({ timeout: 3000 }).catch(() => false))) {
      await this.jobRefInput.fill(jobData.clientJobRef);
    }

    await expect(this.submitJobButton).toBeEnabled({ timeout: 10_000 });
    await this.submitJobButton.click();

    // Dynamically wait for dialog to close
    await this.jobDialog.waitFor({ state: 'detached', timeout: 12_000 });

    // Open Job Details page if not already navigated
    if (!this.page.url().includes('/jobs/')) {
      const jobRow = this.page.locator(`table tbody tr:has-text("${jobData.name}")`).first();
      await expect(jobRow).toBeVisible({ timeout: 15_000 });
      await jobRow.click();
    }

    await this.page.waitForURL(/\/jobs\/[0-9a-fA-F-]+/, { timeout: 25_000 });
  }

  async uploadArtifacts(filePaths) {
    const artifactFiles = Array.isArray(filePaths) ? filePaths : [filePaths];
    const artifactsCard = this.page.locator('div:has-text("Artifacts")').last();
    await artifactsCard.scrollIntoViewIfNeeded().catch(() => {});

    const fileInput = this.page.locator('input[type="file"]').last();
    await expect(fileInput).toBeAttached({ timeout: 10_000 });
    await fileInput.setInputFiles(artifactFiles);

    // Wait dynamically for upload spinners to finish rather than sleeping
    const spinner = this.page.locator('.animate-spin').first();
    if (await spinner.isVisible({ timeout: 2000 }).catch(() => false)) {
      await spinner.waitFor({ state: 'detached', timeout: 30_000 }).catch(() => {});
    }
  }

  async openSyncGenerator() {
    const syncGenCard = this.page.locator('div:has-text("Sync Generator")').last();
    await syncGenCard.scrollIntoViewIfNeeded().catch(() => {});

    const openSyncBtn = this.page.getByRole('button', { name: /open sync generator|set up sync job|create sync job/i }).first();
    await expect(openSyncBtn).toBeVisible({ timeout: 15_000 });
    await openSyncBtn.click();

    await this.page.waitForURL(/\/sync-generator\/[^/]+\/setup/, { timeout: 25_000 });
  }

  async importArtifactsViaShowArtifacts(maxCount = 2) {
    const showArtifactsButtons = this.page.getByRole('button', { name: /show artifacts/i });
    await expect(showArtifactsButtons).toHaveCount(3);
    const showArtifactsBtn = showArtifactsButtons.nth(2);
    await showArtifactsBtn.scrollIntoViewIfNeeded();
    await expect(showArtifactsBtn).toBeVisible({ timeout: 10_000 });
    await showArtifactsBtn.click();

    const artifactsDialog = this.page.locator('div[role="dialog"]:has-text("Select Exhibits from Artifacts"), div[role="dialog"]:has-text("Artifacts")').first();
    await expect(artifactsDialog).toBeVisible({ timeout: 10_000 });

    // Wait for candidate artifacts loader to detach
    await artifactsDialog.locator('text=Loading artifacts').waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});

    const addButtons = artifactsDialog.getByRole('button', { name: /^Add$/i });
    const count = await addButtons.count();
    const toAdd = Math.min(count, maxCount);

    for (let i = 0; i < toAdd; i++) {
      const currentAddBtn = artifactsDialog.getByRole('button', { name: /^Add$/i }).first();
      if (await currentAddBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
        await currentAddBtn.click();
        // Wait for the button state to update
        await this.page.waitForLoadState('domcontentloaded');
      }
    }

    const closeBtn = artifactsDialog.getByRole('button', { name: /^Close$/i }).or(artifactsDialog.locator('button[aria-label="Close"]')).first();
    await closeBtn.click().catch(() => this.page.keyboard.press('Escape'));
    await artifactsDialog.waitFor({ state: 'detached', timeout: 8000 }).catch(() => this.page.keyboard.press('Escape'));
  }

  async uploadTranscript(transcriptPath) {
    const transcriptInput = this.page.locator(
      'input[type="file"][accept*=".txt"], input[type="file"][accept*=".mdb"], input[type="file"][accept*=".ytg"], input[type="file"][accept*=".xmef"], input[type="file"]'
    ).first();
    await expect(transcriptInput).toBeAttached({ timeout: 15_000 });
    await transcriptInput.setInputFiles(transcriptPath);

    await this.dismissTranscriptLinesDialog();
  }

  async dismissTranscriptLinesDialog() {
    const lineModal = this.page.locator('div[role="dialog"]:has-text("Set Transcript Lines")').first();
    try {
      await lineModal.waitFor({ state: 'visible', timeout: 5000 });
    } catch (error) {
      if (error.name === 'TimeoutError') return;
      throw error;
    }

    const loadingSpinner = lineModal.locator('.animate-spin').first();
    if (await loadingSpinner.isVisible()) {
      await loadingSpinner.waitFor({ state: 'detached', timeout: 30_000 });
    }

    const labeledCloseButton = lineModal.getByRole('button', { name: /^close$/i })
      .or(lineModal.locator('button[aria-label="Close"], button[title="Close"]'))
      .first();
    const closeButton = await labeledCloseButton.isVisible()
      ? labeledCloseButton
      : lineModal.getByRole('button').first();
    await expect(closeButton).toBeVisible({ timeout: 3000 });
    await closeButton.click();
    await expect(lineModal).toBeHidden({ timeout: 10_000 });
  }

  async uploadMedia(mediaPath, afterUpload) {
    const mediaInput = this.page.locator('input[type="file"][accept*=".mp4"], input[type="file"][accept*=".mov"], input[type="file"][accept*=".mpg"]').first();
    await expect(mediaInput).toBeAttached({ timeout: 15_000 });
    await mediaInput.setInputFiles(mediaPath);
    if (afterUpload) {
      await afterUpload();
    }

    const cancelUploadButton = this.page.locator('button[title="Cancel upload"]').first();
    await cancelUploadButton.waitFor({ state: 'hidden', timeout: 120_000 });

    const finalizedSegment = this.page.locator('button[title="Remove media"]').first();
    await expect(finalizedSegment).toBeVisible({ timeout: 120_000 });
  }
}

module.exports = { JobsPage };
