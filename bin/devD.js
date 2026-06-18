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

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

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
  getLatestRemoteVersion
} from '../src/ui.js';
import { spawn } from 'child_process';

const execAsync = promisify(exec);
const program = new Command();

/**
 * Runs the version bump utility using the user's bump-version project.
 * @param {string} type - major, minor, or patch
 */
async function runBumper(type) {
  const cleanType = type.trim().toLowerCase();
  if (!['major', 'minor', 'patch'].includes(cleanType)) {
    console.log(colors.error(`Invalid bump type "${type}". Please use "major", "minor", or "patch".`));
    return;
  }

  const spinner = ora(colors.primary(`Executing bump-version (${cleanType})...`)).start();
  try {
    const { stdout, stderr } = await execAsync(`npx github:dwaipayanray95/bump-version ${cleanType}`);
    spinner.succeed(colors.success('Version bump completed!'));
    if (stdout) console.log(colors.muted(stdout.trim()));
    if (stderr) console.error(colors.warning(stderr.trim()));
  } catch (error) {
    spinner.fail(colors.error('Version bump failed:'));
    console.error(colors.warning(error.stdout || error.stderr || error.message));
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
  const answer = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'initRepo',
      message: 'Would you like to initialize a Git repository in this folder?',
      default: true
    }
  ]);

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
  await checkForUpdates(pkg.version);
  
  // Guard for Git features
  const gitActive = await ensureGitRepo();
  if (!gitActive) {
    // If not in git and refused to init, run mini-menu for AI/Exit only
    const answer = await inquirer.prompt([
      {
        type: 'list',
        name: 'action',
        message: 'No active Git repository. What would you like to do?',
        choices: [
          { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
          { name: '❌ Exit', value: 'exit' }
        ]
      }
    ]);
    
    if (answer.action === 'ai') {
      await runAIInteractive();
      await pressEnterToContinue();
      await runMenuLoop();
    } else {
      console.log(colors.success('Goodbye!'));
      process.exit(0);
    }
    return;
  }

  // Active Git menu choices
  const answers = await inquirer.prompt([
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
      ]
    }
  ]);

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
      const stashAnswer = await inquirer.prompt([
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
      const bumpAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'type',
          message: 'Select version bump type:',
          choices: [
            { name: 'patch:  Bug fixes (e.g. 1.0.0 -> 1.0.1)', value: 'patch' },
            { name: 'minor:  New features (e.g. 1.0.0 -> 1.1.0)', value: 'minor' },
            { name: 'major:  Breaking changes (e.g. 1.0.0 -> 2.0.0)', value: 'major' },
            { name: '↩ Back to main menu', value: 'back' }
          ]
        }
      ]);
      if (bumpAnswer.type === 'back') {
        break;
      }
      await runBumper(bumpAnswer.type);
      break;
    }
    
    case 'ai':
      await runAIInteractive();
      break;

    case 'update': {
      const updateAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'type',
          message: 'What would you like to update to?',
          choices: [
            { name: 'Latest Stable Release (GitHub Tag)', value: 'release' },
            { name: 'Latest Bleeding-Edge Commit (main branch)', value: 'commit' },
            { name: '↩ Back to main menu', value: 'back' }
          ]
        }
      ]);
      if (updateAnswer.type === 'back') {
        break;
      }
      await runSelfUpdate(updateAnswer.type === 'commit');
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
  const answers = await inquirer.prompt([
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
  
  const child = spawn(cmd, args, { stdio: 'inherit' });
  
  child.on('close', (code) => {
    if (code === 0) {
      console.log(colors.success('✔ devD has been updated successfully!'));
    } else {
      console.log(colors.error(`✖ Update failed with exit code ${code}.`));
    }
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
  .version(pkg.version);

// default action when no subcommand is specified
program
  .action(async () => {
    if (process.argv.slice(2).length === 0) {
      await runMenuLoop();
    }
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
  .command('bump [type]')
  .alias('b')
  .description('Bump package version using bump-version (types: major, minor, patch)')
  .action(async (type) => {
    if (!type) {
      const bumpAnswer = await inquirer.prompt([
        {
          type: 'list',
          name: 'type',
          message: 'Select version bump type:',
          choices: ['patch', 'minor', 'major']
        }
      ]);
      await runBumper(bumpAnswer.type);
    } else {
      await runBumper(type);
    }
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
