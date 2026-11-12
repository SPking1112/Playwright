const fs = require('fs');
const path = require('path');
const { expect, test } = require('@playwright/test');

class AppPage {
  constructor(page) {
    this.page = page;
    this.logoutButton = page.getByTitle('Logout').or(page.locator('button[title="Logout"]')).first();
  }

  /**
   * Sanitizes names for filenames (e.g. "My Organization" -> "my_organization")
   */
  sanitizeSlug(text) {
    return String(text || '')
      .toLowerCase()
      .trim()
      .replace(/&/g, 'and')
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');
  }

  getSuiteName() {
    return path.basename(test.info().file, '.spec.js');
  }

  /**
   * Waits until all API calls and page loaders are completed
   * Checks DOM ready state and active loaders reactively without blocking on networkidle or static timeouts.
   */
  async waitForPageContent() {
    await this.page.waitForLoadState('domcontentloaded');

    // Wait for any skeleton loaders or spinning indicators to detach if currently active
    try {
      const loaderSelector = '.animate-pulse, [data-loading="true"], svg.animate-spin, [role="progressbar"], .loading';
      const loader = this.page.locator(loaderSelector).first();
      if (await loader.isVisible({ timeout: 250 }).catch(() => false)) {
        await loader.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      }
    } catch (_) {}
  }

  /**
   * Capture screenshot organized into pot/<suite>/<role>/<rolename>_<pagename>.png
   * Automatically waits until all API calls and loaders are completed before capturing.
   */
  async takeScreenshot(roleName, pageName) {
    const suiteName = this.getSuiteName();
    const cleanRole = this.sanitizeSlug(roleName);
    const cleanPage = this.sanitizeSlug(pageName) || 'page';
    const potDir = path.resolve(process.cwd(), 'pot', suiteName, cleanRole);

    if (!fs.existsSync(potDir)) {
      fs.mkdirSync(potDir, { recursive: true });
    }

    const fileName = `${cleanRole}_${cleanPage}.png`;
    const fullPath = path.join(potDir, fileName);

    // Ensure all API calls and animations have settled
    await this.waitForPageContent();

    await this.page.screenshot({ path: fullPath, fullPage: false });
    console.log(`[POT Screenshot] Saved: pot/${suiteName}/${cleanRole}/${fileName}`);
    return fullPath;
  }

  /**
   * Dynamically retrieves all available navigation items rendered in the sidebar for the current role
   */
  async getSidebarItems() {
    await this.page.locator('[data-sidebar="content"]').waitFor({ state: 'visible', timeout: 15_000 });
    const buttons = this.page.locator('[data-sidebar="content"] [data-sidebar="menu-button"]');
    const count = await buttons.count();
    const items = [];

    for (let i = 0; i < count; i++) {
      const btn = buttons.nth(i);
      const text = (await btn.innerText()).trim();
      if (text) {
        items.push({ label: text, index: i });
      }
    }
    return items;
  }

  /**
   * Navigates to a specific label via sidebar click or direct path
   */
  async navigateTo(label, path) {
    if (path) {
      await this.page.goto(path);
    } else {
      const button = this.page
        .locator('[data-sidebar="content"] [data-sidebar="menu-button"]')
        .filter({ hasText: new RegExp(`^\\s*${label}\\s*$`, 'i') })
        .first();

      if (await button.isVisible({ timeout: 3000 }).catch(() => false)) {
        await button.click();
      } else {
        await this.page.getByRole('button', { name: label, exact: true }).first().click();
      }
    }

    await this.waitForPageContent();
    await expect(this.page).not.toHaveURL(/\/login/i);
  }

  /**
   * Logs out and waits for login page
   */
  async logout() {
    await expect(this.logoutButton).toBeVisible({ timeout: 10_000 });
    await this.logoutButton.click();
    await this.page.waitForURL(/\/login/i, { timeout: 15_000 });
    await expect(this.page.getByLabel('Email')).toBeVisible({ timeout: 15_000 });
    await this.page.waitForTimeout(500);
  }
}

module.exports = { AppPage };
