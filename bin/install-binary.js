#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Determine platform and architecture
const platformMap = {
  darwin: 'darwin',
  linux: 'linux',
  win32: 'windows',
};

const archMap = {
  arm64: 'arm64',
  x64: 'amd64',
};

const osPlatform = platformMap[process.platform];
const osArch = archMap[process.arch];

if (!osPlatform || !osArch) {
  console.error(`Unsupported platform or architecture: ${process.platform}-${process.arch}`);
  process.exit(1);
}

const ext = osPlatform === 'windows' ? '.exe' : '';
const binaryName = `devd-${osPlatform}-${osArch}${ext}`;
const targetPath = path.join(__dirname, `../devd${ext}`);

// Fetch the latest release tag name dynamically from the GitHub API
const apiOptions = {
  hostname: 'api.github.com',
  path: '/repos/dwaipayanray95/devD/releases/latest',
  headers: {
    'User-Agent': 'devD-Installer-NodeJS',
  },
};

function getLatestTag(callback) {
  https.get(apiOptions, (res) => {
    if (res.statusCode !== 200) {
      callback(new Error(`Failed to fetch latest release metadata (status code ${res.statusCode})`));
      return;
    }

    let body = '';
    res.on('data', (chunk) => {
      body += chunk;
    });

    res.on('end', () => {
      try {
        const data = JSON.parse(body);
        if (data && data.tag_name) {
          callback(null, data.tag_name);
        } else {
          callback(new Error('Invalid release metadata format'));
        }
      } catch (err) {
        callback(err);
      }
    });
  }).on('error', (err) => {
    callback(err);
  });
}

function download(url, dest, callback) {
  https.get(url, (res) => {
    if (res.statusCode === 302 || res.statusCode === 301) {
      // Follow redirect
      download(res.headers.location, dest, callback);
      return;
    }

    if (res.statusCode !== 200) {
      callback(new Error(`Server returned status code ${res.statusCode}`));
      return;
    }

    const totalBytes = parseInt(res.headers['content-length'], 10);
    let downloadedBytes = 0;

    const file = fs.createWriteStream(dest);

    res.on('data', (chunk) => {
      downloadedBytes += chunk.length;
      if (totalBytes) {
        const percent = ((downloadedBytes / totalBytes) * 100).toFixed(1);
        const width = 30;
        const complete = Math.round((downloadedBytes / totalBytes) * width);
        const incomplete = width - complete;
        const bar = '█'.repeat(complete) + '░'.repeat(incomplete);
        process.stdout.write(`\rDownloading: [${bar}] ${percent}% (${(downloadedBytes / 1024 / 1024).toFixed(2)} / ${(totalBytes / 1024 / 1024).toFixed(2)} MB)`);
      } else {
        process.stdout.write(`\rDownloading: ${(downloadedBytes / 1024 / 1024).toFixed(2)} MB`);
      }
    });

    res.pipe(file);

    file.on('finish', () => {
      file.close(() => {
        process.stdout.write('\n');
        callback();
      });
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    callback(err);
  });
}

console.log('Resolving latest devD release from GitHub...');
getLatestTag((err, tagName) => {
  let downloadUrl;
  if (err) {
    console.warn(`⚠️  Could not resolve latest release tag: ${err.message}`);
    // Fallback: Use package version if resolution fails
    const pkgPath = path.join(__dirname, '../package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    tagName = `v${pkg.version}`;
    console.log(`Falling back to package.json version: ${tagName}`);
  }

  downloadUrl = `https://github.com/dwaipayanray95/devD/releases/download/${tagName}/${binaryName}`;
  console.log(`Downloading pre-compiled binary for ${osPlatform}-${osArch}...`);
  console.log(`URL: ${downloadUrl}`);

  download(downloadUrl, targetPath, (downloadErr) => {
    if (downloadErr) {
      console.error(`\n✖ Could not download pre-compiled binary: ${downloadErr.message}`);
      console.error('Please make sure the release version is published on GitHub.');
      process.exit(1);
    }

    // Make it executable
    if (osPlatform !== 'windows') {
      fs.chmodSync(targetPath, 0o755);
    }

    console.log(`\n✔ devD ${tagName} successfully installed!`);
    process.exit(0);
  });
});
