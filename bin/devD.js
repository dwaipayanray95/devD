#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { createRequire } from 'module';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));
const require = createRequire(import.meta.url);

import { 
  isGitRepository, 
  runGitCommand,
  pull, 
  push, 
  stashSave, 
  stashPop 
} from '../src/git.js';
import { 
  printBanner, 
  showDashboard, 
  runCommitWizard, 
  handleGitError, 
  askGemini, 
  colors,
  getGeminiApiKey,
  checkForUpdates,
  getLatestRemoteVersion,
  promptWithEscape,
  getLocalVersion
} from '../src/ui.js';
import { spawn } from 'child_process';

const execAsync = promisify(exec);
const program = new Command();

function runBumper(type) {
  return new Promise((resolve) => {
    let bumpScriptPath;
    try {
      bumpScriptPath = require.resolve('bump-version/bin/bump.js');
    } catch (e) {
      console.log(colors.error('Error: bump-version package not found internally inside devD.'));
      resolve();
      return;
    }

    const args = [bumpScriptPath];
    if (type && type !== 'interactive') {
      args.push(type.trim().toLowerCase());
    }
    
    console.log(colors.info(`\nRunning internal bump-version CLI...`));
    
    // Execute directly using Node.js pointing to the internal dependency file (completely offline & preserves TTY scrolling)
    const child = spawn('node', args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(colors.success('\n✔ Version bump completed successfully!'));
        resolve('success');
      } else if (code === 2) {
        resolve('exit');
      } else {
        console.log(colors.error(`\n✖ Version bump process exited with code ${code}.`));
        resolve('failed');
      }
    });
  });
}

/**
 * Synchronously checks/downloads the latest bump-version commit from GitHub before launching UI.
 */
async function syncBumpVersion() {
  const spinner = ora(colors.primary('Checking and updating bump-version tool from GitHub...')).start();
  try {
    const pkgDir = join(__dirname, '../');
    await execAsync('npm install --no-audit --no-fund github:dwaipayanray95/bump-version', { cwd: pkgDir });
    spinner.succeed(colors.success('✔ bump-version is up to date with the latest commit!'));
  } catch (error) {
    spinner.warn(colors.warning('⚠ Failed to sync bump-version (offline or permission issue). Running cached local copy.'));
  }
}

/**
 * Handles repository initialization if directory is not a git repo.
 * @returns {Promise<boolean>} - true if git repo active, false if user declined
 */
async function ensureGitRepo() {
  const active = await isGitRepository();
  if (active) return true;

  console.log(colors.warning('⚠️  Not inside a Git repository.'));
  let answer;
  try {
    answer = await promptWithEscape([
      {
        type: 'confirm',
        name: 'initRepo',
        message: 'Would you like to initialize a Git repository in this folder?',
        default: true
      }
    ]);
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.success('Goodbye!'));
      process.exit(0);
    }
    throw error;
  }

  if (answer.initRepo) {
    const spinner = ora(colors.primary('Initializing Git repository...')).start();
    const res = await runGitCommand('init');
    if (res.success) {
      // Create initial main branch
      await runGitCommand('checkout -b main');
      spinner.succeed(colors.success('Initialized empty Git repository (branch: main).'));
      return true;
    } else {
      spinner.fail(colors.error('Failed to initialize Git repo.'));
      return false;
    }
  }
  return false;
}

/**
 * Main interactive console menu loop.
 */
