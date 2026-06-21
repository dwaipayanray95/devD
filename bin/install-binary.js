#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Read version from package.json
const pkgPath = path.join(__dirname, '../package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
const version = pkg.version;

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
const downloadUrl = `https://github.com/dwaipayanray95/devD/releases/download/v${version}/${binaryName}`;
const targetPath = path.join(__dirname, `../devd${ext}`);

console.log(`Downloading devD v${version} binary for ${osPlatform}-${osArch}...`);
console.log(`URL: ${downloadUrl}`);

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

    const file = fs.createWriteStream(dest);
    res.pipe(file);

    file.on('finish', () => {
      file.close(callback);
    });
  }).on('error', (err) => {
    fs.unlink(dest, () => {});
    callback(err);
  });
}

download(downloadUrl, targetPath, (err) => {
  if (err) {
    console.error(`\n✖ Failed to download pre-compiled binary: ${err.message}`);
    console.error('Please make sure you have internet access and that the release exists on GitHub.');
    process.exit(1);
  }

  // Make it executable
  if (osPlatform !== 'windows') {
    fs.chmodSync(targetPath, 0o755);
  }

  console.log(`\n✔ devD v${version} successfully installed!`);
  process.exit(0);
});
