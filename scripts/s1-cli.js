#!/usr/bin/env node

/**
 * Stenograph One (S1) Automation Interactive CLI
 * Usage:
 *   node scripts/s1-cli.js
 *   node scripts/s1-cli.js --flow case
 *   node scripts/s1-cli.js --flow all
 */

const { spawn } = require('child_process');
const readline = require('readline');

const COMMAND_MAP = {
  '1': {
    name: 'Run Whole S1 Suite (Full E2E Flow: Case + Job + Artifacts + Media + Sync)',
    cmd: 'npx playwright test tests/create-case-job-sync.spec.js --headed',
  },
  '2': {
    name: 'Create Case Only',
    cmd: 'npx playwright test tests/create-case.spec.js --headed',
  },
  '3': {
    name: 'Create Job Only',
    cmd: 'npx playwright test tests/create-job.spec.js --headed',
  },
  '4': {
    name: 'Invite User Only',
    cmd: 'npx playwright test tests/invite-user.spec.js --headed',
  },
  '5': {
    name: 'Create User Only',
    cmd: 'npx playwright test tests/create-user.spec.js --headed',
  },
  '6': {
    name: 'Check Status (Cases, Jobs & Sync Queue)',
    cmd: 'npx playwright test tests/check-status.spec.js --headed',
  },
  '7': {
    name: 'Dynamic Route & Menu Discovery',
    cmd: 'npx playwright test tests/dynamic-navigation.spec.js --headed',
  },
  '8': {
    name: 'Proof of Testing (POT) Screenshots Across All Roles',
    cmd: 'npx playwright test tests/role-navigation-pot.spec.js --headed',
  },
  '9': {
    name: 'Negative Test: Login Failure (Wrong Credentials POT)',
    cmd: 'npx playwright test tests/login-fail.spec.js --headed',
  },
  '10': {
    name: 'Utilities E2E Flow (Platform Admin -> Org -> User -> Products -> Sync -> Publish -> Logout)',
    cmd: 'npx playwright test tests/utilities-flow.spec.js --headed',
  },
  '11': {
    name: 'Cleanup / Delete Unwanted Test Data (Interactive Teardown Utility)',
    cmd: 'node scripts/cleanup.js',
  },
  '12': {
    name: 'Generate Authentication Cache (Platform Admin & Org Admin storageState)',
    cmd: 'node scripts/generate-auth-cache.js',
  },
};

function execute(cmdString) {
  console.log(`\n🚀 Executing: ${cmdString}\n`);
  const [exe, ...args] = cmdString.split(' ');
  const child = spawn(exe, args, { stdio: 'inherit', shell: true });
  child.on('close', (code) => {
    console.log(`\nExecution finished with exit code: ${code}`);
    process.exit(code);
  });
}

const arg = process.argv[2];
if (arg) {
  const normalized = arg.replace(/^--/, '').toLowerCase();
  const aliasMap = {
    'all': '1',
    's1': '1',
    'full': '1',
    'case': '2',
    'job': '3',
    'invite': '4',
    'invite-user': '4',
    'user': '5',
    'create-user': '5',
    'status': '6',
    'check-status': '6',
    'discover': '7',
    'pot': '8',
    'fail': '9',
    'login:fail': '9',
    'login-fail': '9',
    'utilites': '10',
    'utilities': '10',
    'test:utilites': '10',
    'test:utilities': '10',
    'clear': '11',
    'cleanup': '11',
    'auth': '12',
    'cache': '12',
    'auth:cache': '12',
  };
  const key = aliasMap[normalized] || normalized;
  if (COMMAND_MAP[key]) {
    console.log(`Selected: ${COMMAND_MAP[key].name}`);
    execute(COMMAND_MAP[key].cmd);
  } else {
    console.error(`Unknown option "${arg}". Run without arguments to view interactive menu.`);
    process.exit(1);
  }
} else {
  console.log('========================================================');
  console.log('       STENOGRAPH ONE (S1) AUTOMATION LAUNCHER         ');
  console.log('========================================================');
  console.log('Select an automation task to run:\n');
  Object.entries(COMMAND_MAP).forEach(([key, val]) => {
    console.log(`  [${key}] ${val.name}`);
  });
  console.log('\n  [0] Exit');
  console.log('========================================================');

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  rl.question('\nEnter option number (1-12): ', (answer) => {
    rl.close();
    const clean = answer.trim();
    if (clean === '0') {
      console.log('Exited.');
      process.exit(0);
    }
    if (COMMAND_MAP[clean]) {
      execute(COMMAND_MAP[clean].cmd);
    } else {
      console.log('Invalid option selected.');
      process.exit(1);
    }
  });
}
