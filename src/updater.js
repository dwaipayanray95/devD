import { spawn, exec } from 'child_process';
import { promisify } from 'util';
import ora from 'ora';
import { colors, getLatestRemoteVersion } from './ui.js';

const execAsync = promisify(exec);

export function crossSpawn(cmd, args, options = {}) {
  if (process.platform === 'win32') {
    return spawn(cmd, args, { ...options, shell: true });
  }
  return spawn(cmd, args, options);
}

export async function runSelfUpdate(toLatestCommit = false) {
  const spinner = ora(colors.primary('Checking remote updates...')).start();
  let target = 'dwaipayanray95/devD#main';
  
  if (toLatestCommit) {
    spinner.text = colors.primary('Updating to the latest commit on main branch...');
  } else {
    try {
      const latest = await getLatestRemoteVersion();
      if (latest) {
        target = `dwaipayanray95/devD#v${latest}`;
        spinner.text = colors.primary(`Updating to latest release v${latest}...`);
      } else {
        spinner.text = colors.primary('Updating to the latest commit on main branch...');
      }
    } catch (e) {
      spinner.text = colors.primary('Updating to the latest commit on main branch...');
    }
  }
  spinner.stop();

  // Check npm prefix permissions
  const npmPrefixRes = await execAsync('npm config get prefix');
  const prefix = npmPrefixRes.stdout.trim();
  
  let useSudo = false;
  try {
    const fs = await import('fs');
    const path = await import('path');
    const testPath = path.join(prefix, 'lib/node_modules/.devD-write-test');
    fs.writeFileSync(testPath, '');
    fs.unlinkSync(testPath);
  } catch (err) {
    useSudo = process.platform !== 'win32';
  }

  const cmd = useSudo ? 'sudo' : 'npm';
  const args = useSudo 
    ? ['npm', 'install', '-g', target] 
    : ['install', '-g', target];

  console.log(colors.info(`Running: ${cmd} ${args.join(' ')}`));
  
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }
    const child = crossSpawn(cmd, args, { stdio: 'inherit' });
    
    child.on('error', (err) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
      console.log(colors.error(`\n✖ Failed to run update command: ${err.message}`));
      resolve();
    });
    
    child.on('close', (code) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
      if (code === 0) {
        console.log(colors.success('✔ devD has been updated successfully! Please restart devD to use the new version.'));
        process.stdout.write('\u001B[?25h');
        if (process.stdin.isTTY) {
          process.stdin.setRawMode(false);
          process.stdin.pause();
        }
        process.exit(0);
      } else {
        console.log(colors.error(`✖ Update failed with exit code ${code}.`));
        resolve();
      }
    });
  });
}

export function openUrl(url) {
  const startCmd = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open';
  if (process.platform === 'win32') {
    exec(`start "" "${url}"`);
  } else {
    exec(`${startCmd} "${url}"`);
  }
}
