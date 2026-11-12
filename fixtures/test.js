const path = require('path');
const { test: base, expect } = require('@playwright/test');

function slug(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 100) || 'test';
}

const test = base.extend({
  captureNegativeStates: [async ({ page }, use, testInfo) => {
    const suiteName = path.basename(testInfo.file, '.spec.js');
    const outputDir = path.resolve(process.cwd(), 'pot', suiteName, 'negative');
    const captured = new Set();
    let captureQueue = Promise.resolve();

    const capture = (kind, detail) => {
      if (page.isClosed()) return;

      const pagePath = new URL(page.url()).pathname || '/';
      const key = `${kind}:${pagePath}`;
      if (captured.has(key)) return;
      captured.add(key);

      captureQueue = captureQueue.then(async () => {
        if (page.isClosed()) return;

        const fs = require('fs');
        fs.mkdirSync(outputDir, { recursive: true });

        const fileName = `${slug(testInfo.title)}_${slug(kind)}_${slug(pagePath)}.png`;
        const filePath = path.join(outputDir, fileName);
        await page.screenshot({ path: filePath, fullPage: true });
        console.warn(`[Negative state captured] ${kind}: ${detail} -> ${filePath}`);
      });
    };

    const onResponse = (response) => {
      const status = response.status();
      const resourceType = response.request().resourceType();
      const isPageOrApiRequest = resourceType === 'document'
        || resourceType === 'fetch'
        || resourceType === 'xhr'
        || /\/api\//i.test(response.url());

      if (status >= 400 && isPageOrApiRequest) {
        capture(`http-${status}`, response.url());
      }
    };

    await page.exposeBinding('__captureNegativeState', (source, kind, detail) => {
      if (source.frame === page.mainFrame()) {
        capture(kind, detail);
      }
    });

    await page.addInitScript(() => {
      const checks = [
        ['page-not-found', /\b404\b|page\s+not\s+found|\bnot\s+found\b/i],
        [
          'access-denied',
          /access\s+denied|access\s+forbidden|permission\s+denied|insufficient\s+permissions|unauthorized|you\s+do\s+not\s+have\s+(?:access|permission)|you\s+don't\s+have\s+(?:access|permission)|not\s+authorized|not\s+permitted|you\s+are\s+not\s+allowed|contact\s+your\s+administrator\s+to\s+request\s+access/i,
        ],
      ];
      const reported = new Set();

      const scan = () => {
        const text = document.body ? document.body.innerText : '';
        for (const [kind, pattern] of checks) {
          if (!reported.has(kind) && pattern.test(text)) {
            reported.add(kind);
            window.__captureNegativeState(kind, window.location.href);
          }
        }
      };

      const observe = () => {
        if (!document.documentElement) return;
        new MutationObserver(scan).observe(document.documentElement, {
          childList: true,
          subtree: true,
          characterData: true,
        });
        scan();
      };

      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', observe, { once: true });
      } else {
        observe();
      }
    });

    page.on('response', onResponse);
    try {
      await use();
    } finally {
      page.off('response', onResponse);
      await captureQueue;
    }
  }, { auto: true }],
});

module.exports = { test, expect };