async function runMenuLoop() {
  printBanner();
  await checkForUpdates(getLocalVersion());
  
  // Guard for Git features
  const gitActive = await ensureGitRepo();
  if (!gitActive) {
    // If not in git and refused to init, run mini-menu for AI/Exit only
    let answer;
    try {
      answer = await promptWithEscape([
        {
          type: 'list',
          name: 'action',
          message: 'No active Git repository. What would you like to do?',
          choices: [
            { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
            { name: '❌ Exit', value: 'exit' }
          ],
          loop: false
        }
      ]);
    } catch (error) {
      if (error.message === 'ESCAPE_CANCELLED') {
        console.log(colors.success('Goodbye!'));
        process.exit(0);
      }
      throw error;
    }
    
    if (answer.action === 'ai') {
      try {
        await runAIInteractive();
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
      }
      await pressEnterToContinue();
      await runMenuLoop();
    } else {
      console.log(colors.success('Goodbye!'));
      process.exit(0);
    }
    return;
  }

  // Active Git menu choices
  let answers;
  try {
    answers = await promptWithEscape([
      {
        type: 'list',
        name: 'action',
        message: 'What would you like to do?',
        choices: [
          { name: '📊 Show Repo Status Dashboard', value: 'status' },
          { name: '✍️  Stage & Commit Wizard (Conventional)', value: 'commit' },
          { name: '🔄 Sync Repo (Pull & Push)', value: 'sync' },
          { name: '📥 Stash Current Changes', value: 'stash' },
          { name: '📤 Pop Last Stash', value: 'stash-pop' },
          { name: '🚀 Bump Version', value: 'bump' },
          { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
          { name: '✨ Update devD CLI', value: 'update' },
          { name: '❌ Exit', value: 'exit' }
        ],
        loop: false
      }
    ]);
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.success('Goodbye!'));
      process.exit(0);
    }
    throw error;
  }

  switch (answers.action) {
    case 'status':
      printBanner();
      await showDashboard();
      break;
      
    case 'commit':
      await runCommitWizard();
      break;
      
    case 'sync': {
      printBanner();
      const pullSpinner = ora(colors.primary('Pulling remote changes...')).start();
      const pullRes = await pull();
      pullSpinner.stop();
      
      if (!pullRes.success) {
        console.log(colors.error('Pull failed.'));
        await handleGitError(pullRes);
        break;
      }
      
      const pushSpinner = ora(colors.primary('Pushing local changes...')).start();
      const pushRes = await push();
      pushSpinner.stop();
      
      if (!pushRes.success) {
        console.log(colors.error('Push failed.'));
        await handleGitError(pushRes);
      } else {
        console.log(colors.success('✔ Repository synchronized successfully.'));
      }
      break;
    }
    
    case 'stash': {
      try {
        const stashAnswer = await promptWithEscape([
          {
            type: 'input',
            name: 'message',
            message: 'Stash message (optional, press Enter to skip):',
            filter: val => val.trim()
          }
        ]);
        const spinner = ora(colors.primary('Saving changes to stash...')).start();
        const res = await stashSave(stashAnswer.message);
        spinner.stop();
        if (res.success) {
          console.log(colors.success('✔ Stashed changes successfully.'));
        } else {
          console.log(colors.error('Failed to stash changes: ' + (res.stderr || res.error)));
        }
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
        console.log(colors.info('\nStash cancelled.'));
      }
      break;
    }
    
    case 'stash-pop': {
      const spinner = ora(colors.primary('Popping last stash...')).start();
      const res = await stashPop();
      spinner.stop();
      if (res.success) {
        console.log(colors.success('✔ Restored stashed changes.'));
      } else {
        console.log(colors.error('Failed to pop stash: ' + (res.stderr || res.error)));
      }
      break;
    }
    
    case 'bump': {
      try {
        const res = await runBumper();
        if (res === 'exit') {
          await runMenuLoop();
          return;
        }
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
        console.log(colors.info('\nBumping cancelled.'));
      }
      break;
    }
    
    case 'ai':
      try {
        await runAIInteractive();
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
      }
      break;

    case 'update': {
      try {
        const updateAnswer = await promptWithEscape([
          {
            type: 'list',
            name: 'type',
            message: 'What would you like to update to?',
            choices: [
              { name: 'Latest Stable Release (GitHub Tag)', value: 'release' },
              { name: 'Latest Bleeding-Edge Commit (main branch)', value: 'commit' },
              { name: '↩ Back to main menu', value: 'back' }
            ],
            loop: false
          }
        ]);
        if (updateAnswer.type === 'back') {
          break;
        }
        await runSelfUpdate(updateAnswer.type === 'commit');
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
        console.log(colors.info('\nUpdate cancelled.'));
      }
      break;
    }
      
    case 'exit':
      console.log(colors.success('Goodbye!'));
      process.exit(0);
      break;
  }

  await pressEnterToContinue();
  await runMenuLoop();
}

/**
 * Interactive prompt helper to ask Gemini questions.
 */
async function runAIInteractive() {
  console.log();
  console.log(colors.primary('🤖 Gemini Assistant Console'));
  const answers = await promptWithEscape([
    {
      type: 'input',
      name: 'prompt',
      message: 'Ask Gemini anything (e.g. explain git rebase, or write a regex):',
      validate: val => val.trim().length > 0 ? true : 'Prompt cannot be empty.'
    }
  ]);

  try {
    const answer = await askGemini(answers.prompt);
    console.log(`\n${colors.bright('Response:')}\n${answer}\n`);
  } catch (error) {
    console.error(colors.error(`Error query: ${error.message}`));
  }
}

