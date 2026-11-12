#!/usr/bin/env node

/**
 * Stenograph One (S1) Automated Cleanup & Teardown CLI
 *
 * Cleans / deletes unwanted organizations, users, cases, jobs, and product instances.
 * Implements cascade deletion to respect foreign key and relational constraints.
 *
 * Usage:
 *   node scripts/cleanup.js org <query>          # e.g. node scripts/cleanup.js org c1
 *   node scripts/cleanup.js user <query>         # e.g. node scripts/cleanup.js user jo
 *   node scripts/cleanup.js case <query>         # e.g. node scripts/cleanup.js case test
 *   node scripts/cleanup.js job <query>          # e.g. node scripts/cleanup.js job audio
 *   node scripts/cleanup.js instance <query>     # e.g. node scripts/cleanup.js instance sync
 *   node scripts/cleanup.js test-data            # Cleans all auto-generated test data
 *
 * Shorthand / Colon syntax:
 *   node scripts/cleanup.js org:c1
 *   node scripts/cleanup.js clear:job:audio
 *   npm run clear:org -- c1
 *   npm run clear:user -- jo
 *   npm run clear:job -- audio
 *   npm run clear:test-data
 */

const readline = require('readline');
const path = require('path');
const { baseURL } = require('../env');

const BASE_URL = baseURL.replace(/\/+$/, '');
const PLATFORM_EMAIL = process.env.PLATFORM_EMAIL || 'stenoadmin@stenoone.local';
const PLATFORM_PASSWORD = process.env.PLATFORM_PASSWORD || 'Welcome@123';

let authToken = null;

// =============================================================================
// HTTP & API CLIENT HELPERS
// =============================================================================

async function login() {
  if (authToken) return authToken;

  console.log(`🔐 Authenticating as Platform Admin (${PLATFORM_EMAIL})...`);
  const res = await fetch(`${BASE_URL}/api/v1/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: PLATFORM_EMAIL, password: PLATFORM_PASSWORD }),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed with HTTP ${res.status}: ${txt}`);
  }

  const contentType = res.headers.get('content-type') || 'unknown';
  const responseText = await res.text();
  let json;
  try {
    json = JSON.parse(responseText);
  } catch (error) {
    const isHtml = /text\/html/i.test(contentType) || /^\s*<!doctype\s+html/i.test(responseText);
    const responseKind = isHtml ? 'HTML' : 'non-JSON';
    throw new Error(
      `Login endpoint returned ${responseKind} instead of JSON ` +
      `(HTTP ${res.status}, Content-Type: ${contentType}). ` +
      'Check that BASE_URL points to the application origin and that /api/v1/auth/login is routed to the API.',
      { cause: error }
    );
  }
  authToken = json?.data?.token || json?.token;
  if (!authToken) {
    throw new Error(`Failed to extract auth token from response: ${JSON.stringify(json)}`);
  }
  console.log(`✓ Authenticated successfully.\n`);
  return authToken;
}

