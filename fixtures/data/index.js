const path = require('path');
const fs = require('fs');
const testData = require('./case-job-data.json');
const TRANSCRIPT_EXTENSIONS = ['.txt', '.mdb', '.ytg', '.xmef'];
const MEDIA_EXTENSIONS = ['.mp4', '.mov', '.mpg', '.mpeg', '.wav', '.mp3', '.wma', '.m4a', '.sgmca'];
const EXHIBIT_EXTENSIONS = ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'];

function getRandomLetters(len = 6) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
  let res = '';
  for (let i = 0; i < len; i++) {
    res += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return res;
}

/**
 * Returns case form data with a unique timestamped name
 * @param {Object} overrides - optional custom field overrides
 */
function getCaseFormData(overrides = {}) {
  const timestamp = Date.now().toString().slice(-4);
  return {
    ...testData.case,
    name: `${testData.case.namePrefix}_${timestamp}`,
    ...overrides,
  };
}

/**
 * Returns job form data with a unique timestamped name and job reference
 * @param {Object} overrides - optional custom field overrides
 */
function getJobFormData(overrides = {}) {
  const timestamp = Date.now().toString().slice(-4);
  return {
    ...testData.job,
    name: `${testData.job.namePrefix}_${timestamp}`,
    clientJobRef: `${testData.job.clientJobRefPrefix}-${timestamp}`,
    ...overrides,
  };
}

/**
 * Returns user creation form data with unique email and name (display name strictly letters)
 * @param {Object} overrides - optional custom field overrides
 */
function getUserFormData(overrides = {}) {
  const letters = getRandomLetters(5);
  const timestamp = Date.now().toString().slice(-4);
  const u = testData.user || {};
  return {
    displayName: `${u.displayNamePrefix || 'TestUser'} ${letters}`,
    email: `${u.emailPrefix || 'testuser'}_${timestamp}@${u.emailDomain || 'example.com'}`,
    password: u.password || 'Welcome@123',
    role: u.role || 'Reporter',
    ...overrides,
  };
}

/**
 * Returns invite form data with unique email and name (display name strictly letters)
 * @param {Object} overrides - optional custom field overrides
 */
function getInviteFormData(overrides = {}) {
  const letters = getRandomLetters(5);
  const timestamp = Date.now().toString().slice(-4);
  const inv = testData.invite || {};
  return {
    displayName: `${inv.displayNamePrefix || 'InviteUser'} ${letters}`,
    email: `${inv.emailPrefix || 'inviteuser'}_${timestamp}@${inv.emailDomain || 'example.com'}`,
    role: inv.role || 'Reporter',
    ...overrides,
  };
}

function getTestAssetPaths() {
  const configuredDir = (process.env.TEST_ASSETS_DIR || '').trim();
  if (!configuredDir) {
    throw new Error('TEST_ASSETS_DIR must be set in .env to an external asset directory.');
  }

  const root = path.resolve(configuredDir);
  const projectRoot = path.resolve(__dirname, '..', '..');
  const relativePath = path.relative(projectRoot, root);
  const isInsideProject = relativePath === '' ||
    (relativePath !== '..' &&
      !relativePath.startsWith(`..${path.sep}`) &&
      !path.isAbsolute(relativePath));
  if (isInsideProject) {
    throw new Error(`TEST_ASSETS_DIR must point outside the repository: ${root}`);
  }

  const directories = {
    root,
    media: path.join(root, 'media'),
    transcripts: path.join(root, 'transcripts'),
    exhibits: path.join(root, 'exhibits'),
  };

  for (const [name, directory] of Object.entries(directories).slice(1)) {
    if (!fs.existsSync(directory)) {
      throw new Error(`Missing external ${name} asset directory: ${directory}`);
    }
    if (!fs.statSync(directory).isDirectory()) {
      throw new Error(`External ${name} asset path is not a directory: ${directory}`);
    }
  }

  return directories;
}

function listFiles(dirPath, allowedExtensions = []) {
  return fs.readdirSync(dirPath).filter((file) => {
    const fullPath = path.join(dirPath, file);
    if (!fs.statSync(fullPath).isFile()) return false;
    return allowedExtensions.length === 0 ||
      allowedExtensions.includes(path.extname(file).toLowerCase());
  });
}

function findFirstFile(dirPath, allowedExtensions = [], preferredName = null) {
  const files = listFiles(dirPath, allowedExtensions);
  if (preferredName) {
    const preferred = path.basename(preferredName).toLowerCase();
    const match = files.find((file) => file.toLowerCase() === preferred);
    if (match) return path.join(dirPath, match);
  }
  return files.length > 0 ? path.join(dirPath, files[0]) : null;
}

function findAllFiles(dirPath, allowedExtensions = []) {
  return listFiles(dirPath, allowedExtensions).map((file) => path.join(dirPath, file));
}

