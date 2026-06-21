import fs from 'fs';
import path from 'path';
import os from 'os';
import inquirer from 'inquirer';
import { exec } from 'child_process';
import { colors, promptWithEscape } from './ui.js';

const LOG_DIR = path.join(os.homedir(), '.devd');
const LOG_FILE = path.join(LOG_DIR, 'devd.log');
const MAX_LOG_LINES = 200;

export function getLogFilePath() {
  return LOG_FILE;
}

export function getLogDirPath() {
  return LOG_DIR;
}

export function logMessage(message, level = 'INFO') {
  try {
    if (!fs.existsSync(LOG_DIR)) {
      fs.mkdirSync(LOG_DIR, { recursive: true });
    }

    const timestamp = new Date().toISOString();
    const formattedLine = `[${timestamp}] [${level}] ${message}`;

    let lines = [];
    if (fs.existsSync(LOG_FILE)) {
      const content = fs.readFileSync(LOG_FILE, 'utf8');
      lines = content.split('\n').filter(line => line.trim().length > 0);
    }

    lines.push(formattedLine);

    // Keep only last N lines
    if (lines.length > MAX_LOG_LINES) {
      lines = lines.slice(lines.length - MAX_LOG_LINES);
    }

    fs.writeFileSync(LOG_FILE, lines.join('\n') + '\n', 'utf8');
  } catch (err) {
    // Silently ignore log errors to avoid crashing main CLI
  }
}

function openUrl(url) {
  const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else {
    exec(`${startCmd} "${url}"`);
  }
}

function copyToClipboard(text) {
  return new Promise((resolve) => {
    const proc = exec(
      process.platform === 'darwin' ? 'pbcopy' : process.platform === 'win32' ? 'clip' : 'xclip -selection clipboard',
      (error) => {
        resolve(!error);
      }
    );
    proc.stdin.write(text);
    proc.stdin.end();
  });
}

export async function manageLogsMenu(errorDetail = null) {
  const choices = [
    { name: '📋 View Logs inside devD', value: 'view' },
    { name: '🚀 Submit/Report Issue with Logs (GitHub)', value: 'submit' },
    { name: '📁 Open Folder where Logs are saved', value: 'open_folder' },
    { name: '↩ Return', value: 'back' }
  ];

  try {
    const answer = await promptWithEscape([
      {
        type: 'list',
        name: 'action',
        message: 'Select log operation:',
        choices,
        loop: false
      }
    ]);

    if (answer.action === 'back') {
      return;
    }

    switch (answer.action) {
      case 'view': {
        console.clear();
        console.log(colors.accent('📋  DEVD SYSTEM LOGS\n'));
        const logFile = getLogFilePath();
        let content = '';
        if (fs.existsSync(logFile)) {
          content = fs.readFileSync(logFile, 'utf8');
          console.log(content);
        } else {
          console.log(colors.warning('No logs found yet.'));
        }
        console.log();

        try {
          const copyAnswer = await promptWithEscape([
            {
              type: 'list',
              name: 'opt',
              message: 'Choose action:',
              choices: [
                { name: '📋 Copy logs to clipboard', value: 'copy' },
                { name: '↩ Return', value: 'back' }
              ],
              loop: false
            }
          ]);

          if (copyAnswer.opt === 'copy' && content) {
            const success = await copyToClipboard(content);
            if (success) {
              console.log(colors.success('\n✔ Logs successfully copied to clipboard!'));
            } else {
              console.log(colors.warning('\n⚠️  Failed to copy logs automatically (ensure xclip is installed on Linux).'));
            }
            await new Promise(r => setTimeout(r, 1200));
          }
        } catch (e) {
          // ESC pressed, ignore and loop back
        }
        return manageLogsMenu(errorDetail);
      }
    case 'submit': {
      const osType = os.type();
      const osRelease = os.release();
      const osPlatform = os.platform();
      const osArch = os.arch();
      const nodeVersion = process.version;

      let logSnippet = '';
      const logFile = getLogFilePath();
      if (fs.existsSync(logFile)) {
        const content = fs.readFileSync(logFile, 'utf8');
        const lines = content.split('\n').filter(Boolean);
        logSnippet = lines.slice(-30).join('\n');
      }

      const issueTitle = encodeURIComponent(errorDetail ? `Bug: ${errorDetail}` : 'Bug Report / CLI Issue');
      
      const issueBody = `### Environment Details
- **OS Platform**: ${osPlatform} (${osType} ${osRelease})
- **Architecture**: ${osArch}
- **Node.js Version**: ${nodeVersion}

### Error / Failure Details
${errorDetail ? `**Context**: ${errorDetail}` : 'N/A'}

### System Logs (Last 30 lines)
\`\`\`text
${logSnippet || 'No logs recorded.'}
\`\`\``;

      const issueBodyEncoded = encodeURIComponent(issueBody);
      const url = `https://github.com/dwaipayanray95/devD/issues/new?title=${issueTitle}&body=${issueBodyEncoded}`;
      
      console.log(colors.info('\nOpening GitHub to submit new issue with system details...'));
      openUrl(url);
      break;
    }
      case 'open_folder': {
        const dir = getLogDirPath();
        console.log(colors.info(`\nOpening log directory: ${dir}`));
        openUrl(dir);
        break;
      }
    }
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      return;
    }
    throw error;
  }
}
