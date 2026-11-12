const { expect } = require('@playwright/test');

class LoginPage {
  constructor(page) {
    this.page = page;
    this.email = page.getByLabel('Email');
    this.password = page.locator('#password');
    this.submit = page.locator('button[type="submit"]').or(page.getByRole('button', { name: /sign in/i })).first();
  }

  async open() {
    // Automatically clear browser cookies and storage cache on every run
    try {
      await this.page.context().clearCookies();
      await this.page.context().clearPermissions();
    } catch (_) {}

    await this.page.goto('/login');
    await this.page.waitForLoadState('domcontentloaded');

    try {
      await this.page.evaluate(() => {
        try { localStorage.clear(); } catch (_) {}
        try { sessionStorage.clear(); } catch (_) {}
      });
    } catch (_) {}

    await expect(this.email).toBeVisible({ timeout: 10_000 });
    await expect(this.email).toBeEditable({ timeout: 10_000 });
  }

  async login(account) {
    await expect(this.email).toBeEditable({ timeout: 10_000 });
    await this.email.fill(account.email);
    await this.password.fill(account.password);

    // If inputs got reset by re-render, re-fill
    if (!(await this.email.inputValue())) {
      await this.email.fill(account.email);
      await this.password.fill(account.password);
    }

    const loginResponsePromise = this.page.waitForResponse(
      (response) => response.url().includes('/api/v1/auth/login')
        && response.request().method() === 'POST',
      { timeout: 30_000 }
    );
    await this.submit.click();
    const loginResponse = await loginResponsePromise;
    const responseError = await loginResponse.finished();
    if (responseError) {
      throw new Error(`Login API response did not finish: ${responseError.message}`);
    }
    if (!loginResponse.ok()) {
      throw new Error(`Login API failed with HTTP ${loginResponse.status()}. Check the configured credentials and server response.`);
    }
    const loginResponseBody = await loginResponse.json();

    const welcome = this.page.getByRole('heading', { name: /welcome back/i });
    const verify = this.page.getByRole('heading', { name: /verify your identity/i }).or(this.page.getByText(/verify your identity/i));
    const changePasswordHeading = this.page.getByRole('heading', { name: /change your password/i }).or(this.page.getByText(/change your password/i));
    const logoutBtn = this.page.getByTitle('Logout');
    const sidebar = this.page.locator('[data-sidebar="sidebar"]').or(this.page.locator('[data-sidebar="content"]'));

    // Wait for either MFA verification, change password, or authenticated interface
    const authIndicator = welcome.or(verify).or(changePasswordHeading).or(logoutBtn).or(sidebar).first();
    await expect(authIndicator).toBeVisible({ timeout: 12_000 });

    if (await verify.first().isVisible().catch(() => false)) {
      const otpContainer = this.page.locator('div', { hasText: /(?:QA|Dev) OTP Code/i }).last();
      await expect(otpContainer).toBeVisible({ timeout: 10_000 });
      const text = await otpContainer.innerText();
      const code = text.match(/\b\d{6}\b/)?.[0];
      if (!code) {
        throw new Error('MFA screen was shown, but no six-digit QA/Dev OTP was found.');
      }

      const boxes = this.page.locator('input');
      if (!(await boxes.first().inputValue())) {
        await boxes.first().click();
        await this.page.keyboard.type(code, { delay: 50 });
      }
      await this.page.getByRole('button', { name: /verify code/i }).first().click();
    }

    // Check if Change Password is required (e.g. for newly created users)
    const changePwdVisible = await changePasswordHeading.first().isVisible({ timeout: 3000 }).catch(() => false)
      || await this.page.locator('#current-password').isVisible({ timeout: 1500 }).catch(() => false);

    if (changePwdVisible) {
      console.log('Change Password screen detected. Updating password...');
      const newPwd = account.newPassword || (account.password.endsWith('4') ? 'Welcome@123' : 'Welcome@124');
      await this.page.locator('#current-password').fill(account.password);
      await this.page.locator('#new-password').fill(newPwd);
      await this.page.locator('#confirm-password').fill(newPwd);

      const submitChangeBtn = this.page.getByRole('button', { name: /change password/i }).first();
      await expect(submitChangeBtn).toBeEnabled({ timeout: 8000 });

      const changePwdResponsePromise = this.page.waitForResponse(
        (r) => r.url().includes('/api/v1/auth/change-password'),
        { timeout: 10_000 }
      ).catch(() => null);

      await submitChangeBtn.click();
      await changePwdResponsePromise;
      account.password = newPwd;
    }

    // Ensure we leave /login and arrive at authenticated area
    await this.page.waitForURL((url) => !url.pathname.includes('/login'), { timeout: 12_000 });
    await expect(logoutBtn.or(welcome).or(sidebar).first()).toBeVisible({ timeout: 12_000 });
    await this.page.waitForLoadState('domcontentloaded');
    return loginResponseBody;
  }
}

module.exports = { LoginPage };