function getFixtureFilePaths({ requiredExhibits = 0 } = {}) {
  if (!Number.isInteger(requiredExhibits) || requiredExhibits < 0) {
    throw new TypeError('requiredExhibits must be a non-negative integer.');
  }

  const directories = getTestAssetPaths();
  const expectedFiles = testData.files || {};
  const exhibitFiles = findAllFiles(directories.exhibits, EXHIBIT_EXTENSIONS);
  const preferredExhibits = (expectedFiles.exhibits || []).map((file) => path.basename(file).toLowerCase());
  const exhibits = [
    ...preferredExhibits
      .map((name) => exhibitFiles.find((file) => path.basename(file).toLowerCase() === name))
      .filter(Boolean),
    ...exhibitFiles.filter((file) => !preferredExhibits.includes(path.basename(file).toLowerCase())),
  ];

  if (exhibits.length < requiredExhibits) {
    throw new Error(
      `Expected at least ${requiredExhibits} exhibit file(s) in ${directories.exhibits}, ` +
      `but found ${exhibits.length}.`,
    );
  }

  const transcript = findFirstFile(
    directories.transcripts,
    TRANSCRIPT_EXTENSIONS,
    expectedFiles.transcript || 'Sullivan.txt',
  );
  if (!transcript) {
    throw new Error(
      `No transcript asset found in ${directories.transcripts}. ` +
      `Expected a file with one of these extensions: ${TRANSCRIPT_EXTENSIONS.join(', ')}.`,
    );
  }

  const media = findFirstFile(
    directories.media,
    MEDIA_EXTENSIONS,
    expectedFiles.media || 'Sullivan1.mp4',
  );
  if (!media) {
    throw new Error(
      `No media asset found in ${directories.media}. ` +
      `Expected a file with one of these extensions: ${MEDIA_EXTENSIONS.join(', ')}.`,
    );
  }

  const sampleVideoPath = path.join(directories.media, 'sample_video.mp4');
  const sampleVideo = fs.existsSync(sampleVideoPath) && fs.statSync(sampleVideoPath).isFile()
    ? sampleVideoPath
    : null;

  return { transcript, media, exhibits, sampleVideo };
}

function getMatchingFixturePair(options = {}) {
  const directories = getTestAssetPaths();
  const requestedName = typeof options === 'string'
    ? options
    : (options.baseName || options.dynamicName || process.env.DYNAMIC_PAIR_NAME);
  const requestedStem = requestedName
    ? String(requestedName).replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase()
    : null;
  const mediaFiles = listFiles(directories.media, MEDIA_EXTENSIONS);
  const mediaByStem = new Map(
    mediaFiles.map((file) => [path.parse(file).name.toLowerCase(), path.join(directories.media, file)]),
  );

  const matchingPairs = listFiles(directories.transcripts, TRANSCRIPT_EXTENSIONS)
    .map((file) => {
      const baseName = path.parse(file).name.toLowerCase();
      const mediaPath = mediaByStem.get(baseName);
      return mediaPath
        ? {
          transcript: path.join(directories.transcripts, file),
          media: mediaPath,
          baseName,
          isDynamic: false,
        }
        : null;
    })
    .filter(Boolean);

  if (requestedStem) {
    const requestedPair = matchingPairs.find((pair) => pair.baseName === requestedStem);
    if (requestedPair) return { ...requestedPair, isDynamic: true };
  }
  if (matchingPairs.length > 0) return matchingPairs[0];

  const defaultTranscript = path.join(directories.transcripts, 'eberline.txt');
  const defaultMedia = path.join(directories.media, 'eberline.mpg');
  if (
    fs.existsSync(defaultTranscript) &&
    fs.statSync(defaultTranscript).isFile() &&
    fs.existsSync(defaultMedia) &&
    fs.statSync(defaultMedia).isFile()
  ) {
    return {
      transcript: defaultTranscript,
      media: defaultMedia,
      baseName: 'eberline',
      isDynamic: false,
    };
  }

  throw new Error(
    `No matching transcript/media pair found in ${directories.transcripts} and ${directories.media}. ` +
    'Provide transcript and media files with the same base filename (for example, eberline.txt and eberline.mpg).',
  );
}

function getDownloadTranscript(preferredName = null, allowedExtensions = TRANSCRIPT_EXTENSIONS) {
  const transcriptsDir = getTestAssetPaths().transcripts;
  if (preferredName) {
    const candidate = path.join(transcriptsDir, path.basename(preferredName));
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate;
  }
  return findFirstFile(transcriptsDir, allowedExtensions);
}

function getAllDownloadTranscripts(allowedExtensions = TRANSCRIPT_EXTENSIONS) {
  return findAllFiles(getTestAssetPaths().transcripts, allowedExtensions);
}

function getDynamicTranscripts(options = {}) {
  const transcriptsDir = getTestAssetPaths().transcripts;
  const allowedExtensions = options.extensions || TRANSCRIPT_EXTENSIONS;
  const limit = options.limit || 4;
  const files = findAllFiles(transcriptsDir, allowedExtensions)
    .filter((file) => fs.statSync(file).size > 0);
  const preferred = [];
  const remaining = [];
  const seenExtensions = new Set();

  for (const file of files) {
    const extension = path.extname(file).toLowerCase();
    if (seenExtensions.has(extension)) {
      remaining.push(file);
    } else {
      seenExtensions.add(extension);
      preferred.push(file);
    }
  }

  return [...preferred, ...remaining].slice(0, limit);
}

module.exports = {
  rawTestData: testData,
  getCaseFormData,
  getJobFormData,
  getUserFormData,
  getInviteFormData,
  getTestAssetPaths,
  getFixtureFilePaths,
  getMatchingFixturePair,
  getDownloadTranscript,
  getAllDownloadTranscripts,
  getDynamicTranscripts,
};
