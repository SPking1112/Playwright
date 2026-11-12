const { expect } = require('@playwright/test');

class CasesPage {
  constructor(page) {
    this.page = page;
    this.createCaseButton = page.getByRole('button', { name: /create case|new case/i }).first();
    this.caseDialog = page.locator('div[role="dialog"]:has-text("Create Case")').first();
    this.caseNameInput = this.caseDialog.locator('#name').or(this.caseDialog.locator('#caseName')).or(this.caseDialog.getByLabel(/case name/i)).first();
    this.caseDescInput = this.caseDialog.locator('#description').or(this.caseDialog.locator('textarea')).first();
    this.productSelect = this.caseDialog.locator('#product').first();
    this.submitButton = this.caseDialog.getByRole('button', { name: /create & open|create case/i }).first();
    this.casesTable = page.locator('table');
  }

  async open() {
    await this.page.goto('/cases');
    await expect(this.createCaseButton).toBeVisible({ timeout: 10_000 });
  }

  async openCreateDialog() {
    await expect(this.createCaseButton).toBeVisible({ timeout: 10_000 });
    await this.createCaseButton.click();
    await expect(this.caseDialog).toBeVisible({ timeout: 8000 });
    await expect(this.caseNameInput).toBeVisible({ timeout: 5000 });
  }

  async createCase(caseData) {
    await this.openCreateDialog();

    await this.caseNameInput.fill(caseData.name);
    if (caseData.description) {
      await this.caseDescInput.fill(caseData.description);
    }

    // Wait for products loader to detach if present
    await this.caseDialog.locator('text=Loading products').waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});

    if (await this.productSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
      const selectText = await this.productSelect.innerText().catch(() => '');
      if (!selectText || selectText.includes('Select')) {
        await this.productSelect.click();
        const firstOption = this.page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstOption.click();
        }
      }
    }

    await expect(this.submitButton).toBeEnabled({ timeout: 5000 });

    const createCasePromise = this.page.waitForResponse(
      (r) => r.url().includes('/api/v1/cases') && r.request().method() === 'POST',
      { timeout: 8000 }
    ).catch(() => null);

    await this.submitButton.click();
    await createCasePromise;

    // Dynamically wait for URL navigation or dialog dismissal instead of static sleep
    await this.page.waitForURL(/\/cases\/[0-9a-fA-F-]+/, { timeout: 10_000 }).catch(async () => {
      // If list view remains, click the created case row
      const caseLink = this.page.locator(`table tbody tr:has-text("${caseData.name}"), a:has-text("${caseData.name}")`).first();
      if (await caseLink.isVisible({ timeout: 4000 }).catch(() => false)) {
        await caseLink.click();
        await this.page.waitForURL(/\/cases\/[0-9a-fA-F-]+/, { timeout: 8000 });
      }
    });

    await this.caseDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
  }
}

module.exports = { CasesPage };
