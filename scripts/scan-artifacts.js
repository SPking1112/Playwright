#!/usr/bin/env node

/**
 * Artifacts & Sample Scanner for Stenograph One (S1)
 * Scans C:\Users\Admin\Downloads and fixtures/ to classify files by S1 accepted types,
 * and discovers matching transcript + media pairs sharing identical base names.
 */

const fs = require('fs');
const path = require('path');

// Official S1 Supported File Types (from src/lib/jobArtifacts.ts)
const ACCEPTED_TYPES = {
  EXHIBITS: ['.pdf', '.jpg', '.jpeg', '.png', '.tif', '.tiff'],
  TRANSCRIPTS: ['.txt', '.mdb', '.ytg', '.xmef'],
  VIDEO_MEDIA: ['.mp4', '.mpg', '.mpeg'],
  AUDIO_MEDIA: ['.wav', '.mp3', '.wma', '.m4a', '.sgmca'],
  OTHER_DOCS: ['.doc', '.docx', '.asc', '.xml', '.zip'],
};

function getAllFiles(dirPath, maxDepth = 2, currentDepth = 0) {
  if (!fs.existsSync(dirPath) || currentDepth > maxDepth) return [];
  let results = [];
  try {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        // Skip hidden or system folders
        if (!entry.name.startsWith('.') && !entry.name.startsWith('$') && !entry.name.includes('node_modules')) {
          results = results.concat(getAllFiles(fullPath, maxDepth, currentDepth + 1));
        }
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch (_) {}
  return results;
}

function classifyFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const name = path.basename(filePath).toLowerCase();

  if (name.includes('exhibit') || ACCEPTED_TYPES.EXHIBITS.includes(ext)) {
    return 'Exhibit';
  }
  if (ACCEPTED_TYPES.TRANSCRIPTS.includes(ext)) {
    return 'Transcript';
  }
  if (ACCEPTED_TYPES.VIDEO_MEDIA.includes(ext)) {
    return 'Video';
  }
  if (ACCEPTED_TYPES.AUDIO_MEDIA.includes(ext)) {
    return 'Audio';
  }
  if (ACCEPTED_TYPES.OTHER_DOCS.includes(ext)) {
    return 'Document';
  }
  return 'Other';
}

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

function runScan() {
  const userDownloads = path.join(process.env.USERPROFILE || 'C:\\Users\\Admin', 'Downloads');
  const projectFixtures = path.resolve(__dirname, '..', 'fixtures');

  console.log('================================================================');
  console.log('      STENOGRAPH ONE (S1) - ARTIFACT & SAMPLE FILE SCANNER      ');
  console.log('================================================================\n');

  console.log('Accepted File Extensions by Category in Stenograph One:');
  console.log('----------------------------------------------------------------');
  console.log('1. Exhibits (Job & Sync Gen) : .pdf, .jpg, .jpeg, .png, .tif, .tiff');
  console.log('2. Transcripts (Final & Sync): .txt, .mdb, .ytg, .xmef');
  console.log('3. Video Media               : .mp4, .mpg, .mpeg');
  console.log('4. Audio Media               : .wav, .mp3, .wma, .m4a, .sgmca');
  console.log('5. General Artifacts         : .doc, .docx, .xml, .asc, .zip, etc.');
  console.log('----------------------------------------------------------------\n');

  const scanLocations = [
    { label: 'Downloads Directory', dir: userDownloads },
    { label: 'Project Fixtures', dir: projectFixtures },
  ];

  const allFoundFiles = [];
  scanLocations.forEach(loc => {
    if (fs.existsSync(loc.dir)) {
      const files = getAllFiles(loc.dir, 2);
      console.log(`[Scanning] ${loc.label} (${loc.dir}): Found ${files.length} total files.`);
      files.forEach(f => allFoundFiles.push(f));
    }
  });

  const classified = {
    Exhibit: [],
    Transcript: [],
    Video: [],
    Audio: [],
    Document: [],
  };

  allFoundFiles.forEach(f => {
    const type = classifyFile(f);
    if (classified[type]) {
      try {
        const stats = fs.statSync(f);
        classified[type].push({ path: f, name: path.basename(f), size: stats.size });
      } catch (_) {}
    }
  });

  console.log('\n================================================================');
  console.log('                  CLASSIFIED SAMPLE CANDIDATES                  ');
  console.log('================================================================');

  Object.entries(classified).forEach(([cat, list]) => {
    console.log(`\n📁 Category: ${cat.toUpperCase()} (${list.length} candidate files found)`);
    list.slice(0, 6).forEach(item => {
      console.log(`   - ${item.name} (${formatBytes(item.size)})`);
    });
    if (list.length > 6) {
      console.log(`   ... and ${list.length - 6} more`);
    }
  });

  // Discover Dynamic Matching Pairs (Transcript + Media with same base stem name)
  console.log('\n================================================================');
  console.log('   DYNAMIC MATCHING PAIRS (Transcript + Media with Same Name)   ');
  console.log('================================================================');

  const mediaList = [...classified.Video, ...classified.Audio];
  const matchingPairs = [];

  const getCleanStem = (fileName) => {
    return path.parse(fileName).name
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '')
      .replace(/\d+$/, '');
  };

  classified.Transcript.forEach(t => {
    const tStem = path.parse(t.name).name.toLowerCase();
    const tClean = getCleanStem(t.name);

    mediaList.forEach(m => {
      const mStem = path.parse(m.name).name.toLowerCase();
      const mClean = getCleanStem(m.name);

      if (tStem === mStem || (tClean && tClean === mClean && tClean.length >= 3)) {
        matchingPairs.push({
          baseName: tStem === mStem ? tStem : `${tClean} (normalized)`,
          transcript: t.path,
          media: m.path,
          transcriptName: t.name,
          mediaName: m.name,
          mediaSize: formatBytes(m.size),
        });
      }
    });
  });

  if (matchingPairs.length > 0) {
    console.log(`Found ${matchingPairs.length} dynamic matching pair(s):\n`);
    matchingPairs.slice(0, 8).forEach((p, idx) => {
      console.log(`  [Pair #${idx + 1}] Shared Name: "${p.baseName}"`);
      console.log(`    - Transcript: ${p.transcriptName}`);
      console.log(`    - Media     : ${p.mediaName} (${p.mediaSize})`);
    });
  } else {
    console.log('No exact name matches found yet between transcripts and media.');
  }

  console.log('\n================================================================\n');
}

if (require.main === module) {
  runScan();
}

module.exports = {
  ACCEPTED_TYPES,
  classifyFile,
  getAllFiles,
  runScan,
};
