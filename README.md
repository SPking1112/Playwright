# Stenograph One UI — Playwright Test Automation

Automated end-to-end testing suite for the **Stenograph One UI** web application, powered by [Playwright](https://playwright.dev/).

---

## ⚡ Quick Start in 3 Steps

### Step 1: Configure and Start the Target
All test navigation and helper scripts use `BASE_URL` from this project's `.env`. There is no automatic URL fallback. For local testing, start the frontend:

```powershell
# In terminal 1 (Frontend directory)
cd 'd:\Work\Frontend\Stenograph%20One%20UI'
npm run dev
```
> When the local frontend is running, it should be accessible at `http://localhost:8080`.

---

### Step 2: Verify Your `.env` Credentials
In this folder (`d:\Work\playwright`), open `.env` and verify your credentials and base URL:

```env
BASE_URL=http://localhost:8080

# Organization Admin credentials (used for Case/Job creation and uploads)
ORGADMIN_EMAIL=<set-in-.env>
ORGADMIN_PASSWORD=<set-in-.env>

# Platform Admin credentials (used for system-level discovery)
PLATFORM_EMAIL=<set-in-.env>
PLATFORM_PASSWORD=<set-in-.env>
```
Playwright and the standalone helper scripts read `BASE_URL` from this project's `.env` file and require it to be set. If the configured target is remote, set `ALLOW_REMOTE_TESTS=true` in `.env` to explicitly allow the run. Tests can create or modify data in the configured environment.

---

### Step 3: Run the Tests
In your test directory (`d:\Work\playwright`), run any test command:

```powershell
# Run dynamic page discovery (automatically crawls and verifies all pages)
npm run test:dynamic

# Run the End-to-End Case & Job creation workflow (with browser window visible)
npm run test:e2e

# Run the full Proof of Testing (POT) role screenshot suite
npm test
```

---

## 📁 Stored Test Data (`fixtures/data/`)

All form input data for creating **Cases** and **Jobs** is stored in:
👉 **[`fixtures/data/case-job-data.json`](file:///d:/Work/playwright/fixtures/data/case-job-data.json)**

You can edit this JSON file whenever you want to change test values:

```json
{
  "case": {
    "name": "Stenograph Test Case",
    "namePrefix": "Case_PW",
    "description": "Automated E2E test case for Stenograph One UI",
    "product": "Stenograph One",
    "matterNumber": "MATTER-2026-001"
  },
  "job": {
    "name": "Deposition Proceeding",
    "namePrefix": "Job_PW",
    "category": "Deposition",
    "clientJobRef": "PW-REF-1001",
    "clientJobRefPrefix": "PW-REF",
    "witnessName": "John Sullivan",
    "notes": "Automated transcript alignment and sync generation test"
  },
  "files": {
    "transcript": "fixtures/transcripts/Sullivan.txt",
    "media": "fixtures/media/Sullivan1.mp4"
  }
}
```

### How the Test Uses This Data:
- **Unique Name Generation**: To avoid duplicate name errors when tests are re-run, the helper `fixtures/data/index.js` automatically appends a unique timestamp suffix (e.g. `Case_PW_4821` and `Job_PW_4821`).
- **File Attachments**: The test automatically pulls the transcript and media files directly from the `fixtures/` directory.

---

## 🧪 Test Suites Overview

### 1. Dynamic Page Discovery (`npm run test:dynamic`)
- **File**: `tests/dynamic-navigation.spec.js`
- **What it does**: Logs in dynamically, inspects the sidebar navigation for that user's role without hardcoding any URLs or labels, navigates to every available page, verifies that the route and headers load, and prints a summary table.

### 2. End-to-End Case & Job Creation (`npm run test:e2e`)
- **File**: `tests/create-case-job-sync.spec.js`
- **What it does**:
  1. Signs in as Organization Admin.
  2. Navigates to **Cases** and fills the **Create Case** dialog using test data.
  3. Opens the newly created Case and clicks **Add Job**.
  4. Fills the **Create Job** dialog (Category, Client Job Ref) using test data.
  5. Navigates into the Job Details page and clicks **Sync Generator**.
  6. Uploads `fixtures/transcripts/Sullivan.txt` and `fixtures/media/Sullivan1.mp4`.
  7. Verifies transcript alignment and initiates sync processing.

### 3. Role Proof of Testing (POT) Screenshots (`npm test`)
- **File**: `tests/role-navigation-pot.spec.js`
- **What it does**: Iterates through each user role in `.env` (Platform Admin, Organization Admin, Manager, Billing, Reporter, Member), discovers all accessible sidebar menus, and saves high-resolution screenshot evidence into `pot/<role>/`.

---

## 📜 All Available Commands

### ⚡ Quick Modular Execution

| Task | Command | Description | Browser Visible? |
|------|---------|-------------|:----------------:|
| **Utilities Lifecycle** | `npm run test:utilites` | Platform Admin -> Org -> User & Invite -> Products (Sync/Capture/Publish) -> Assign User -> Handover -> Sync -> Publish -> Logout | **Yes** |
| **Whole S1 Suite** | `npm run s1` or `npm run test:s1:all` | Runs the complete end-to-end flow (Case, Job, Uploads, Alignment) | **Yes** |
| **Interactive Menu** | `npm run s1:menu` or `npm run test:s1:menu` | Interactive CLI menu: pick a task to run | **Yes** |
| **Create Case** | `npm run test:case` | Creates a new Case only and verifies it | **Yes** |
| **Create Job** | `npm run test:job` | Creates a Job inside a Case and verifies it | **Yes** |
| **Invite User** | `npm run test:invite-user` | Invites a user via `/invitations` with role assignment | **Yes** |
| **Create User** | `npm run test:create-user` | Direct user creation via `/users` dialog | **Yes** |
| **Check Status** | `npm run test:status` | Audits statuses of Cases, Jobs, and Sync Queue | **Yes** |
| **Negative: Login Fail** | `npm run login:fail` | Submits wrong credentials, asserts rejection, and captures POT screenshot | **Yes** |

### 🛠️ Additional Specialized Commands

| Command | What it Does | Browser Visible? |
|---------|--------------|:----------------:|
| `npm run test:case-job` | Creates Case, Job & captures Sync Gen setup screenshots | **Yes** |
| `npm run test:artifacts` | Uploads 2 exhibits in Job Details & imports via Show Artifacts in Sync Gen | **Yes** |
| `npm run test:syncgen` | Uploads transcript/media to an existing job | **Yes** |
| `npm run test:dynamic` | Crawls and navigates all pages dynamically | No (headless) |
| `npm run test:dynamic:headed` | Crawls all pages dynamically with visible browser | **Yes** |
| `npm run discover` | Standalone Node script for quick page discovery | No |
| `npm test` | Runs the full POT role navigation suite | No (headless) |
| `npm run test:pot:headed` | Runs POT role suite with visible browser | **Yes** |
| `npm run test:pot:admin` | Runs POT only for Organization Admin | **Yes** |
| `npm run test:ui` | Opens the interactive Playwright UI dashboard | **Yes** |
| `npm run test:report` | Opens the HTML test report in your browser | **Yes** |

---

## 📂 Project Structure

```text
d:\Work\playwright\
├── fixtures/                     # Test data & test files
│   ├── data/
│   │   ├── case-job-data.json    # Centralized form data (Case Name, Job Name, etc.)
│   │   └── index.js              # Helper to load and generate unique test data
│   ├── exhibits/                 # Exhibit test files (2 PDF exhibits)
│   ├── media/                    # Video test files (Sullivan1.mp4)
│   └── transcripts/              # Transcript test files (Sullivan.txt)
├── pages/                        # Page Object Model (POM) classes
│   ├── app.page.js               # Common app actions (navigation, screenshots)
│   └── login.page.js             # Authentication, MFA/Dev OTP auto-handling
├── pot/                          # Proof of Testing screenshots (organized by role)
├── scripts/                      # Helper CLI tools
│   └── run-dynamic-discovery.js  # Standalone crawler
├── tests/                        # Test spec files
│   ├── create-case-job-sync.spec.js # Full E2E Case & Job creation workflow
│   ├── dynamic-navigation.spec.js   # Dynamic discovery & crawl
│   ├── role-navigation-pot.spec.js  # Role navigation & POT capture
│   ├── sync-gen-upload.spec.js      # Sync Gen upload test
│   └── auth-navigation.spec.js      # Single-route smoke test
├── .env                          # Local credentials & BASE_URL
├── package.json                  # NPM scripts & dependencies
└── playwright.config.js          # Playwright configuration
```

---

## ❓ Troubleshooting & Tips

- **Connection Error (`ERR_CONNECTION_REFUSED`)**: Make sure your local Vite frontend is running in another terminal (`cd 'd:\Work\Frontend\Stenograph%20One%20UI'; npm run dev`).
- **MFA / Dev OTP Prompt**: The `LoginPage` class automatically extracts the 6-digit Dev OTP code shown on the screen and types it for you.
- **Large File Upload Wait**: The sample video file (`Sullivan1.mp4`) is ~920MB. The E2E test timeout is set to 7.5 minutes to allow sufficient upload and processing time.
- **Viewing Screenshots**: Screenshots captured during testing are automatically saved in `pot/<role>/` (e.g. `pot/admin/` and `pot/dynamic_platform/`).
