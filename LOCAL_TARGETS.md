# Local target findings and test plan

## UI target

The Stenograph One UI source project is a Vite React web application. Start its dev server from that project's directory; the expected local URL is:

```text
http://127.0.0.1:8080
```

The standalone Playwright project does not import the UI source. It connects to the running dev server through `BASE_URL`.

Start the UI first from the Stenograph One UI source directory:

```powershell
cd 'D:\path\to\Stenograph One UI'
npm run dev
```

Set `BASE_URL` in the Playwright project's `.env` file to the target above, then in another terminal run:

```powershell
cd 'D:\path\to\Playwright'
npm test
```

Every test and helper uses the target configured in `.env`; there is no automatic URL fallback. The UI's local frontend still proxies authentication and other API calls to configured backend services. Therefore login tests require a local/stub backend or an explicitly approved test backend.

## Offline player target

`C:\Users\Admin\Downloads\dvd player_Windows (1)\dvd player` is a packaged Electron job bundle. It contains:

- `Offline Sync Player.exe` (launcher)
- `runtime\Offline Sync Player.exe` (Electron runtime)
- `runtime\resources\app.asar` (packaged application)
- `manifest.json`, media, transcript, and exhibit data

It is not a second HTTP target and cannot be tested with `page.goto()` or `BASE_URL`. It needs an Electron Playwright harness using `require('playwright')._electron.launch(...)`, or tests against the source Electron app in `D:\Work\Stenograph%20One%20UI\electron-player`.

Recommended initial offline smoke cases:

1. Launch the packaged player with the job directory as its working directory.
2. Assert the main window opens and the case/job name from `manifest.json` is visible.
3. Assert the transcript panel and video element are present.
4. Click a transcript line with a timestamp and verify the video current time changes.
5. Open the exhibits panel and verify the two manifest exhibits are listed.

These cases require stable selectors (prefer `data-testid`) and an explicit executable path such as:

```text
C:\Users\Admin\Downloads\dvd player_Windows (1)\dvd player\Offline Sync Player.exe
```

## Meaning of “POT”

No project file defines `POT`. In this testing context it most likely means **Proof of Testing**: a Playwright HTML report plus screenshots/traces and a short pass/fail summary. It could also mean “PowerPoint template” in this product because `.pot` is a PowerPoint template extension; confirm before producing that artifact.

## Current blockers

- The existing UI Playwright config imports `lovable-agent-playwright-config`, which is not declared in the UI package and is not the config used by `D:\Work\playwright`.
- Playwright tests and standalone scripts use `ORGADMIN_EMAIL`/`ORGADMIN_PASSWORD` for Organization Admin credentials.
- The downloaded offline bundle has no source package or test hooks; use the UI repo's `electron-player` source for maintainable Electron tests, or add selectors to the packaged app source and rebuild it.
- No tests were executed during this inspection, and no credentials were submitted.
