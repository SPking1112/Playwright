const { expect } = require('@playwright/test');

class UsersPage {
  constructor(page) {
    this.page = page;

    // Create User dialog elements
    this.newUserBtn = page.getByRole('button', { name: /new user|create user/i }).first();
    this.createUserDialog = page.locator('div[role="dialog"]:has-text("Create User")').first();
    this.userNameInput = this.createUserDialog.locator('input[placeholder*="John Doe"]').or(this.createUserDialog.getByLabel(/display name/i)).first();
    this.userEmailInput = this.createUserDialog.locator('input[type="email"]').or(this.createUserDialog.getByLabel(/email/i)).first();
    this.userPasswordInput = this.createUserDialog.locator('input[type="password"]').or(this.createUserDialog.getByPlaceholder(/••••••••/i)).first();
    this.userRoleTrigger = this.createUserDialog.locator('button[role="combobox"]').or(this.createUserDialog.locator('select')).first();
    this.submitCreateUserBtn = this.createUserDialog.getByRole('button', { name: /^Create User$/i }).or(this.createUserDialog.locator('button[type="submit"]')).first();

    // Invite User dialog elements
    this.inviteUserBtn = page.getByRole('button', { name: /invite user/i }).first();
    this.inviteDialog = page.locator('div[role="dialog"]:has-text("Invite User")').first();
    this.inviteNameInput = this.inviteDialog.locator('input[placeholder*="John Doe"]').or(this.inviteDialog.getByLabel(/display name/i)).first();
    this.inviteEmailInput = this.inviteDialog.locator('input[type="email"]').or(this.inviteDialog.getByLabel(/email/i)).first();
    this.inviteRoleTrigger = this.inviteDialog.locator('button[role="combobox"]').or(this.inviteDialog.locator('select')).first();
    this.submitInviteBtn = this.inviteDialog.getByRole('button', { name: /send invitation/i }).first();
  }

  async openUsers() {
    await this.page.goto('/users');
    await expect(this.newUserBtn).toBeVisible({ timeout: 15_000 });
  }

  async createUser(userData) {
    await expect(this.newUserBtn).toBeVisible({ timeout: 15_000 });
    await this.newUserBtn.click();
    await expect(this.createUserDialog).toBeVisible({ timeout: 10_000 });

    await this.userNameInput.fill(userData.displayName);
    await this.userEmailInput.fill(userData.email);
    await this.userPasswordInput.fill(userData.password);

    if (await this.userRoleTrigger.isVisible({ timeout: 4000 }).catch(() => false)) {
      await this.userRoleTrigger.click();
      const targetRole = this.page.locator(`[role="option"]:has-text("${userData.role}")`).first();
      if (await targetRole.isVisible({ timeout: 2000 }).catch(() => false)) {
        await targetRole.click();
      } else {
        const firstOption = this.page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstOption.click();
        }
      }
    }

    await expect(this.submitCreateUserBtn).toBeEnabled({ timeout: 10_000 });
    await this.submitCreateUserBtn.click();

    // Dynamically wait for dialog to close
    await this.createUserDialog.waitFor({ state: 'detached', timeout: 15_000 });
  }

  async openInvitations() {
    await this.page.goto('/invitations');
    await expect(this.inviteUserBtn).toBeVisible({ timeout: 15_000 });
  }

  async inviteUser(inviteData) {
    await expect(this.inviteUserBtn).toBeVisible({ timeout: 15_000 });
    await this.inviteUserBtn.click();
    await expect(this.inviteDialog).toBeVisible({ timeout: 10_000 });

    await this.inviteNameInput.fill(inviteData.displayName);
    await this.inviteEmailInput.fill(inviteData.email);

    if (await this.inviteRoleTrigger.isVisible({ timeout: 4000 }).catch(() => false)) {
      await this.inviteRoleTrigger.click();
      const targetRole = this.page.locator(`[role="option"]:has-text("${inviteData.role}")`).first();
      if (await targetRole.isVisible({ timeout: 2000 }).catch(() => false)) {
        await targetRole.click();
      } else {
        const firstOption = this.page.locator('[role="option"]').first();
        if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await firstOption.click();
        }
      }
    }

    await expect(this.submitInviteBtn).toBeEnabled({ timeout: 10_000 });
    await this.submitInviteBtn.click();

    // Dynamically wait for dialog to close
    await this.inviteDialog.waitFor({ state: 'detached', timeout: 15_000 });
  }
}

module.exports = { UsersPage };
