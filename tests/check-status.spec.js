require('dotenv').config();
const { test, expect } = require('../fixtures/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');

test.describe('Check Status Automation', () => {
  test('Org Admin opens the first case and job, then checks Sync Generator and Publish', async ({ page }) => {
    test.setTimeout(90_000);

    const login = new LoginPage(page);
    const app = new AppPage(page);
    const email = process.env.ORGADMIN_EMAIL;
    const password = process.env.ORGADMIN_PASSWORD;
    const issues = [];

    expect(email, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
    expect(password, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();

    await login.open();
    await login.login({ email, password });

    await app.navigateTo('Cases', '/cases');
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'status_cases');

    const firstCaseRow = page.locator('table tbody tr').first();
    await expect(firstCaseRow, 'The Cases table must contain at least one case').toBeVisible({ timeout: 15_000 });
    const caseDetails = (await firstCaseRow.innerText()).replace(/\s+/g, ' ').trim();
    console.log(`[Status Check] Opening first case: ${caseDetails}`);

    const caseLink = firstCaseRow.locator('a, button').first();
    if (await caseLink.isVisible().catch(() => false)) {
      await caseLink.click();
    } else {
      await firstCaseRow.click();
    }

    await page.waitForURL(/\/cases\/[^/?#]+/, { timeout: 20_000 });
    await app.waitForPageContent();
    await app.takeScreenshot('admin', 'status_first_case_details');

    const firstJobRow = page.locator('table tbody tr').first();
    await expect(firstJobRow, 'The selected case must contain at least one job').toBeVisible({ timeout: 15_000 });
    const jobDetails = (await firstJobRow.innerText()).replace(/\s+/g, ' ').trim();
    console.log(`[Status Check] Opening first job in case: ${jobDetails}`);

    const jobLink = firstJobRow.locator('a, button').first();
    if (await jobLink.isVisible().catch(() => false)) {
      await jobLink.click();
    } else {
      await firstJobRow.click();
    }

    await page.waitForURL(/\/jobs\/[^/?#]+/, { timeout: 20_000 });
    await app.waitForPageContent();
    const jobUrl = page.url();
    await app.takeScreenshot('admin', 'status_first_job_details');

    const isRelevantRequest = (request) => (
      ['document', 'fetch', 'xhr'].includes(request.resourceType())
      || /\/api\//i.test(request.url())
    );

    const checkFeatureButton = async ({ feature, cardTitle, buttonName, destination }) => {
      const card = page.locator(`div:has-text("${cardTitle}")`).last();
      const button = page.getByRole('button', { name: buttonName }).first();
      let listenersAttached = false;
      const networkErrors = [];

      const onResponse = (response) => {
        if (response.status() >= 400 && isRelevantRequest(response.request())) {
          networkErrors.push(`HTTP ${response.status()} ${response.url()}`);
        }
      };
      const onRequestFailed = (request) => {
        if (isRelevantRequest(request)) {
          networkErrors.push(`Network request failed ${request.url()}: ${request.failure()?.errorText || 'unknown error'}`);
        }
      };

      try {
        await card.scrollIntoViewIfNeeded();
        await expect(button, `${feature} button must be visible`).toBeVisible({ timeout: 10_000 });
        await expect(button, `${feature} button must be enabled`).toBeEnabled({ timeout: 5_000 });

        page.on('response', onResponse);
        page.on('requestfailed', onRequestFailed);
        listenersAttached = true;

        await button.click();
        await page.waitForURL(destination, { timeout: 20_000 });
        await app.waitForPageContent();

        if (networkErrors.length) {
          throw new Error(networkErrors.join('; '));
        }

        const negativePage = page.getByText(
          /\b404\b|page\s+not\s+found|\bnot\s+found\b|access\s+denied|unauthorized|contact\s+your\s+administrator\s+to\s+request\s+access/i,
        ).first();
        if (await negativePage.isVisible({ timeout: 500 }).catch(() => false)) {
          throw new Error(`${feature} opened a not-found or access-denied page.`);
        }

        await app.takeScreenshot('admin', `status_${feature}_opened`);
        console.log(`[Status Check] ${feature} opened: ${page.url()}`);
      } catch (error) {
        const reason = networkErrors.length ? networkErrors.join('; ') : error.message;
        await app.takeScreenshot('admin', `status_${feature}_error`);
        issues.push(`${feature}: ${reason}`);
        console.error(`[Status Check] ${feature} check failed: ${reason}`);
      } finally {
        if (listenersAttached) {
          page.off('response', onResponse);
          page.off('requestfailed', onRequestFailed);
        }
      }

      if (page.url() !== jobUrl) {
        try {
          await page.goto(jobUrl);
          await app.waitForPageContent();
        } catch (error) {
          await app.takeScreenshot('admin', `status_${feature}_return_error`);
          issues.push(`${feature}: could not return to job details: ${error.message}`);
        }
      }
    };

    await checkFeatureButton({
      feature: 'sync_generator',
      cardTitle: 'Sync Generator',
      buttonName: /open sync generator|set up sync job|create sync job/i,
      destination: /\/sync-generator\/[^/]+\/setup/,
    });

    await checkFeatureButton({
      feature: 'publish',
      cardTitle: 'Publish',
      buttonName: /open publish/i,
      destination: /\/publish\/[^/]+/,
    });

    expect(issues, 'Feature button checks encountered errors; see the negative POT screenshots').toEqual([]);
  });
});
