require('dotenv').config();
const { test, expect } = require('@playwright/test');

// badge = text shown in the sidebar under the user's name (optional; leave out if unknown)
const roles = [
    {
        name: 'OrgAdmin',
        badge: 'Organization Admin',
        email: process.env.ORGADMIN_EMAIL,
        password: process.env.ORGADMIN_PASSWORD
    },
    {
        name: 'Platform',
        email: process.env.PLATFORM_EMAIL,
        password: process.env.PLATFORM_PASSWORD
    },
    {
        name: 'Manager',
        email: process.env.MANAGER_EMAIL,
        password: process.env.MANAGER_PASSWORD
    },
    {
        name: 'Billing',
        badge: 'Billing',
        email: process.env.BILLING_EMAIL,
        password: process.env.BILLING_PASSWORD
    },
    {
        name: 'Reporter',
        email: process.env.REPORTER_EMAIL,
        password: process.env.REPORTER_PASSWORD
    },
    {
        name: 'Member',
        badge: 'Member',
        email: process.env.MEMBER_EMAIL,
        password: process.env.MEMBER_PASSWORD
    }
];

for (const role of roles) {
    test(`S1 login - ${role.name}`, async ({ page }) => {
        test.skip(!role.email || !role.password, `Set ${role.name} credentials in .env to run this test.`);
        test.setTimeout(90000); // the dev server can be slow

        await page.goto('/login');

        await page.getByLabel('Email').fill(role.email);
        await page.locator('#password').fill(role.password);
        await page.locator('button[type="submit"]').click();

        const welcome = page.getByRole('heading', { name: /Welcome back/i });
        const verify = page.getByText(/Verify Your Identity/i);

        // After login, either the dashboard or the MFA page appears. Wait for whichever comes first.
        await expect(welcome.or(verify)).toBeVisible({ timeout: 30000 });

        // MFA page: on dev/QA, the OTP is shown on the page itself, so read it from there.
        if (await verify.isVisible()) {
            const otpContainer = page.locator('div', { hasText: /(?:QA|Dev) OTP Code/i }).last();
            await expect(otpContainer).toBeVisible({ timeout: 10000 });
            const otpBoxText = await otpContainer.innerText();
            const match = otpBoxText.match(/\b\d{6}\b/);
            if (match) {
                const code = match[0];
                const boxes = page.locator('input');
                if (!(await boxes.first().inputValue())) {
                    await boxes.first().click();
                    await page.keyboard.type(code, { delay: 100 });
                }
                await page.getByRole('button', { name: /Verify Code/i }).click();
            }
        }

        // Landed on dashboard
        await expect(welcome).toBeVisible({ timeout: 30000 });
        await expect(page).not.toHaveURL(/login/i);

        // Optional role badge check (only for roles where the badge text is known)
        if (role.badge) {
            await expect(page.getByText(role.badge, { exact: true }).first()).toBeVisible();
        }
    });
}
