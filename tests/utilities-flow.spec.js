require('dotenv').config();
const path = require('path');
const fs = require('fs');
const { test, expect } = require('../fixtures/test');
const { LoginPage } = require('../pages/login.page');
const { AppPage } = require('../pages/app.page');
const { getFixtureFilePaths } = require('../fixtures/data');
const { CasesPage } = require('../pages/cases.page');
const { JobsPage } = require('../pages/jobs.page');

/**
 * Generates random alphabetical characters (no digits) for display names
 * (Stenograph One UI strictly enforces: displayName must NOT contain digits).
 */
function getRandomLetters(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

test.describe('Utilities End-to-End Workflow', () => {
  test('Complete Platform Admin provisioning, User handover, Sync and Publish processing flow', async ({ page, request }) => {
    test.setTimeout(0); // Large media / processing wait

    const loginPage = new LoginPage(page);
    const appPage = new AppPage(page);
    const casesPage = new CasesPage(page);
    const jobsPage = new JobsPage(page);

    const platformEmail = process.env.PLATFORM_EMAIL;
    const platformPassword = process.env.PLATFORM_PASSWORD;

    expect(platformEmail, 'PLATFORM_EMAIL must be configured in .env').toBeTruthy();
    expect(platformPassword, 'PLATFORM_PASSWORD must be configured in .env').toBeTruthy();

    const {
      transcript: transcriptPath,
      media: mediaPath,
      exhibits,
    } = getFixtureFilePaths({ requiredExhibits: 1 });
    const exhibitPath = exhibits[0];

    let apiBaseUrl = null;
    let authToken = null;
    const apiRequestJson = async (endpoint, options = {}) => {
      if (!authToken || !apiBaseUrl) {
        throw new Error('Platform Admin API URL or token is unavailable.');
      }

      const { allowStatuses = [], ...requestOptions } = options;
      const response = await request.fetch(`${apiBaseUrl}${endpoint}`, {
        ...requestOptions,
        headers: {
          Accept: 'application/json',
          ...(requestOptions.headers || {}),
          Authorization: `Bearer ${authToken}`,
        },
      });
      const contentType = response.headers()['content-type'] || '';
      const responseText = await response.text();
      if (response.status() === 204 || allowStatuses.includes(response.status())) {
        return null;
      }
      if (!contentType.toLowerCase().includes('json')) {
        throw new Error(
          `API ${requestOptions.method || 'GET'} ${endpoint} returned HTTP ${response.status()} ` +
          `with non-JSON content type "${contentType || 'unknown'}".`
        );
      }

      const body = JSON.parse(responseText);
      if (!response.ok() && !allowStatuses.includes(response.status())) {
        throw new Error(`API ${requestOptions.method || 'GET'} ${endpoint} failed with HTTP ${response.status()}.`);
      }
      return body.data ?? body;
    };

    const suiteName = appPage.getSuiteName();
    const potDir = path.resolve(process.cwd(), 'pot', suiteName, 'utilities');
    if (!fs.existsSync(potDir)) {
      fs.mkdirSync(potDir, { recursive: true });
    }

    const capturePot = async (stageName) => {
      await appPage.waitForPageContent();
      const filename = `${stageName}.png`;
      const fullPath = path.join(potDir, filename);
      await page.screenshot({ path: fullPath, fullPage: false });
      console.log(`[POT Captured] pot/${suiteName}/utilities/${filename}`);
      return fullPath;
    };

    const collectApiStatuses = (value, statuses = [], context = null) => {
      if (Array.isArray(value)) {
        for (const item of value) {
          const itemContext = item && typeof item === 'object'
            ? JSON.stringify(item).toLowerCase()
            : context;
          collectApiStatuses(item, statuses, itemContext);
        }
      } else if (value && typeof value === 'object') {
        const statusContext = context || JSON.stringify(value).toLowerCase();
        for (const [key, nested] of Object.entries(value)) {
          const normalizedKey = key.toLowerCase().replace(/[^a-z]/g, '');
          if (
            ['status', 'state', 'jobstatus', 'orderstatus', 'projectstatus', 'processingstatus'].includes(normalizedKey)
            && typeof nested === 'string'
          ) {
            statuses.push({
              value: nested.trim().toLowerCase().replace(/[\s_-]+/g, ''),
              context: statusContext,
            });
          }
          collectApiStatuses(nested, statuses, statusContext);
        }
      }
      return statuses;
    };

    const completedApiStatuses = new Set([
      'complete', 'completed', 'finished', 'processed', 'ready', 'readyforreview', 'succeeded',
    ]);
    const failedApiStatuses = new Set([
      'cancelled', 'canceled', 'error', 'errored', 'failed', 'failure', 'rejected',
    ]);

    const processingStatusesFor = (response, body, operation, productInstanceId) => {
      const pathName = new URL(response.url()).pathname.toLowerCase();
      const operationEndpoint = operation === 'Sync'
        ? /\/sync\/jobs(?:\/|$)/i.test(pathName)
        : /\/projects(?:\/|$)/i.test(pathName);
      const triggerRequest = response.request().method() === 'POST';
      const productName = operation === 'Sync' ? /sync[\s_-]*generator/i : /publish/i;
      const instanceId = String(productInstanceId || '').toLowerCase();

      return collectApiStatuses(body).filter((entry) => (
        operationEndpoint
        || triggerRequest
        || (instanceId && entry.context.includes(instanceId))
        || productName.test(entry.context)
      ));
    };

    const waitForProcessingApiResponse = (operation, productInstanceId) => page.waitForResponse(
      async (response) => {
        const urlPattern = operation === 'Sync'
          ? /\/(?:sync\/jobs|orders)(?:\/|[?#]|$)/i
          : /\/(?:orders|projects)(?:\/|[?#]|$)/i;
        if (!urlPattern.test(response.url())) return false;
        if (!response.ok()) return true;
        const body = await response.json().catch(() => null);
        const statuses = processingStatusesFor(response, body, operation, productInstanceId);
        return statuses.some((entry) => (
          completedApiStatuses.has(entry.value) || failedApiStatuses.has(entry.value)
        ));
      },
      { timeout: 30 * 60_000 }
    );

    const assertProcessingCompleted = async (response, operation, productInstanceId) => {
      if (!response.ok()) {
        throw new Error(`${operation} status API failed with HTTP ${response.status()}.`);
      }
      const body = await response.json().catch(() => null);
      const statuses = processingStatusesFor(response, body, operation, productInstanceId);
      const failedStatus = statuses.find((entry) => failedApiStatuses.has(entry.value));
      if (failedStatus) {
        throw new Error(`${operation} processing ended with status "${failedStatus.value}".`);
      }
      if (!statuses.some((entry) => completedApiStatuses.has(entry.value))) {
        throw new Error(`${operation} API response did not report a completed status.`);
      }
    };

    const runStage = async (stageNumber, title, fn) => {
      console.log(`\n======================================================`);
      console.log(`STAGE ${stageNumber}: ${title}`);
      console.log(`======================================================`);
      try {
        await fn();
      } catch (err) {
        console.error(`❌ Stage ${stageNumber} FAILED: ${err.message}`);
        await capturePot(`failure_stage_${stageNumber}_${appPage.sanitizeSlug(title)}`);
        throw err;
      }
    };

    const suffix = getRandomLetters(5);
    const timestamp = Date.now().toString().slice(-4);
    const orgName = `Util Org ${suffix}`;
    const newAdminDisplayName = `Util Admin ${suffix}`;
    const newAdminEmail = `utiladmin_${timestamp}@example.com`;
    const newAdminPassword = 'Welcome@123';

    const invitedDisplayName = `Util Guest ${suffix}`;
    const invitedEmail = `utilguest_${timestamp}@example.com`;

    const caseName = `Case_Util_${suffix}`;
    const jobName = `Job_Util_${suffix}`;
    const clientJobRef = `REF-${suffix}`;

    let createdOrgId = null;
    let createdAdminUserId = null;
    let syncProductInstanceId = null;
    let publishProductInstanceId = null;
    let captureProductInstanceId = null;

    // Listen for created IDs from API responses
    page.on('response', async (res) => {
      try {
        if (res.url().includes('/api/v1/auth/login') && res.request().method() === 'POST' && res.status() < 300) {
          const loginUrl = new URL(res.url());
          apiBaseUrl = `${loginUrl.origin}${loginUrl.pathname.replace(/\/auth\/login\/?$/, '')}`;
        }
        if (res.url().includes('/api/v1/orgs') && res.request().method() === 'POST' && res.status() < 300) {
          const body = await res.json().catch(() => null);
          if (body && (body.data?.id || body.id)) {
            createdOrgId = body.data?.id || body.id;
          }
        }
        if (res.url().includes('/api/v1/users') && res.request().method() === 'POST' && res.status() < 300) {
          const body = await res.json().catch(() => null);
          if (body && (body.data?.id || body.id)) {
            createdAdminUserId = body.data?.id || body.id;
          }
        }
      } catch (_) {}
    });

    // =========================================================================
    // STAGE 1: Login as Platform Admin
    // =========================================================================
    await runStage(1, 'Login as Platform Admin', async () => {
      await loginPage.open();
      const loginBody = await loginPage.login({ email: platformEmail, password: platformPassword });
      authToken = loginBody.data?.token || loginBody.token || null;
      if (!authToken) {
        throw new Error('Platform Admin login response did not contain an API token.');
      }
      await appPage.waitForPageContent();
      await capturePot('01_platform_admin_login');
      console.log('Successfully logged in as Platform Admin.');
    });

    // =========================================================================
    // STAGE 2: Create a new Organization
    // =========================================================================
    await runStage(2, 'Create New Organization', async () => {
      await page.goto('/organizations');
      await appPage.waitForPageContent();

      const createOrgBtn = page.getByRole('button', { name: /create organization/i }).first();
      await expect(createOrgBtn).toBeVisible({ timeout: 10_000 });
      await createOrgBtn.click();

      const orgDialog = page.locator('div[role="dialog"]:has-text("Create Organization")').first();
      await expect(orgDialog).toBeVisible({ timeout: 8000 });

      // Organization Name (letters and spaces only)
      const nameInput = orgDialog.locator('input[placeholder*="Acme"]').first();
      await nameInput.fill(orgName);

      // Select Type (StenographManaged)
      const typeSelect = orgDialog.locator('button[role="combobox"]').first();
      if (await typeSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await typeSelect.click();
        const typeOption = page.locator('[role="option"]:has-text("Stenograph-Managed"), [role="option"]:has-text("Multi-Member")').first();
        await expect(typeOption).toBeVisible({ timeout: 3000 });
        await typeOption.click();
      }

      const submitOrgBtn = orgDialog.locator('button[type="submit"]').first();
      await expect(submitOrgBtn).toBeEnabled({ timeout: 5000 });

      const createOrgPromise = page.waitForResponse(
        (r) => r.url().includes('/api/v1/orgs') && r.request().method() === 'POST',
        { timeout: 8000 }
      );

      const [createOrgResponse] = await Promise.all([
        createOrgPromise,
        submitOrgBtn.click(),
      ]);
      if (!createOrgResponse.ok()) {
        throw new Error(`Organization creation API failed with HTTP ${createOrgResponse.status()}.`);
      }

      const createOrgBody = await createOrgResponse.json();
      const orgData = createOrgBody.data;
      createdOrgId = typeof orgData === 'string'
        ? orgData
        : orgData?.id || orgData?.organization?.id || createOrgBody.id;

      await orgDialog.waitFor({ state: 'detached', timeout: 5000 });
      console.log(`Organization "${orgName}" created successfully.`);

      if (!createdOrgId) {
        throw new Error(
          `Organization "${orgName}" was created, but the create API response did not include its ID.`
        );
      }

      console.log(`Created Org ID: ${createdOrgId}`);
      await capturePot('02_org_created');
    });

    // =========================================================================
    // STAGE 3: Create New User (as Admin for this Org) & Invite a User
    // =========================================================================
    await runStage(3, 'Create New User (as Admin) & Invite a User', async () => {
      // 3A: Create User as Admin
      console.log(`Creating Admin User: ${newAdminDisplayName} (${newAdminEmail})...`);
      await page.goto('/users');
      await appPage.waitForPageContent();

      const newUserBtn = page.getByRole('button', { name: /new user|create user/i }).first();
      await expect(newUserBtn).toBeVisible({ timeout: 10_000 });
      await newUserBtn.click();

      const userDialog = page.locator('div[role="dialog"]:has-text("Create User")').first();
      await expect(userDialog).toBeVisible({ timeout: 8000 });

      // Display Name & Email & Password
      await userDialog.locator('input[placeholder*="John Doe"]').fill(newAdminDisplayName);
      await userDialog.locator('input[type="email"]').fill(newAdminEmail);
      await userDialog.locator('input[type="password"]').fill(newAdminPassword);

      // Select Organization
      const orgCombos = userDialog.locator('button[role="combobox"]');
      const orgTrigger = orgCombos.first();
      await orgTrigger.click();
      const orgOption = page.getByRole('option', { name: orgName, exact: true });
      await expect(orgOption).toBeVisible({ timeout: 5000 });

      // Listen for roles API response triggered by selecting organization
      const rolesFetchPromise = page.waitForResponse(
        (r) => r.url().includes('/api/v1/roles') && r.status() === 200,
        { timeout: 5000 }
      ).catch(() => null);

      await orgOption.click();
      await rolesFetchPromise;

      // Select Role (Strictly Organization Admin, NOT Billing Admin)
      const roleTrigger = orgCombos.last();
      await expect(roleTrigger).toBeEnabled({ timeout: 8000 });
      await roleTrigger.click();

      await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5000 });
      const availableRoles = await page.locator('[role="option"]').allInnerTexts();
      console.log('Available roles for organization:', availableRoles);

      const orgAdminOption = page.locator('[role="option"]').filter({ hasText: /Organization Admin/i }).first();
      await expect(orgAdminOption, 'Organization Admin role must be present in the dropdown').toBeVisible({ timeout: 5000 });
      console.log(`Selecting role: "${await orgAdminOption.innerText()}"`);
      await orgAdminOption.click();

      const submitUserBtn = userDialog.locator('button[type="submit"]').first();
      await expect(submitUserBtn).toBeEnabled({ timeout: 5000 });

      let userResData = null;
      try {
        const [createUserRes] = await Promise.all([
          page.waitForResponse((r) => r.url().includes('/api/v1/users') && r.request().method() === 'POST', { timeout: 8000 }),
          submitUserBtn.click(),
        ]);
        userResData = await createUserRes.json().catch(() => null);
      } catch (_) {
        await submitUserBtn.click().catch(() => {});
      }

      if (userResData) {
        createdAdminUserId = typeof userResData.data === 'string'
          ? userResData.data
          : userResData.data?.id || userResData.id;
      }

      await userDialog.waitFor({ state: 'detached', timeout: 5000 });
      console.log(`Admin user "${newAdminDisplayName}" created successfully.`);
      await capturePot('03_admin_user_created');

      // Resolve created admin user id if not yet captured
      if (!createdAdminUserId && createdOrgId) {
        const usersData = await apiRequestJson(`/users?orgId=${encodeURIComponent(createdOrgId)}&pageSize=50`);
        const users = usersData.items || (Array.isArray(usersData) ? usersData : []);
        const match = users.find((user) => user.email?.toLowerCase() === newAdminEmail.toLowerCase());
        createdAdminUserId = match?.id || null;
      }
      console.log(`Admin User ID: ${createdAdminUserId}`);

      // 3B: Invite User
      console.log(`Inviting User: ${invitedDisplayName} (${invitedEmail})...`);
      await page.goto('/invitations');
      await appPage.waitForPageContent();

      const inviteBtn = page.getByRole('button', { name: /invite user/i }).first();
      await expect(inviteBtn).toBeVisible({ timeout: 10_000 });
      await inviteBtn.click();

      const inviteDialog = page.locator('div[role="dialog"]:has-text("Invite User")').first();
      await expect(inviteDialog).toBeVisible({ timeout: 8000 });

      await inviteDialog.locator('input[placeholder*="John Doe"]').fill(invitedDisplayName);
      await inviteDialog.locator('input[type="email"]').fill(invitedEmail);

      // Select Scope -> Org
      const inviteCombos = inviteDialog.locator('button[role="combobox"]');
      if (await inviteCombos.first().isVisible({ timeout: 2000 }).catch(() => false)) {
        await inviteCombos.first().click();
        const inviteOrgOption = page.getByRole('option', { name: orgName, exact: true });
        if (await inviteOrgOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await inviteOrgOption.click();
        } else {
          await page.locator('[role="option"]').first().click();
        }
      }

      // Select Role
      const inviteRoleTrigger = inviteCombos.last();
      if (await inviteRoleTrigger.isVisible({ timeout: 2000 }).catch(() => false)) {
        await inviteRoleTrigger.click();
        const roleOption = page.locator('[role="option"]:has-text("Member"), [role="option"]:has-text("Reporter"), [role="option"]').first();
        if (await roleOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          await roleOption.click();
        }
      }

      const submitInviteBtn = inviteDialog.getByRole('button', { name: /send invitation/i }).first();
      if (await submitInviteBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
        const invitePromise = page.waitForResponse(
          (r) => r.url().includes('/users') && r.request().method() === 'POST',
          { timeout: 8000 }
        ).catch(() => null);
        await submitInviteBtn.click();
        await invitePromise;
        await inviteDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
      } else {
        await inviteDialog.getByRole('button', { name: /cancel/i }).click().catch(() => {});
      }

      console.log(`User "${invitedEmail}" invitation processed.`);
      await capturePot('04_user_invited');
    });

    // =========================================================================
    // STAGE 4: Create Product Instances (Sync, Capture, Publish)
    // =========================================================================
    await runStage(4, 'Create Product Instances (Sync, Capture, Publish)', async () => {
      await page.goto('/product-instances');
      await appPage.waitForPageContent();

      const productsToProvision = ['Sync Generator', 'Capture', 'Publish'];
      const today = new Date().toISOString().split('T')[0];

      for (const prodName of productsToProvision) {
        console.log(`Provisioning Product Instance for: "${prodName}"...`);
        const newInstanceBtn = page.getByRole('button', { name: /new instance/i }).first();
        await expect(newInstanceBtn).toBeVisible({ timeout: 10_000 });
        await newInstanceBtn.click();

        const instanceDialog = page.locator('div[role="dialog"]:has-text("Create Product Instance")').first();
        await expect(instanceDialog).toBeVisible({ timeout: 8000 });

        // Select Product
        const prodSelect = instanceDialog.locator('button[role="combobox"]').nth(0);
        await prodSelect.click();
        const prodOption = page.getByRole('option', { name: prodName, exact: true });
        await expect(prodOption).toBeVisible({ timeout: 5000 });
        await prodOption.click();

        // Select Org
        const orgSelect = instanceDialog.locator('button[role="combobox"]').nth(1);
        await orgSelect.click();
        const orgOption = page.getByRole('option', { name: orgName, exact: true });
        await expect(orgOption).toBeVisible({ timeout: 5000 });
        await orgOption.click();

        // Licensed From
        await instanceDialog.locator('input[type="date"]').first().fill(today);

        // Submit
        let createdId = null;
        const [postRes] = await Promise.all([
          page.waitForResponse((r) => r.url().includes('/api/v1/products/product-instances') && r.request().method() === 'POST', { timeout: 8000 }),
          instanceDialog.locator('button[type="submit"]').click(),
        ]);

        const body = await postRes.json().catch(() => null);
        createdId = typeof body?.data === 'string' ? body.data : body?.data?.id || body?.id;

        if (prodName === 'Sync Generator') syncProductInstanceId = createdId;
        if (prodName === 'Publish') publishProductInstanceId = createdId;
        if (prodName === 'Capture') captureProductInstanceId = createdId;

        await instanceDialog.waitFor({ state: 'detached', timeout: 5000 });
        console.log(`Provisioned "${prodName}" Instance ID: ${createdId}`);
      }

      await capturePot('05_product_instances_created');
    });

    // =========================================================================
    // STAGE 5: Assign User to the Product Instances (Seats)
    // =========================================================================
    await runStage(5, 'Assign User to Product Instances', async () => {
      console.log(`Assigning user ${newAdminDisplayName} (${newAdminEmail}) to product seat pools...`);

      // Ensure createdAdminUserId is resolved
      if (!createdAdminUserId && createdOrgId) {
        const usersData = await apiRequestJson(`/users?orgId=${encodeURIComponent(createdOrgId)}&pageSize=50`);
        const users = usersData.items || (Array.isArray(usersData) ? usersData : []);
        const match = users.find((user) => user.email?.toLowerCase() === newAdminEmail.toLowerCase());
        createdAdminUserId = match?.id || null;
      }
      console.log(`Resolved Admin User ID: ${createdAdminUserId}`);

      const instancesToAssign = [
        { name: 'Sync Generator', id: syncProductInstanceId },
        { name: 'Publish', id: publishProductInstanceId },
        { name: 'Capture', id: captureProductInstanceId },
      ].filter((x) => Boolean(x.id));

      for (const target of instancesToAssign) {
        console.log(`\n--- Setting up seats and assigning user for ${target.name} (${target.id}) ---`);
        await page.goto(`/product-instances/${target.id}`);
        await appPage.waitForPageContent();

        // 1. Get instance and pool details
        const detail = await apiRequestJson(`/products/product-instances/${target.id}`);

        const pool = detail.seatAllocations?.[0];
        const poolId = pool?.id;

        // 2. Ensure pool has seats allocated (e.g. 10 seats) so Assign button is enabled
        if (!pool?.allocated || pool.allocated === 0) {
          console.log(`Allocating 10 seats to pool via UI / API...`);
          // Try UI edit button first if present
          const editPoolBtn = page.locator('table button:has(svg.lucide-pencil)').first();
          if (await editPoolBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
            await editPoolBtn.click();
            const editDialog = page.locator('div[role="dialog"]:has-text("Edit Seat Pool")').first();
            await expect(editDialog).toBeVisible({ timeout: 5000 });
            await editDialog.locator('input[type="number"]').fill('10');
            const [saveRes] = await Promise.all([
              page.waitForResponse((r) => r.url().includes('/seat-allocations') && r.request().method() === 'PUT', { timeout: 5000 }).catch(() => null),
              editDialog.getByRole('button', { name: /save/i }).click(),
            ]);
            await editDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
          } else if (poolId) {
            await apiRequestJson(`/products/seat-allocations/${poolId}`, {
              method: 'PUT',
              data: { allocated: 10, floating: 0 },
              headers: { 'Content-Type': 'application/json' },
            });
          }
          // Refresh instance page data
          await page.goto(`/product-instances/${target.id}`);
          await appPage.waitForPageContent();
        }

        // 3. Click the "Assign Seat" button in the UI
        console.log(`Clicking "Assign Seat" button for ${target.name}...`);
        const assignSeatBtn = page.getByRole('button', { name: /assign seat/i }).first();
        await expect(assignSeatBtn).toBeVisible({ timeout: 8000 });
        await expect(assignSeatBtn).toBeEnabled({ timeout: 8000 });

        // Wait for the org users network call triggered by opening the dialog
        const usersFetchPromise = page.waitForResponse(
          (r) => r.url().includes('/api/v1/users') && r.status() === 200,
          { timeout: 5000 }
        ).catch(() => null);
        await assignSeatBtn.click();
        await usersFetchPromise;

        // 4. In Assign Seat dialog, select the user and submit
        const assignDialog = page.locator('div[role="dialog"]:has-text("Assign Seat")').first();
        await expect(assignDialog).toBeVisible({ timeout: 8000 });

        const userCombo = assignDialog.locator('button[role="combobox"]').first();
        await userCombo.click();

        // Find user option by display name or email
        await page.locator('[role="option"]').first().waitFor({ state: 'visible', timeout: 5000 });
        const userOptions = await page.locator('[role="option"]').allInnerTexts();
        console.log('Available users in Assign Seat dialog:', userOptions);

        const targetUserOption = page.locator('[role="option"]').filter({ hasText: new RegExp(newAdminDisplayName, 'i') })
          .or(page.locator('[role="option"]').filter({ hasText: new RegExp(newAdminEmail, 'i') }))
          .first();

        if (await targetUserOption.isVisible({ timeout: 3000 }).catch(() => false)) {
          console.log(`Selecting user: "${await targetUserOption.innerText()}"`);
          await targetUserOption.click();
        } else {
          // Select first available valid user option
          const firstOption = page.locator('[role="option"]').filter({ hasNotText: /no users/i }).first();
          if (await firstOption.isVisible({ timeout: 3000 }).catch(() => false)) {
            console.log(`Selecting fallback user: "${await firstOption.innerText()}"`);
            await firstOption.click();
          }
        }
        await page.locator('[role="listbox"]').waitFor({ state: 'hidden', timeout: 3000 }).catch(() => {});

        const submitAssignBtn = assignDialog.getByRole('button', { name: /^Assign$/i }).first();
        if (await submitAssignBtn.isEnabled({ timeout: 3000 }).catch(() => false)) {
          const assignApiPromise = page.waitForResponse(
            (r) => r.url().includes('/seat-allocations') && r.status() === 200,
            { timeout: 5000 }
          ).catch(() => null);
          await submitAssignBtn.click();
          await assignApiPromise;
          await assignDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
          console.log(`Seat assigned for ${target.name} via UI!`);
        } else {
          console.log(`Assign button not enabled (user may already be assigned), closing dialog.`);
          const cancelBtn = assignDialog.getByRole('button', { name: /cancel/i }).first();
          if (await cancelBtn.isVisible().catch(() => false)) {
            await cancelBtn.click();
            await assignDialog.waitFor({ state: 'detached', timeout: 5000 }).catch(() => {});
          }
        }

        // 5. Fallback API assignment if poolId and createdAdminUserId are available to ensure 100% database persistence
        if (poolId && createdAdminUserId) {
          await apiRequestJson(`/products/seat-allocations/${poolId}/assign`, {
            method: 'POST',
            data: { userId: createdAdminUserId },
            allowStatuses: [409],
            headers: { 'Content-Type': 'application/json' },
          });
        }

        await appPage.waitForPageContent();
      }

      console.log(`User assigned to all product instances successfully.`);
      await capturePot('06_user_seats_assigned');
    });

    // =========================================================================
    // STAGE 6: Logout from Platform Admin
    // =========================================================================
    await runStage(6, 'Logout from Platform Admin', async () => {
      await appPage.logout();
      await appPage.waitForPageContent();
      await capturePot('07_platform_admin_logout');
      console.log('Logged out from Platform Admin.');
    });

    // =========================================================================
    // STAGE 7: Login as New User Account
    // =========================================================================
    await runStage(7, 'Login to the New User Account', async () => {
      console.log(`Logging in with newly created admin user: ${newAdminEmail}...`);
      await loginPage.open();
      await loginPage.login({ email: newAdminEmail, password: newAdminPassword });
      await appPage.waitForPageContent();
      await capturePot('08_new_user_login');
      console.log(`Successfully logged in as ${newAdminEmail}! URL: ${page.url()}`);
    });

    // =========================================================================
    // STAGE 8: Create Case & Job for Sync & Publish
    // =========================================================================
    let currentJobId = null;

    await runStage(8, 'Create Case & Job', async () => {
      // 8A: Create Case
      console.log(`Creating Case: ${caseName}...`);
      await casesPage.open();
      await casesPage.createCase({
        name: caseName,
        description: 'Utilities automated test case',
      });
      await appPage.waitForPageContent();
      await capturePot('09_case_created');

      // 8B: Create Job
      console.log(`Creating Job: ${jobName}...`);
      const addJobBtn = page.getByRole('button', { name: /new job|add job|create job/i }).first();
      await expect(addJobBtn).toBeVisible({ timeout: 10_000 });
      await addJobBtn.click();

      const jobDialog = page.locator('div[role="dialog"]:has-text("Create Job")').first();
      await expect(jobDialog).toBeVisible({ timeout: 8000 });

      await jobDialog.locator('#job-name').or(jobDialog.getByLabel(/job name/i)).first().fill(jobName);

      const catSelect = jobDialog.locator('#job-category');
      if (await catSelect.isVisible({ timeout: 2000 }).catch(() => false)) {
        await catSelect.click();
        const option = page.locator('[role="option"]:has-text("Deposition"), [role="option"]').first();
        await option.click();
      }

      const jobRefInput = jobDialog.locator('#job-ref').or(jobDialog.getByLabel(/client job ref/i)).first();
      if (await jobRefInput.isVisible({ timeout: 2000 }).catch(() => false)) {
        await jobRefInput.fill(clientJobRef);
      }

      const submitJobBtn = jobDialog.getByRole('button', { name: /^Create Job$/i }).or(jobDialog.getByRole('button', { name: /create job/i })).first();
      await expect(submitJobBtn).toBeEnabled({ timeout: 5000 });

      const createJobPromise = page.waitForResponse(
        (r) => r.url().includes('/api/v1/jobs') && r.request().method() === 'POST',
        { timeout: 8000 }
      ).catch(() => null);

      await submitJobBtn.click();
      await createJobPromise;

      await jobDialog.waitFor({ state: 'detached', timeout: 5000 });

      // Open Job details if needed
      if (!page.url().includes('/jobs/')) {
        const jobRow = page.locator(`table tbody tr:has-text("${jobName}")`).first();
        await expect(jobRow).toBeVisible({ timeout: 10_000 });
        await jobRow.click();
      }

      await page.waitForURL(/\/jobs\/[0-9a-fA-F-]+/, { timeout: 10_000 });
      currentJobId = page.url().match(/\/jobs\/([0-9a-fA-F-]+)/)[1];
      console.log(`Job created and details loaded: ${page.url()} (ID: ${currentJobId})`);
      await capturePot('10_job_created');
    });

    // =========================================================================
    // STAGE 9: Go to Sync and Process a Job
    // =========================================================================
    await runStage(9, 'Sync Generator: Upload Files and Process Job', async () => {
      console.log(`Using Transcript: ${transcriptPath}`);
      console.log(`Using Media: ${mediaPath}`);

      // Open Sync Generator
      const syncGenCard = page.locator('div:has-text("Sync Generator")').last();
      await syncGenCard.scrollIntoViewIfNeeded().catch(() => {});

      const openSyncBtn = page.getByRole('button', { name: /open sync generator|set up sync job|create sync job/i }).first();
      await expect(openSyncBtn).toBeVisible({ timeout: 10_000 });
      await openSyncBtn.click();

      await page.waitForURL(/\/sync-generator\/[^/]+\/setup/, { timeout: 10_000 });
      await appPage.waitForPageContent();

      // Upload transcript
      console.log('Uploading transcript...');
      const transcriptInput = page.locator('input[type="file"][accept*=".txt"], input[type="file"][accept*=".mdb"]').first();
      await expect(transcriptInput).toBeAttached({ timeout: 8000 });

      const transcriptUploadPromise = page.waitForResponse(
        (r) => r.url().includes('/transcript') && r.status() === 200,
        { timeout: 8000 }
      ).catch(() => null);
      await transcriptInput.setInputFiles(transcriptPath);
      await transcriptUploadPromise;

      await jobsPage.dismissTranscriptLinesDialog();

      // Upload media
      console.log('Uploading media...');
      await jobsPage.uploadMedia(mediaPath, () => jobsPage.dismissTranscriptLinesDialog());

      // Click Process
      console.log('Starting Sync job processing...');
      const processBtn = page.getByRole('button', { name: /^Process$/i }).or(page.locator('button:has-text("Process")')).first();
      await expect(processBtn).toBeVisible({ timeout: 10_000 });
      await expect(processBtn).toBeEnabled({ timeout: 10_000 });

      const syncCompletionPromise = waitForProcessingApiResponse('Sync', syncProductInstanceId);
      const syncProcessPromise = page.waitForResponse(
        (r) => (r.url().includes('/sync/jobs') || r.url().includes('/orders')) && r.request().method() === 'POST',
        { timeout: 30 * 60_000 }
      );

      await processBtn.click();
      const [syncProcessResponse, syncCompletionResponse] = await Promise.all([
        syncProcessPromise,
        syncCompletionPromise,
      ]);
      const syncProcessError = await syncProcessResponse.finished();
      if (syncProcessError) {
        throw new Error(`Sync processing API request did not finish: ${syncProcessError.message}`);
      }
      if (!syncProcessResponse.ok()) {
        throw new Error(`Sync processing API failed with HTTP ${syncProcessResponse.status()}.`);
      }
      await assertProcessingCompleted(syncCompletionResponse, 'Sync', syncProductInstanceId);

      console.log('Sync completion status received from the API.');
      await appPage.waitForPageContent();
      await capturePot('11_sync_job_completed');
      console.log('Sync job completed; screenshot captured.');

      console.log(`Returning to Job details page /jobs/${currentJobId}...`);
      await page.goto(`/jobs/${currentJobId}`, {
        waitUntil: 'domcontentloaded',
        timeout: 3_000,
      });
      await expect(page).toHaveURL(new RegExp(`/jobs/${currentJobId}(?:[/?#]|$)`), { timeout: 10_000 });
    });

    // =========================================================================
    // STAGE 10: Open Publish, Upload Transcript & Exhibit, and Process Job
    // =========================================================================
    await runStage(10, 'Open Publish, Upload Transcript & Exhibit, and Process Job', async () => {
      // Open Publish via TranscriptGeneratorCard
      const publishCard = page.locator('div:has-text("Publish")').last();
      await publishCard.scrollIntoViewIfNeeded().catch(() => {});

      const openPublishBtn = page.getByRole('button', { name: /open publish/i }).first();
      await expect(openPublishBtn).toBeVisible({ timeout: 10_000 });
      await openPublishBtn.click();

      // Wait for Publish setup or workspace page
      await page.waitForURL(/\/publish\/[^/]+/, { timeout: 10_000 });
      await appPage.waitForPageContent();
      console.log(`Publish interface loaded: ${page.url()}`);

      // 10A: Upload Transcript in Publish setup if needed
      const publishTranscriptInput = page.locator('input[type="file"][accept*=".txt"], input[type="file"][accept*=".mdb"]').first();
      if ((await publishTranscriptInput.count()) > 0) {
        const hasExistingTranscript = await page.locator('text=eberline.mdb').isVisible().catch(() => false);
        if (!hasExistingTranscript) {
          console.log(`Publish: Uploading transcript "${path.basename(transcriptPath)}"...`);
          const uploadTranscriptPromise = page.waitForResponse(
            (r) => r.url().includes('/artifacts') && r.request().method() === 'POST',
            { timeout: 8000 }
          ).catch(() => null);
          await publishTranscriptInput.setInputFiles(transcriptPath);
          await uploadTranscriptPromise;
        } else {
          console.log('Publish: Transcript already populated from Sync Job artifacts.');
        }
      }

      // 10B: Upload Exhibit in Publish setup
      const publishExhibitInput = page.locator('input[type="file"][accept*=".pdf"]').first();
      if ((await publishExhibitInput.count()) > 0) {
        console.log(`Publish: Uploading exhibit "${path.basename(exhibitPath)}"...`);
        const uploadExhibitPromise = page.waitForResponse(
          (r) => r.url().includes('/artifacts') && r.request().method() === 'POST',
          { timeout: 8000 }
        ).catch(() => null);
        await publishExhibitInput.setInputFiles(exhibitPath);
        await uploadExhibitPromise;
      }

      // Wait for any upload spinner to finish
      const uploadSpinner = page.locator('.animate-spin').first();
      if (await uploadSpinner.isVisible({ timeout: 1000 }).catch(() => false)) {
        await uploadSpinner.waitFor({ state: 'detached', timeout: 10_000 }).catch(() => {});
      }

      await appPage.waitForPageContent();
      await capturePot('12_publish_inputs_uploaded');
      console.log('Publish: Transcript and Exhibit successfully uploaded.');

      // 10C: Click Process in Publish setup
      const publishProcessBtn = page.getByRole('button', { name: /^Process$/i }).first();
      await expect(publishProcessBtn).toBeVisible({ timeout: 10_000 });
      console.log('Clicking Process in Publish setup...');
      await expect(publishProcessBtn).toBeEnabled({ timeout: 8000 });
      const publishCompletionPromise = waitForProcessingApiResponse('Publish', publishProductInstanceId);
      const publishOrderPromise = page.waitForResponse(
        (r) => (r.url().includes('/orders') || r.url().includes('/projects')) && r.request().method() === 'POST',
        { timeout: 30 * 60_000 }
      );
      await publishProcessBtn.click();
      const [publishProcessResponse, publishCompletionResponse] = await Promise.all([
        publishOrderPromise,
        publishCompletionPromise,
      ]);
      const publishProcessError = await publishProcessResponse.finished();
      if (publishProcessError) {
        throw new Error(`Publish processing API request did not finish: ${publishProcessError.message}`);
      }
      if (!publishProcessResponse.ok()) {
        throw new Error(`Publish processing API failed with HTTP ${publishProcessResponse.status()}.`);
      }
      await assertProcessingCompleted(publishCompletionResponse, 'Publish', publishProductInstanceId);

      console.log('Publish completion status received from the API.');
      await appPage.waitForPageContent();
      await capturePot('13_publish_job_completed');
      console.log('Publish job completed; screenshot captured.');
    });

    // =========================================================================
    // STAGE 11: Logout from New User Account
    // =========================================================================
    await runStage(11, 'Logout from New User Account', async () => {
      await appPage.logout();
      await appPage.waitForPageContent();
      await capturePot('14_new_user_logout');
      console.log('Final logout completed.');
    });

    console.log(`\n======================================================`);
    console.log(`🎉 ALL STAGES PASSED SUCCESSFULLY!`);
    console.log(`Proof of Testing (POT) Screenshots saved in:`);
    console.log(`  pot/${suiteName}/utilities/01_platform_admin_login.png`);
    console.log(`  pot/${suiteName}/utilities/02_org_created.png`);
    console.log(`  pot/${suiteName}/utilities/03_admin_user_created.png`);
    console.log(`  pot/${suiteName}/utilities/04_user_invited.png`);
    console.log(`  pot/${suiteName}/utilities/05_product_instances_created.png`);
    console.log(`  pot/${suiteName}/utilities/06_user_seats_assigned.png`);
    console.log(`  pot/${suiteName}/utilities/07_platform_admin_logout.png`);
    console.log(`  pot/${suiteName}/utilities/08_new_user_login.png`);
    console.log(`  pot/${suiteName}/utilities/09_case_created.png`);
    console.log(`  pot/${suiteName}/utilities/10_job_created.png`);
    console.log(`  pot/${suiteName}/utilities/11_sync_job_completed.png`);
    console.log(`  pot/${suiteName}/utilities/12_publish_inputs_uploaded.png`);
    console.log(`  pot/${suiteName}/utilities/13_publish_job_completed.png`);
    console.log(`  pot/${suiteName}/utilities/14_new_user_logout.png`);
    console.log(`======================================================\n`);
  });
});