async function apiRequest(endpoint, options = {}) {
  const token = await login();
  const headers = {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const url = `${BASE_URL}/api/v1${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
  const res = await fetch(url, { ...options, headers });
  const text = await res.text();

  let data = null;
  try {
    data = JSON.parse(text);
  } catch (_) {
    data = text;
  }

  return {
    status: res.status,
    ok: res.ok,
    data: data?.data !== undefined ? data.data : data,
    raw: data,
  };
}

async function fetchAllPages(endpoint) {
  let allItems = [];
  let page = 1;
  const pageSize = 50;

  while (true) {
    const separator = endpoint.includes('?') ? '&' : '?';
    const res = await apiRequest(`${endpoint}${separator}page=${page}&pageSize=${pageSize}`);
    if (!res.ok) break;

    const items = res.data?.items || (Array.isArray(res.data) ? res.data : []);
    if (!items.length) break;

    allItems.push(...items);
    const totalPages = res.data?.totalPages || 1;
    if (page >= totalPages) break;
    page++;
  }

  return allItems;
}

// =============================================================================
// CASCADE DELETION ROUTINES
// =============================================================================

/**
 * Delete a Job by ID
 */
async function deleteJob(id, name = '') {
  process.stdout.write(`  ⏳ Deleting Job [${name || id}]... `);
  const res = await apiRequest(`/jobs/${id}`, { method: 'DELETE' });
  if (res.ok) {
    console.log(`✓ Deleted`);
    return true;
  } else {
    console.log(`✗ Failed (${res.status}): ${JSON.stringify(res.raw?.errors || res.raw)}`);
    return false;
  }
}

/**
 * Delete a Case by ID (Cascade: deletes all its jobs first)
 */
async function deleteCase(id, name = '') {
  console.log(`\n📁 Cascading Case [${name || id}]:`);
  // Find child jobs
  const jobs = await fetchAllPages(`/jobs?caseId=${id}`);
  if (jobs.length > 0) {
    console.log(`  Found ${jobs.length} jobs in case "${name || id}". Deleting child jobs...`);
    for (const job of jobs) {
      await deleteJob(job.id, job.name);
    }
  }

  process.stdout.write(`  ⏳ Deleting Case [${name || id}]... `);
  const res = await apiRequest(`/cases/${id}`, { method: 'DELETE' });
  if (res.ok) {
    console.log(`✓ Deleted`);
    return true;
  } else {
    console.log(`✗ Failed (${res.status}): ${JSON.stringify(res.raw?.errors || res.raw)}`);
    return false;
  }
}

/**
 * Delete a User by ID (Cascade: revokes any assigned seat allocations first)
 */
async function deleteUser(id, email = '') {
  process.stdout.write(`  ⏳ Deleting User [${email || id}]... `);

  // Check user details to revoke seats if any
  try {
    const userRes = await apiRequest(`/users/${id}`);
    const user = userRes.data;
    if (user?.productSeats && user.productSeats.length > 0) {
      for (const seat of user.productSeats) {
        if (seat.seatAllocationId) {
          await apiRequest(`/products/seat-allocations/${seat.seatAllocationId}/revoke`, {
            method: 'POST',
            body: JSON.stringify({ userId: id }),
          });
        }
      }
    }
  } catch (_) {}

  // Delete user
  const res = await apiRequest(`/users/${id}`, { method: 'DELETE' });
  if (res.ok) {
    console.log(`✓ Deleted`);
    return true;
  }

  // If user was an invitation record, attempt revoke
  const invRes = await apiRequest(`/invitations/${id}`, { method: 'DELETE' });
  if (invRes.ok) {
    console.log(`✓ Revoked / Deleted invitation`);
    return true;
  }

  console.log(`✗ Failed (${res.status}): ${JSON.stringify(res.raw?.errors || res.raw)}`);
  return false;
}

/**
 * Clean / Deactivate a Product Instance
 * - Revokes user seats
 * - Deletes seat allocation pools
 * - Suspends the instance
 */
async function cleanupInstance(id, name = '') {
  console.log(`\n⚙️ Cleaning Product Instance [${name || id}]:`);
  const instRes = await apiRequest(`/products/product-instances/${id}`);
  const instance = instRes.data;

  if (instance?.seatAllocations && instance.seatAllocations.length > 0) {
    for (const pool of instance.seatAllocations) {
      // Check and revoke assigned users
      try {
        const poolUsersRes = await apiRequest(`/products/seat-allocations/${pool.id}/users`);
        const users = poolUsersRes.data?.items || (Array.isArray(poolUsersRes.data) ? poolUsersRes.data : []);
        for (const u of users) {
          process.stdout.write(`    Revoking seat for ${u.email || u.id}... `);
          await apiRequest(`/products/seat-allocations/${pool.id}/revoke`, {
            method: 'POST',
            body: JSON.stringify({ userId: u.id }),
          });
          console.log(`✓ Revoked`);
        }
      } catch (_) {}

      // Delete pool
      process.stdout.write(`    Deleting Seat Allocation Pool [${pool.id}]... `);
      const delPool = await apiRequest(`/products/seat-allocations/${pool.id}`, { method: 'DELETE' });
      if (delPool.ok) console.log(`✓ Deleted`);
      else console.log(`✗ Failed (${delPool.status}): ${JSON.stringify(delPool.raw?.errors || delPool.raw)}`);
    }
  }

  // Deactivate instance (status: Suspended)
  process.stdout.write(`  ⏳ Suspending Product Instance [${name || id}]... `);
  const patchRes = await apiRequest(`/products/product-instances/${id}`, {
    method: 'PATCH',
    body: JSON.stringify({ status: 'Suspended' }),
  });
  if (patchRes.ok) {
    console.log(`✓ Suspended (Inactive)`);
    return true;
  } else {
    console.log(`✗ Failed (${patchRes.status}): ${JSON.stringify(patchRes.raw?.errors || patchRes.raw)}`);
    return false;
  }
}

/**
 * Delete an Organization (Cascade: cases, jobs, product instances, users, then org)
 */
async function deleteOrg(id, name = '') {
  console.log(`\n🏢 Cascading Organization [${name || id}]:`);

  // 1. Delete Cases & Jobs
  const cases = await fetchAllPages(`/cases?orgId=${id}`);
  if (cases.length > 0) {
    console.log(`  Found ${cases.length} cases in organization. Deleting cases...`);
    for (const c of cases) {
      await deleteCase(c.id, c.name);
    }
  }

  // 2. Clean Product Instances & Seat Pools
  const instances = await fetchAllPages(`/products/product-instances?orgId=${id}`);
  if (instances.length > 0) {
    console.log(`  Found ${instances.length} product instances. Cleaning seat pools...`);
    for (const inst of instances) {
      await cleanupInstance(inst.id, `${inst.productName} (${inst.id.slice(0, 8)})`);
    }
  }

  // 3. Delete or unlink Users
  const users = await fetchAllPages(`/users?orgId=${id}`);
  if (users.length > 0) {
    console.log(`  Found ${users.length} users with primary org. Deleting users...`);
    for (const u of users) {
      await deleteUser(u.id, u.email);
    }
  }

  // Also scan all users to see if any user has this org in their organizations list
  const allUsers = await fetchAllPages(`/users`);
  for (const u of allUsers) {
    if (u.orgId === id) {
      await deleteUser(u.id, u.email);
    }
  }

  // 4. Delete Organization
  process.stdout.write(`  ⏳ Deleting Organization [${name || id}]... `);
  const res = await apiRequest(`/orgs/${id}`, { method: 'DELETE' });
  if (res.ok) {
    console.log(`✓ Organization Deleted successfully!`);
    return true;
  } else if (res.status === 409) {
    // If backend prevents hard-deleting due to soft-deleted historic users, deactivate & archive it
    console.log(`⚠️ Relational constraint (historic user). Deactivating & archiving...`);
    const deactRes = await apiRequest(`/orgs/${id}`, {
      method: 'PUT',
      body: JSON.stringify({
        name: name.startsWith('[Archived]') ? name : `[Archived] ${name}`,
        status: 'Deactivated'
      }),
    });
    if (deactRes.ok) {
      console.log(`✓ Organization set to Status: Deactivated & archived.`);
      return true;
    } else {
      console.log(`✗ Failed to deactivate (${deactRes.status}): ${JSON.stringify(deactRes.raw?.errors || deactRes.raw)}`);
      return false;
    }
  } else {
    console.log(`✗ Failed (${res.status}): ${JSON.stringify(res.raw?.errors || res.raw)}`);
    return false;
  }
}

// =============================================================================
// SEARCH & ACTION DISPATCHERS
// =============================================================================

async function searchCasesAcrossOrgs(query) {
  const matched = new Map();
  const q = query.toLowerCase();

  // 1. Direct GUID lookup
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const direct = await apiRequest(`/cases/${query}`);
    if (direct.ok && direct.data?.id) {
      matched.set(direct.data.id, direct.data);
      return Array.from(matched.values());
    }
  }

  // 2. Fast search on base endpoint
  const baseRes = await fetchAllPages(`/cases?search=${encodeURIComponent(query)}`);
  for (const c of baseRes) {
    if (c?.id && ((c.name && c.name.toLowerCase().includes(q)) || (c.description && c.description.toLowerCase().includes(q)))) {
      matched.set(c.id, c);
    }
  }

  // 3. If nothing found yet, check primary org
  if (matched.size === 0) {
    const primaryOrgId = 'a9cadcb9-f8f0-4fba-80ee-25827520d4ce';
    try {
      const orgCases = await fetchAllPages(`/cases?orgId=${primaryOrgId}&search=${encodeURIComponent(query)}`);
      for (const c of orgCases) {
        if (c?.id) matched.set(c.id, c);
      }
    } catch (_) {}
  }

  return Array.from(matched.values());
}

async function searchJobsAcrossOrgs(query) {
  const matched = new Map();
  const q = query.toLowerCase();

  // 1. Direct GUID lookup
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(query)) {
    const direct = await apiRequest(`/jobs/${query}`);
    if (direct.ok && direct.data?.id) {
      matched.set(direct.data.id, direct.data);
      return Array.from(matched.values());
    }
  }

  // 2. Fetch jobs from main jobs endpoint and filter
  const allJobs = await fetchAllPages('/jobs');
  for (const j of allJobs) {
    if (
      j?.id &&
      ((j.name && j.name.toLowerCase().includes(q)) ||
        (j.clientJobRef && j.clientJobRef.toLowerCase().includes(q)) ||
        (j.caseName && j.caseName.toLowerCase().includes(q)))
    ) {
      matched.set(j.id, j);
    }
  }

  // 3. If nothing found, check primary org
  if (matched.size === 0) {
    const primaryOrgId = 'a9cadcb9-f8f0-4fba-80ee-25827520d4ce';
    try {
      const orgJobs = await fetchAllPages(`/jobs?orgId=${primaryOrgId}`);
      for (const j of orgJobs) {
        if (
          j?.id &&
          ((j.name && j.name.toLowerCase().includes(q)) ||
            (j.clientJobRef && j.clientJobRef.toLowerCase().includes(q)) ||
            (j.caseName && j.caseName.toLowerCase().includes(q)))
        ) {
          matched.set(j.id, j);
        }
      }
    } catch (_) {}
  }

  return Array.from(matched.values());
}

async function handleCleanJobs(query) {
  console.log(`🔍 Searching for jobs matching: "${query}"...`);
  const matched = await searchJobsAcrossOrgs(query);

  if (!matched.length) {
    console.log(`🔍 No jobs found matching filter: "${query}"`);
    return;
  }

  console.log(`\nFound ${matched.length} matching job(s):`);
  matched.forEach((j, i) =>
    console.log(`  [${i + 1}] ${j.name} (ID: ${j.id}, Case: ${j.caseName || 'N/A'}, Org: ${j.orgName || 'Default'})`)
  );

  console.log(`\nDeleting ${matched.length} job(s)...`);
  for (const job of matched) {
    await deleteJob(job.id, job.name);
  }
  console.log(`\n🎉 Job cleanup complete.`);
}

async function handleCleanCases(query) {
  console.log(`🔍 Searching for cases matching: "${query}"...`);
  const matched = await searchCasesAcrossOrgs(query);

  if (!matched.length) {
    console.log(`🔍 No cases found matching filter: "${query}"`);
    return;
  }

  console.log(`\nFound ${matched.length} matching case(s):`);
  matched.forEach((c, i) =>
    console.log(`  [${i + 1}] ${c.name} (ID: ${c.id}, Jobs: ${c.jobCount ?? 0}, Org: ${c.orgName || 'Default'})`)
  );

  console.log(`\nDeleting ${matched.length} case(s)...`);
  for (const c of matched) {
    await deleteCase(c.id, c.name);
  }
  console.log(`\n🎉 Case cleanup complete.`);
}

async function handleCleanUsers(query) {
  const users = await fetchAllPages('/users');
  const matched = users.filter((u) => {
    const q = query.toLowerCase();
    return (
      (u.email && u.email.toLowerCase().includes(q)) ||
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      u.id.toLowerCase() === q
    );
  });

  // Filter out system platform admin to prevent accidental lockout
  const safeUsers = matched.filter(
    (u) => u.email.toLowerCase() !== PLATFORM_EMAIL.toLowerCase()
  );

  if (!safeUsers.length) {
    console.log(`🔍 No users found matching filter: "${query}"`);
    return;
  }

  console.log(`\nFound ${safeUsers.length} matching user(s):`);
  safeUsers.forEach((u, i) => console.log(`  [${i + 1}] ${u.displayName || 'No Name'} (${u.email}) [ID: ${u.id}]`));

  console.log(`\nDeleting ${safeUsers.length} user(s)...`);
  for (const u of safeUsers) {
    await deleteUser(u.id, u.email);
  }
  console.log(`\n🎉 User cleanup complete.`);
}

async function handleCleanInstances(query) {
  const instances = await fetchAllPages('/products/product-instances');
  const matched = instances.filter((inst) => {
    const q = query.toLowerCase();
    return (
      (inst.productName && inst.productName.toLowerCase().includes(q)) ||
      (inst.orgName && inst.orgName.toLowerCase().includes(q)) ||
      inst.id.toLowerCase() === q
    );
  });

  if (!matched.length) {
    console.log(`🔍 No product instances found matching filter: "${query}"`);
    return;
  }

  console.log(`\nFound ${matched.length} matching product instance(s):`);
  matched.forEach((inst, i) =>
    console.log(`  [${i + 1}] ${inst.productName} in "${inst.orgName || 'N/A'}" (ID: ${inst.id}, Status: ${inst.status})`)
  );

  console.log(`\nCleaning ${matched.length} product instance(s)...`);
  for (const inst of matched) {
    await cleanupInstance(inst.id, `${inst.productName} (${inst.orgName})`);
  }
  console.log(`\n🎉 Product instance cleanup complete.`);
}

async function handleCleanOrgs(query) {
  const orgs = await fetchAllPages('/orgs');
  const matched = orgs.filter((o) => {
    const q = query.toLowerCase();
    return (
      (o.name && o.name.toLowerCase().includes(q)) ||
      (o.contactEmail && o.contactEmail.toLowerCase().includes(q)) ||
      o.id.toLowerCase() === q
    );
  });

  if (!matched.length) {
    console.log(`🔍 No organizations found matching filter: "${query}"`);
    return;
  }

  console.log(`\nFound ${matched.length} matching organization(s):`);
  matched.forEach((o, i) => console.log(`  [${i + 1}] ${o.name} (ID: ${o.id}, Users: ${o.totalUsers ?? 0})`));

  console.log(`\nDeleting ${matched.length} organization(s) with cascade...`);
  for (const o of matched) {
    await deleteOrg(o.id, o.name);
  }
  console.log(`\n🎉 Organization cleanup complete.`);
}

async function handleCleanAllTestData() {
  console.log(`\n======================================================`);
  console.log(`   AUTOMATED TEST DATA PURGE (Util / Auto-generated)  `);
  console.log(`======================================================\n`);

  // 1. Purge Test Jobs
  console.log(`[Phase 1] Purging test jobs (matching "Job_Util_")...`);
  await handleCleanJobs('Job_Util_');

  // 2. Purge Test Cases
  console.log(`\n[Phase 2] Purging test cases (matching "Case_Util_")...`);
  await handleCleanCases('Case_Util_');

  // 3. Purge Test Users & Invites
  console.log(`\n[Phase 3] Purging test users (utiladmin_*, utilguest_*)...`);
  await handleCleanUsers('utiladmin_');
  await handleCleanUsers('utilguest_');

  // 4. Purge Test Organizations
  console.log(`\n[Phase 4] Purging test organizations (matching "Util Org")...`);
  await handleCleanOrgs('Util Org');

  console.log(`\n======================================================`);
  console.log(`   ✨ ALL TEST DATA PURGE FINISHED SUCCESSFULLY       `);
  console.log(`======================================================\n`);
}

// =============================================================================
// CLI ARGUMENT PARSER & INTERACTIVE MENU
// =============================================================================

function parseCommandArguments() {
  // Check npm lifecycle event e.g. npm run clear:org:c1
  const npmLifecycle = process.env.npm_lifecycle_event || '';
  const argv = process.argv.slice(2);

  let fullString = argv.join(' ').trim();

  // If npm lifecycle has clear:entity:query
  if (!fullString && npmLifecycle.startsWith('clear:')) {
    const parts = npmLifecycle.split(':'); // ['clear', 'org', 'c1']
    if (parts.length >= 3) {
      return { entity: parts[1], query: parts.slice(2).join(':') };
    } else if (parts.length === 2) {
      return { entity: parts[1], query: '' };
    }
  }

  // Handle forms like: "org:c1", "clear:org:c1", "org c1"
  if (fullString.startsWith('clear:')) {
    fullString = fullString.replace(/^clear:/, '');
  }

  if (fullString.includes(':')) {
    const [ent, ...rest] = fullString.split(':');
    return { entity: ent.trim().toLowerCase(), query: rest.join(':').trim() };
  }

  const [entity, ...queryParts] = argv;
  return {
    entity: (entity || '').toLowerCase().trim(),
    query: queryParts.join(' ').trim(),
  };
}

async function interactiveMenu() {
  console.log('========================================================');
  console.log('       STENOGRAPH ONE (S1) DATA CLEANUP UTILITY         ');
  console.log('========================================================');
  console.log('Select entity type to clean / delete:\n');
  console.log('  [1] Organization(s)     - npm run clear:org <name>');
  console.log('  [2] User(s)             - npm run clear:user <email/name>');
  console.log('  [3] Case(s)             - npm run clear:case <name>');
  console.log('  [4] Job(s)              - npm run clear:job <name>');
  console.log('  [5] Product Instance(s) - npm run clear:instance <name>');
  console.log('  [6] All Test Data Purge (Util Org*, Case_Util_*, etc.)');
  console.log('\n  [0] Exit');
  console.log('========================================================');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

  const ask = (q) => new Promise((resolve) => rl.question(q, resolve));

  const choice = (await ask('\nEnter option number (0-6): ')).trim();

  if (choice === '0') {
    console.log('Exited.');
    rl.close();
    process.exit(0);
  }

  if (choice === '6') {
    rl.close();
    await handleCleanAllTestData();
    process.exit(0);
  }

  const entityMap = {
    '1': 'org',
    '2': 'user',
    '3': 'case',
    '4': 'job',
    '5': 'instance',
  };

  const entity = entityMap[choice];
  if (!entity) {
    console.log('Invalid option.');
    rl.close();
    process.exit(1);
  }

  const query = (await ask(`Enter filter / search name for ${entity}: `)).trim();
  rl.close();

  if (!query) {
    console.log('No search term provided. Exiting.');
    process.exit(0);
  }

  await dispatch(entity, query);
}

async function dispatch(entity, query) {
  switch (entity) {
    case 'org':
    case 'orgs':
    case 'organization':
    case 'organizations':
      await handleCleanOrgs(query);
      break;

    case 'user':
    case 'users':
      await handleCleanUsers(query);
      break;

    case 'case':
    case 'cases':
      await handleCleanCases(query);
      break;

    case 'job':
    case 'jobs':
      await handleCleanJobs(query);
      break;

    case 'instance':
    case 'instances':
    case 'product-instance':
    case 'product-instances':
      await handleCleanInstances(query);
      break;

    case 'test-data':
    case 'testdata':
    case 'all':
      await handleCleanAllTestData();
      break;

    default:
      console.error(`Unknown entity "${entity}". Supported entities: org, user, case, job, instance, test-data`);
      process.exit(1);
  }
}

// =============================================================================
// MAIN ENTRY
// =============================================================================

async function main() {
  const { entity, query } = parseCommandArguments();

  if (!entity) {
    await interactiveMenu();
    return;
  }

  if (entity === 'test-data' || entity === 'testdata') {
    await handleCleanAllTestData();
    return;
  }

  if (!query) {
    console.error(`Error: Missing query parameter for entity "${entity}".`);
    console.error(`Example: node scripts/cleanup.js ${entity} c1`);
    console.error(`         npm run clear:${entity} -- c1`);
    process.exit(1);
  }

  await dispatch(entity, query);
}

main().catch((err) => {
  console.error('\n❌ Fatal cleanup error:', err.message || err);
  process.exitCode = 1;
});
