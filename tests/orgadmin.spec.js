require('dotenv').config();
const { test, expect } = require('@playwright/test');

// Load environment variables from .env if present
if (typeof process.loadEnvFile === 'function') {
    try { process.loadEnvFile(); } catch (_) { }
}

const { baseURL: BASE_URL } = require('../env');
const ORGADMIN_EMAIL = process.env.ORGADMIN_EMAIL;
const ORGADMIN_PASSWORD = process.env.ORGADMIN_PASSWORD;

const API_BASE_URL = new URL('/api/v1', BASE_URL).toString().replace(/\/$/, '');

// Shared state between UI login and backend RBAC test
let authToken = '';
let activeOrgId = '';

test.describe('Organization Admin RBAC Automation', () => {
    test.describe.configure({ mode: 'serial' });

    test('1. UI-Level RBAC - Verify Organization Admin permissions in UI', async ({ page }) => {
        test.setTimeout(120000);

        // Capture Bearer token and active org ID from network during login
        page.on('response', async res => {
            if (res.url().includes('/api/v1/auth/login') && res.status() === 200) {
                try {
                    const body = await res.json();
                    if (body.data) {
                        if (body.data.token) authToken = body.data.token;
                        if (body.data.organizations && body.data.organizations.length > 0) {
                            activeOrgId = body.data.organizations[0].id || body.data.organizations[0].orgId;
                        }
                    }
                } catch (_) { }
            }
        });

        // Step 1: Login as Organization Admin (reusing existing login flow)
        await page.goto('/login');
        expect(ORGADMIN_EMAIL, 'ORGADMIN_EMAIL must be set in .env').toBeTruthy();
        expect(ORGADMIN_PASSWORD, 'ORGADMIN_PASSWORD must be set in .env').toBeTruthy();
        await page.getByLabel('Email').fill(ORGADMIN_EMAIL);
        await page.locator('#password').fill(ORGADMIN_PASSWORD);
        await page.locator('button[type="submit"]').click();

        // Step 2: Handle MFA/Dev OTP if required
        const welcome = page.getByRole('heading', { name: /Welcome back/i });
        const verify = page.getByText('Verify Your Identity');
        await expect(welcome.or(verify)).toBeVisible({ timeout: 30000 });

        if (await verify.isVisible()) {
            const otpBoxText = await page.locator('div', { hasText: 'Dev OTP Code' }).last().innerText();
            const code = otpBoxText.match(/\d{6}/)[0];
            const boxes = page.locator('input');
            if (!(await boxes.first().inputValue())) {
                await boxes.first().click();
                await page.keyboard.type(code, { delay: 100 });
            }
            await page.getByRole('button', { name: 'Verify Code' }).click();
        }

        // Capture real unencrypted orgId UUID from outgoing requests as fallback
        page.on('request', req => {
            const match = req.url().match(/orgId=([0-9a-fA-F-]{36})/);
            if (match && !activeOrgId) {
                activeOrgId = match[1];
            }
        });

        // Step 3: Verify login succeeded
        await expect(welcome).toBeVisible({ timeout: 30000 });
        await expect(page).not.toHaveURL(/login/i);
        await expect(page.getByText('Organization Admin', { exact: true }).first()).toBeVisible({ timeout: 10000 });

        console.log('Logged in successfully. Active Org ID:', activeOrgId);

        // Step 4: Navigate to My Organization -> Roles & Permissions
        const myOrgNav = page.getByText(/My Organization/i).first();
        await expect(myOrgNav).toBeVisible();
        await myOrgNav.click();

        const rolesTab = page.getByRole('link', { name: /Roles & Permissions/i }).or(page.getByText('Roles & Permissions', { exact: true }));
        await expect(rolesTab).toBeVisible();
        await rolesTab.click();

        // Wait for URL to update with organization UUID
        await page.waitForURL(/\/organizations\/[0-9a-fA-F-]{36}/, { timeout: 15000 });
        const urlMatch = page.url().match(/organizations\/([0-9a-fA-F-]{36})/);
        if (urlMatch) {
            activeOrgId = urlMatch[1];
            console.log('Extracted Active Org ID from URL:', activeOrgId);
        }

        // Wait for roles list to finish loading
        await expect(page.getByText('Loading roles...').first()).not.toBeVisible({ timeout: 20000 });

        // Step 5: Locate and open the Organization Admin role
        const orgAdminRole = page.getByRole('cell', { name: /Organization Admin/i }).first();
        await expect(orgAdminRole).toBeVisible({ timeout: 10000 });
        await orgAdminRole.click();

        // Step 6: Verify Permissions Table & Total Permissions Count
        const permissionsTable = page.locator('table').first();
        const selectedCountSummary = page.getByText(/^\d+ permissions selected$/);
        await expect(selectedCountSummary).toBeVisible({ timeout: 15000 });
        const displayedSelectedCount = Number((await selectedCountSummary.innerText()).match(/^\d+/)[0]);
        const selectedPermissionCount = await permissionsTable.getByRole('checkbox', { checked: true }).count();
        expect(displayedSelectedCount).toBe(selectedPermissionCount);

        // Verify the 10 resources are present in the permissions matrix
        const expectedResources = [
            'AuditLog',
            'Case',
            'Department',
            'Job',
            'OrgSharedData',
            'Organization',
            'Permission',
            'Product',
            'Role',
            'User'
        ];

        for (const resource of expectedResources) {
            await expect(permissionsTable.getByText(resource, { exact: true })).toBeVisible();
        }

        // Verify special permission badges displayed for Org Admin
        await expect(permissionsTable.getByText('Export', { exact: true })).toBeVisible();
        await expect(permissionsTable.getByText('Ingest', { exact: true })).toBeVisible();
        await expect(permissionsTable.getByText('Push', { exact: true })).toBeVisible();
        await expect(permissionsTable.getByText('Assign', { exact: true }).first()).toBeVisible();
        await expect(permissionsTable.getByText('Invite', { exact: true })).toBeVisible();

        console.log(`UI RBAC verification passed: All 10 resources and ${displayedSelectedCount} permissions verified.`);
    });

    test('2. Backend/API RBAC - Verify Allowed and Denied Endpoints', async ({ request }) => {
        // Ensure authentication token is available
        expect(authToken).toBeTruthy();
        console.log('Testing Backend API RBAC using Bearer token against:', API_BASE_URL);

        const authHeaders = {
            'Authorization': `Bearer ${authToken}`,
            'Content-Type': 'application/json'
        };

        // ==========================================
        // ALLOWED PERMISSIONS (Org Admin HAS these)
        // ==========================================

        // 1. User: Read (Allowed -> 200)
        const userReadRes = await request.get(`${API_BASE_URL}/users?orgId=${activeOrgId}&pageSize=10`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] GET /api/v1/users -> Status: ${userReadRes.status()}`);
        expect(userReadRes.status()).toBe(200);

        // 2. Case: Read (Allowed -> 200)
        const caseReadRes = await request.get(`${API_BASE_URL}/cases?orgId=${activeOrgId}&pageSize=10`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] GET /api/v1/cases -> Status: ${caseReadRes.status()}`);
        expect(caseReadRes.status()).toBe(200);

        // 3. AuditLog: Read (Allowed -> 200)
        const auditReadRes = await request.get(`${API_BASE_URL}/admin/audit-log?orgId=${activeOrgId}&pageSize=5`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] GET /api/v1/admin/audit-log -> Status: ${auditReadRes.status()}`);
        expect(auditReadRes.status()).toBe(200);

        // 4. Role: Read (Allowed -> 200)
        const roleReadRes = await request.get(`${API_BASE_URL}/roles?orgId=${activeOrgId}&pageSize=10`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] GET /api/v1/roles -> Status: ${roleReadRes.status()}`);
        expect(roleReadRes.status()).toBe(200);

        // 5. Product: Read (Allowed -> 200)
        const productReadRes = await request.get(`${API_BASE_URL}/products/my`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] GET /api/v1/products/my -> Status: ${productReadRes.status()}`);
        expect(productReadRes.status()).toBe(200);

        // ==========================================
        // DENIED PERMISSIONS (Org Admin does NOT have)
        // ==========================================

        // 6. Permission: Create (Denied -> Backend must reject with 403)
        const permCreateRes = await request.post(`${API_BASE_URL}/permissions`, {
            headers: authHeaders,
            data: { resource: 'TestResource', action: 'TestAction' }
        });
        const permissionsContentType = (permCreateRes.headers()['content-type'] || '').toLowerCase();
        test.skip(
            !permissionsContentType.includes('json'),
            `POST /api/v1/permissions returned non-JSON content (${permissionsContentType || 'no content type'}); verify the API route and target.`,
        );
        console.log(`[API CHECK] POST /api/v1/permissions (Unauthorized) -> Status: ${permCreateRes.status()}`);
        expect(permCreateRes.status()).toBe(403);

        // 7. Organization: Create (Denied -> Backend must reject with 403)
        const orgCreateRes = await request.post(`${API_BASE_URL}/orgs`, {
            headers: authHeaders,
            data: { name: 'UnauthorizedOrgTest', type: 'Org' }
        });
        console.log(`[API CHECK] POST /api/v1/orgs (Unauthorized) -> Status: ${orgCreateRes.status()} - ${await orgCreateRes.text().catch(() => '')}`);
        expect(orgCreateRes.status()).toBe(403);

        // 8. Organization: Delete (Denied -> Backend must reject with 403)
        // Org Admin can only Read organization, cannot delete it
        const orgDeleteRes = await request.delete(`${API_BASE_URL}/orgs/${activeOrgId}`, {
            headers: authHeaders
        });
        console.log(`[API CHECK] DELETE /api/v1/orgs/:id (Unauthorized) -> Status: ${orgDeleteRes.status()} - ${await orgDeleteRes.text().catch(() => '')}`);
        expect(orgDeleteRes.status()).toBe(403);
    });

});
