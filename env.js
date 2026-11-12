const path = require('path');
const dotenv = require('dotenv');

const envPath = path.resolve(__dirname, '.env');
const result = dotenv.config({ path: envPath, override: true });

if (result.error) {
  throw new Error(`Unable to load required environment file: ${envPath}`, { cause: result.error });
}

const baseURL = (result.parsed.BASE_URL || '').trim();
if (!baseURL) {
  throw new Error(`BASE_URL must be set in ${envPath}.`);
}

let targetURL;
try {
  targetURL = new URL(baseURL);
} catch (error) {
  throw new Error(`BASE_URL in ${envPath} must be a valid absolute URL.`, { cause: error });
}

if (!['http:', 'https:'].includes(targetURL.protocol)) {
  throw new Error(`BASE_URL in ${envPath} must use http or https.`);
}

const isLocalTarget = ['localhost', '127.0.0.1'].includes(targetURL.hostname.toLowerCase());
if (!isLocalTarget && result.parsed.ALLOW_REMOTE_TESTS !== 'true') {
  throw new Error(
    `Refusing to run against non-local BASE_URL (${baseURL}). ` +
    `Set ALLOW_REMOTE_TESTS=true in ${envPath} only when remote execution is explicitly intended.`
  );
}

module.exports = { baseURL };
