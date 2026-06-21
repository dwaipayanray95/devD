import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import fs, { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname, join } from 'path';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads and returns the local package version from package.json dynamically.
 * @returns {string}
 */
export function getLocalVersion() {
  try {
    const pkgPath = join(__dirname, '../package.json');
    const pkgContent = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkgContent.version;
  } catch (e) {
    return '0.1.0';
  }
}

// Constants for UI theme colors
export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  info: chalk.blue,
  accent: chalk.magenta,
  bright: chalk.white.bold
};

/**
 * Renders a premium console banner.
 */
export function getProjectInfo() {
  const cwd = process.cwd();
  const folderName = path.basename(cwd);
  
  // 1. package.json (Node.js)
  try {
    const pkgPath = path.join(cwd, 'package.json');
    if (fs.existsSync(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
      if (pkg.name) {
        const verStr = pkg.version ? ` v${pkg.version}` : '';
        return `${pkg.name}${verStr}`;
      }
    }
  } catch (e) {
    // Ignore
  }

  // 2. pubspec.yaml (Flutter)
  try {
    const pubspecPath = path.join(cwd, 'pubspec.yaml');
    if (fs.existsSync(pubspecPath)) {
      const content = fs.readFileSync(pubspecPath, 'utf8');
      const nameMatch = content.match(/^name:\s*(.+)$/m);
      const versionMatch = content.match(/^version:\s*(.+)$/m);
      if (nameMatch) {
        const name = nameMatch[1].trim();
        const version = versionMatch ? versionMatch[1].trim() : '';
        return version ? `${name} v${version}` : name;
      }
    }
  } catch (e) {
    // Ignore
  }

  return folderName;
}

export function printBanner() {
  console.clear();
  const title = `🚀  devD CLI v${getLocalVersion()}`;
  const width = 56;
  const padding = Math.max(0, Math.floor((width - title.length) / 2));
  const line = ' '.repeat(padding) + title + ' '.repeat(width - title.length - padding);

  console.log(colors.primary('┌────────────────────────────────────────────────────────┐'));
  console.log(colors.primary('│') + colors.bright(line) + colors.primary('│'));
  console.log(colors.primary('│') + colors.muted('             Accelerating Developer Workflows           ') + colors.primary('│'));
  console.log(colors.primary('└────────────────────────────────────────────────────────┘'));
  console.log(`${colors.accent('📂 Active Workspace:')} ${colors.bright(getProjectInfo())}`);
  console.log();
}

/**
 * Retrieves the Gemini API Key.
 * @returns {string|null}
 */
export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || null;
}

/**
 * Calls the Gemini API using native fetch.
 * @param {string} prompt 
 * @returns {Promise<string>}
 */
export async function askGemini(prompt) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in your environment. Set it with: export GEMINI_API_KEY="..."');
  }

  const spinner = ora(colors.primary('Thinking...')).start();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();
    spinner.stop();

    if (!response.ok) {
      const errorMsg = data.error?.message || 'Failed call to Gemini API';
      throw new Error(errorMsg);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response received from Gemini.');
    }
    return text.trim();
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

/**

/**
 * Checks GitHub for the latest release version.
 * @returns {Promise<string|null>} - The remote tag name (without 'v') or null if error/no release
 */
export async function getLatestRemoteVersion() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout to not block start
    const res = await fetch('https://api.github.com/repos/dwaipayanray95/devD/releases/latest', {
      headers: { 'User-Agent': 'devD-CLI' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = await res.json();
    return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
  } catch (error) {
    return null;
  }
}

/**
 * Checks if the remote version is newer than the local version.
 * @param {string} local 
 * @param {string} remote 
 * @returns {boolean}
 */
export function isOutdated(local, remote) {
  if (!remote) return false;
  const l = local.split('.').map(Number);
  const r = remote.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

/**
 * Checks if there is a new update and prints a banner if so.
 * @param {string} localVersion 
 */
export function getLocalCommitSha() {
  try {
    const sha = execSync('git rev-parse HEAD', { stdio: 'pipe' }).toString().trim();
    if (sha) return sha;
  } catch (e) {
    // Ignore
  }
  
  try {
    const pkgPath = join(__dirname, '../package.json');
    const pkgContent = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (pkgContent._resolved) {
      const match = pkgContent._resolved.match(/#([a-f0-9]+)$/);
      if (match) return match[1];
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

export async function getLatestRemoteCommitSha() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout
    const res = await fetch('https://api.github.com/repos/dwaipayanray95/devD/commits/main', {
      headers: { 'User-Agent': 'devD-CLI' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = await res.json();
    return data.sha ? data.sha : null;
  } catch (error) {
    return null;
  }
}

export async function checkForUpdates(localVersion) {
  // 1. Check tag release
  const latestTag = await getLatestRemoteVersion();
  if (latestTag && isOutdated(localVersion, latestTag)) {
    return { type: 'release', version: latestTag };
  }
  
  // 2. Check commit hash
  const localSha = getLocalCommitSha();
  if (localSha) {
    const remoteSha = await getLatestRemoteCommitSha();
    if (remoteSha && localSha !== remoteSha && !remoteSha.startsWith(localSha) && !localSha.startsWith(remoteSha)) {
      return { type: 'commit', version: remoteSha.substring(0, 7) };
    }
  }
  return null;
}

/**
 * Wraps Inquirer prompts and rejects the promise if the user presses the Escape key.
 * @param {Array|Object} questions 
 * @returns {Promise<any>}
 */
export function promptWithEscape(questions) {
  let ui;
  let onCancel;
  
  const cancelPromise = new Promise((_, reject) => {
    onCancel = () => reject(new Error('ESCAPE_CANCELLED'));
  });

  const keypressHandler = (_, key) => {
    if (key && (key.name === 'escape' || key.name === 'esc')) {
      if (ui) {
        ui.close();
      }
      onCancel();
    }
  };

  process.stdin.on('keypress', keypressHandler);

  const promptPromise = inquirer.prompt(questions);
  ui = promptPromise.ui;

  return Promise.race([promptPromise, cancelPromise])
    .then(answers => {
      process.stdin.removeListener('keypress', keypressHandler);
      return answers;
    })
    .catch(err => {
      process.stdin.removeListener('keypress', keypressHandler);
      throw err;
    });
}

