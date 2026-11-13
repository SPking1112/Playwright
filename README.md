# Playwright Test Project

End-to-end tests for the Stenograph One web application, implemented with Playwright.

## Requirements

- Node.js 20 or newer. The locked Playwright test package requires Node.js 20+.
- npm 9 or newer to work with this repository's version 3 lockfile.
- Access to a running application under test and the appropriate test accounts.
- External media, transcript, and exhibit files configured through `TEST_ASSETS_DIR`.

Check installed versions with:

```powershell
node --version
npm --version
```

## Clone and install

```powershell
git clone https://github.com/SPking1112/Playwright.git
Set-Location Playwright
npm install
npx playwright install
```

`npx playwright install` installs the browser binaries used by the tests.

## Configure the environment

Create a local `.env` from the checked-in template:

```powershell
Copy-Item .env.example .env
```

Edit `.env` and provide values for:

- `BASE_URL`: the absolute HTTP(S) URL of the application under test. `env.js` requires this value. Remote targets are blocked unless `ALLOW_REMOTE_TESTS=true` is explicitly set.
- `ORGADMIN_EMAIL` and `ORGADMIN_PASSWORD`: required by Organization Admin tests.
- `PLATFORM_EMAIL` and `PLATFORM_PASSWORD`: required by Platform Admin tests.
- `MANAGER_EMAIL` and `MANAGER_PASSWORD`, `BILLING_EMAIL` and `BILLING_PASSWORD`, `REPORTER_EMAIL` and `REPORTER_PASSWORD`, `MEMBER_EMAIL` and `MEMBER_PASSWORD`: required by suites that test those roles.
- `TEST_ASSETS_DIR`: absolute path to the external asset root described below.

The `.env.example` leaves `BASE_URL` and credentials blank. Set `BASE_URL` to the intended local or approved test target before running. Use only approved test accounts and a test environment; several suites create or modify application data. Optional navigation smoke-test settings are `NAVIGATION_LABEL` and `NAVIGATION_PATH`.

## External test assets

Binary assets are not stored in this repository or under `fixtures/`. Keep the asset root outside the repository and configure `TEST_ASSETS_DIR` to point to it. On Windows, for example, set the value in `.env` to the absolute path where you keep these files:

```env
TEST_ASSETS_DIR=D:\path\to\external-assets
```

The external directory must have this structure:

```text
<TEST_ASSETS_DIR>\
├── media\ or medias\
├── transcripts\ or transcript\
└── exhibits\
```

Prepare the files in the matching folders:

- `transcripts\` or `transcript\`: supported transcript files such as `.txt`, `.mdb`, `.ytg`, or `.xmef`. `Sullivan.txt` is preferred when present.
- `media\` or `medias\`: supported media files such as `.mp4`, `.mov`, `.mpg`, `.mpeg`, `.wav`, `.mp3`, `.wma`, `.m4a`, or `.sgmca`. `Sullivan1.mp4` is preferred when present; `sample_video.mp4` is an optional faster alternative for the Utilities flow.
- `exhibits\`: supported exhibit files such as `.pdf`, `.jpg`, `.jpeg`, `.png`, `.tif`, or `.tiff`. The artifact-upload suite requires at least two; the Utilities publish flow requires at least one.

Matching-file tests require a transcript and media file with the same base filename. The helper prefers a pair matching `DYNAMIC_PAIR_NAME` or the current job name when that pair exists; otherwise it selects an available matching pair. The existing `eberline.txt` and `eberline.mpg` names are the documented default pair.

The asset helper fails with a clear error if `TEST_ASSETS_DIR`, one of its three directories, or a required asset is missing. It does not search Downloads, repository fixture folders, or generate/stage asset copies.
The Utilities end-to-end workflow validates its required assets before logging in or creating application data.

Never commit media, audio, transcript, or exhibit files to Git. Keep them in an external location and share or provision them separately. `fixtures/data/` contains only test-data definitions and helper code; it is not an asset directory.

## Application-under-test prerequisite

Start the application before running browser tests. For the local Vite target documented in [LOCAL_TARGETS.md](./LOCAL_TARGETS.md), start its frontend in a separate terminal:

```powershell
Set-Location 'D:\path\to\Stenograph One UI'
npm run dev
```

That target is documented at `http://127.0.0.1:8080`. Its frontend proxies authentication and API requests to configured backend services, so login tests also need a local/stub backend or an explicitly approved test backend. Set `BASE_URL` to the chosen target in `.env`.

GitHub Pages can host a static web target, but it does not execute Playwright tests. Run the tests on a machine with Node.js and the Playwright browsers installed, or in a CI runner.

## List and run tests

List tests without executing them:

```powershell
npx playwright test --list
```

Run all test files, or a single suite:

```powershell
npx playwright test
npx playwright test tests/create-case-job-sync.spec.js
```

Run all tests in headed mode, or run one suite headed:

```powershell
npx playwright test --headed
npx playwright test tests/create-case-job-sync.spec.js --headed
```

`npm test` runs only the role-navigation POT suite; use `npx playwright test` (or `npm run test:all`) for all configured tests.
The suites share test accounts and application data, so Playwright is configured to run one worker at a time.

POT screenshots are grouped by test-suite filename, then role, to avoid different suites overwriting one another. For example, role-navigation screenshots are saved under `pot/role-navigation-pot/admin/`, while Utilities workflow screenshots are saved under `pot/utilities-flow/utilities/`.

All suites also capture detected negative states automatically. HTTP 4xx/5xx responses from page, fetch, and XHR requests, along with visible page messages indicating a missing page or denied access (including “Contact your administrator to request access”), are saved under `pot/<suite>/negative/` and reported in the test output. Ordinary static asset failures are ignored.

### Run a named suite

The following npm scripts run commonly used suites:

| Suite | Command |
|---|---|
| Check the first Case/Job, Sync Generator, and Publish (headed) | `npm run test:status` |
| Case and Job end-to-end flow (headed) | `npm run test:e2e` |
| Create a Case (headed) | `npm run test:case` |
| Create a Job (headed) | `npm run test:job` |
| Create or invite a user (headed) | `npm run test:create-user` or `npm run test:invite-user` |
| Upload artifacts (headed) | `npm run test:artifacts` |
| Sync Generator upload (headed) | `npm run test:syncgen` |
| Utilities workflow (headed) | `npm run test:utilities` |
| Dynamic navigation (headless) | `npm run test:dynamic` |
| Role navigation/POT (headless) | `npm run test:pot` |

To run a specific suite in the interactive runner, start Playwright UI and select the suite:

```powershell
npm run test:ui
```

The UI opens without running tests automatically. Select a test and click Run. Tests still need the configured application, credentials, and external assets they require.

Generate and open the HTML report:

```powershell
npx playwright test --reporter=html
npx playwright show-report
```

## Project layout

```text
fixtures/
└── data/
    ├── case-job-data.json   # Form-data definitions and expected asset filenames
    └── index.js             # Test-data and external-asset path helpers
pages/                       # Page Object Model classes
scripts/                     # Helper CLI tools
tests/                       # Playwright test suites
.env.example                 # Environment-variable template
playwright.config.js         # Playwright configuration
```