/**
 * Performs self-update via global npm installation from GitHub.
 * @param {boolean} toLatestCommit 
 */
async function runSelfUpdate(toLatestCommit = false) {
  const spinner = ora(colors.primary('Checking remote updates...')).start();
  let target = 'dwaipayanray95/devD';
  
  if (toLatestCommit) {
    target = 'dwaipayanray95/devD#main';
    spinner.text = colors.primary('Updating to the latest commit on main branch...');
  } else {
    try {
      const latest = await getLatestRemoteVersion();
      if (latest) {
        target = `dwaipayanray95/devD#v${latest}`;
        spinner.text = colors.primary(`Updating to latest release v${latest}...`);
      } else {
        spinner.text = colors.primary('Updating to latest commit...');
      }
    } catch (e) {
      // fallback
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
    const child = spawn(cmd, args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (code === 0) {
        console.log(colors.success('✔ devD has been updated successfully! Please restart devD to use the new version.'));
        // Ensure the cursor is visible and raw mode is disabled/paused before exiting
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

/**
 * Block the loop until the user presses Enter.
 */
async function pressEnterToContinue() {
  console.log();
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: colors.muted('Press Enter to return to main menu...')
  }]);
}

// ==========================================
// CLI Command Definitions using Commander
// ==========================================

program
  .name('devD')
  .description('Developer helper CLI companion for Git, stashing, & version bumping.')
  .version(getLocalVersion());

// default action when no subcommand is specified
program
  .action(async () => {
    if (process.argv.slice(2).length === 0) {
      await syncBumpVersion();
      await runMenuLoop();
    }
  });

program
  .command('bump [type]')
  .alias('b')
  .description('Bump package version using bump-version (types: major, minor, patch, interactive)')
  .action(async (type) => {
    await syncBumpVersion();
    await runBumper(type);
  });

program
  .command('status')
  .alias('d')
  .description('Display status dashboard of the repository')
  .action(async () => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    printBanner();
    await showDashboard();
  });

program
  .command('commit')
  .alias('c')
  .description('Run interactive Conventional Commit Wizard')
  .action(async () => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    await runCommitWizard();
  });

program
  .command('sync')
  .alias('s')
  .description('Pull changes and push local commits')
  .action(async () => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    
    const pullSpinner = ora('Pulling...').start();
    const pullRes = await pull();
    pullSpinner.stop();
    if (!pullRes.success) {
      console.log(colors.error('Sync failed: Pull failed.'));
      await handleGitError(pullRes);
      process.exit(1);
    }
    
    const pushSpinner = ora('Pushing...').start();
    const pushRes = await push();
    pushSpinner.stop();
    if (!pushRes.success) {
      console.log(colors.error('Sync failed: Push failed.'));
      await handleGitError(pushRes);
      process.exit(1);
    }
    
    console.log(colors.success('✔ Repository synchronized successfully.'));
  });



program
  .command('update')
  .alias('u')
  .description('Update devD CLI to the latest version')
  .option('-c, --commit', 'Update to the latest commit on the main branch')
  .action(async (options) => {
    await runSelfUpdate(options.commit);
  });

program
  .command('stash')
  .description('Stash local modifications')
  .option('-p, --pop', 'Pop the last stash instead of creating one')
  .option('-m, --message <msg>', 'Message to record along with the stash state')
  .action(async (options) => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    
    if (options.pop) {
      const spinner = ora('Popping stash...').start();
      const res = await stashPop();
      spinner.stop();
      if (res.success) console.log(colors.success('✔ Stash popped.'));
      else console.error(colors.error('Failed: ' + (res.stderr || res.error)));
    } else {
      const spinner = ora('Saving stash...').start();
      const res = await stashSave(options.message);
      spinner.stop();
      if (res.success) console.log(colors.success('✔ Stash saved.'));
      else console.error(colors.error('Failed: ' + (res.stderr || res.error)));
    }
  });

program
  .command('ai <prompt>')
  .description('Query Gemini for assistance directly from command line')
  .action(async (prompt) => {
    try {
      const answer = await askGemini(prompt);
      console.log(`\n🤖 ${colors.primary('Gemini:')}\n${answer}\n`);
    } catch (error) {
      console.error(colors.error(`Error: ${error.message}`));
      process.exit(1);
    }
  });

program.parse(process.argv);
