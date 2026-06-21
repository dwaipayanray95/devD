#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import fs, { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname, join } from 'path';
import { spawn } from 'child_process';
import http from 'http';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf8'));

import { 
  isGitRepository, 
  runGitCommand,
  pull, 
  push, 
  stashSave, 
  stashPop,
  getAheadBehind,
  getChangedFiles,
  stageFiles,
  commit
} from '../src/git.js';
import { 
  printBanner, 
  askGemini, 
  colors,
  checkForUpdates,
  getLocalVersion,
  getProjectInfo
} from '../src/ui.js';
import { parseCommand, showHelpMenu } from '../src/commands.js';
import { navigateDirectories } from '../src/navigator.js';
import { showInteractiveMenu } from '../src/menu.js';
import { runSelfUpdate, crossSpawn, openUrl } from '../src/updater.js';
import { 
  showDashboard, 
  runCommitWizard, 
  handleGitError, 
  manageBranches, 
  showGitControlsMenu,
  createGitTag,
  createGitHubRelease,
  getGitHubRepoDetails,
  getAllBranches
} from '../src/gitControl.js';
import { detectPlatform } from '../src/detector.js';
import { manageLogsMenu } from '../src/logger.js';
import { getStoredToken, saveStoredToken } from '../src/config.js';

const GIT_ACTIONS = new Set([
  'git-controls',
  'branch-manager',
  'commit',
  'sync',
  'pull',
  'stash',
  'stash-pop',
  'status',
  'bump',
  'tag',
  'release'
]);

const program = new Command();

function runBumper(type) {
  const beforeInfo = getProjectInfo();
  return new Promise((resolve) => {
    const cmd = 'node';
    const args = [join(__dirname, '../node_modules/bump-version/bin/bump.js')];
    if (type && type !== 'interactive') {
      args.push(type.trim().toLowerCase());
    }
    
    console.log(colors.info(`\nRunning bump-version CLI...`));
    
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }

    const child = crossSpawn(cmd, args, { stdio: 'inherit' });
    
    child.on('error', (err) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
      console.log(colors.error(`\n✖ Failed to start version bumper: ${err.message}`));
      resolve('failed');
    });
    
    child.on('close', (code) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
      
      const afterInfo = getProjectInfo();
      const versionChanged = beforeInfo !== afterInfo;

      if (code === 0) {
        if (versionChanged) {
          console.log(colors.success('\n✔ Version bump completed successfully!'));
          resolve('success');
        } else {
          resolve('exit');
        }
      } else if (code === 2) {
        resolve('exit');
      } else {
        console.log(colors.error(`\n✖ Version bumper exited with code ${code}.`));
        resolve('failed');
      }
    });
  });
}

async function ensureGitRepo() {
  const active = await isGitRepository();
  if (active) return true;

  console.log(colors.warning('⚠️  Not inside a Git repository.'));
  let answer;
  try {
    answer = await inquirer.prompt([
      {
        type: 'confirm',
        name: 'initRepo',
        message: 'Would you like to initialize a Git repository in this folder?',
        default: true
      }
    ]);
  } catch (error) {
    console.log(colors.success('Goodbye!'));
    process.exit(0);
  }

  if (answer.initRepo) {
    const spinner = ora(colors.primary('Initializing Git repository...')).start();
    const res = await runGitCommand('init');
    if (res.success) {
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

async function showSettingsMenu() {
  printBanner();
  console.log(colors.accent('🛠  SETTINGS MENU\n'));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select option:',
      choices: [
        { name: '✨ Update devD CLI', value: 'update' },
        { name: 'ℹ️  Help & Commands', value: 'help' },
        { name: '⚙️  Preferences', value: 'preferences' },
        { name: '📋 Manage System Logs', value: 'logs' },
        { name: '🔁 Restart devD CLI', value: 'restart' },
        { name: '❤️  Made with <3 by @dwaipayanray95', value: 'author' },
        { name: '↩ Back to main menu', value: 'back' }
      ],
      loop: false,
      pageSize: process.stdout.rows ? Math.max(10, process.stdout.rows - 10) : 15
    }
  ]);

  if (answer.action === 'back') {
    await runMenuLoop();
    return;
  }
  
  await handleMenuAction(answer.action);
}

async function showPreferencesMenu() {
  printBanner();
  console.log(colors.accent('⚙️  PREFERENCES\n'));

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select option:',
      choices: [
        { name: '🔑 Configure GitHub Token', value: 'git-token' },
        { name: '↩ Back to settings menu', value: 'back' }
      ],
      loop: false
    }
  ]);

  if (answer.action === 'back') {
    await showSettingsMenu();
    return;
  }

  switch (answer.action) {
    case 'git-token': {
      console.clear();
      printBanner();
      console.log(colors.accent('🔑 CONFIGURE GITHUB TOKEN\n'));
      const currentToken = getStoredToken();
      if (currentToken) {
        console.log(colors.info(`A GitHub Token is currently stored locally (masked: ****${currentToken.slice(-4)}).`));
        const ans = await inquirer.prompt([
          {
            type: 'list',
            name: 'opt',
            message: 'What would you like to do?',
            choices: [
              { name: '🔄 Replace stored token', value: 'replace' },
              { name: '❌ Clear stored token', value: 'clear' },
              { name: '↩ Return', value: 'back' }
            ],
            loop: false
          }
        ]);
        if (ans.opt === 'clear') {
          saveStoredToken(null);
          console.log(colors.success('✔ Token cleared successfully.'));
        } else if (ans.opt === 'replace') {
          const tokenAns = await inquirer.prompt([
            {
              type: 'password',
              name: 'token',
              message: 'Paste your new GitHub Personal Access Token:',
              mask: '*',
              validate: val => val.trim().length > 0 ? true : 'Token is required.'
            }
          ]);
          saveStoredToken(tokenAns.token.trim());
          console.log(colors.success('✔ New token saved successfully.'));
        }
      } else {
        console.log(colors.warning('No GitHub Token is currently stored locally.'));
        const ans = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'add',
            message: 'Would you like to add one now?',
            default: true
          }
        ]);
        if (ans.add) {
          const tokenAns = await inquirer.prompt([
            {
              type: 'password',
              name: 'token',
              message: 'Paste your GitHub Personal Access Token:',
              mask: '*',
              validate: val => val.trim().length > 0 ? true : 'Token is required.'
            }
          ]);
          saveStoredToken(tokenAns.token.trim());
          console.log(colors.success('✔ Token saved successfully.'));
        }
      }
      break;
    }
  }

  await pressEnterToContinue();
  await showPreferencesMenu();
}

async function handleMenuAction(action) {
  console.clear();
  switch (action) {
    case 'settings':
      await showSettingsMenu();
      break;

    case 'preferences':
      await showPreferencesMenu();
      break;

    case 'logs':
      await manageLogsMenu();
      break;

    case 'author':
      openUrl('https://github.com/dwaipayanray95/devD');
      break;

    case 'git-controls': {
      while (true) {
        const action = await showGitControlsMenu(handleMenuAction);
        if (action === 'back' || !action) {
          break;
        }
        const textCommands = ['status', 'sync', 'tag', 'release', 'stash', 'stash-pop'];
        if (textCommands.includes(action)) {
          await pressEnterToContinue();
        }
      }
      await runMenuLoop();
      return;
    }

    case 'branch-manager':
      await manageBranches();
      break;

    case 'tag':
      await createGitTag();
      break;

    case 'release':
      await createGitHubRelease();
      break;

    case 'run-app': {
      const p = detectPlatform();
      if (!p) {
        console.log(colors.warning('\n⚠️  Could not auto-detect any supported platform/framework in this directory.'));
        console.log(colors.muted('Supported configurations: Flutter, Tauri, Node.js (npm), Rust (Cargo), Java (Gradle), Go, Python.'));
      } else {
        console.log(colors.info(`\nDetected Platform: ${colors.accent(p.platformName)}`));
        console.log(colors.muted(`Running: ${p.runCommand} ${p.runArgs.join(' ')}\n`));
        
        if (process.stdin.isTTY) {
          process.stdin.pause();
        }
        
        await new Promise((resolve) => {
          const child = crossSpawn(p.runCommand, p.runArgs, { stdio: 'inherit' });
          child.on('error', (err) => {
            if (process.stdin.isTTY) {
              process.stdin.resume();
            }
            console.log(colors.error(`\n✖ Failed to start process: ${err.message}`));
            resolve();
          });
          child.on('close', (code) => {
            if (process.stdin.isTTY) {
              process.stdin.resume();
            }
            if (code === 0) {
              console.log(colors.success(`\n✔ Process completed successfully.`));
            } else {
              console.log(colors.error(`\n✖ Process exited with code ${code}.`));
            }
            resolve();
          });
        });
      }
      break;
    }

    case 'build-app': {
      const p = detectPlatform();
      if (!p) {
        console.log(colors.warning('\n⚠️  Could not auto-detect any supported platform/framework in this directory.'));
        console.log(colors.muted('Supported configurations: Flutter, Tauri, Node.js (npm), Rust (Cargo), Java (Gradle), Go, Python.'));
      } else {
        console.log(colors.info(`\nDetected Platform: ${colors.accent(p.platformName)}`));
        console.log(colors.muted(`Building: ${p.buildCommand} ${p.buildArgs.join(' ')}\n`));
        
        if (process.stdin.isTTY) {
          process.stdin.pause();
        }
        
        await new Promise((resolve) => {
          const child = crossSpawn(p.buildCommand, p.buildArgs, { stdio: 'inherit' });
          child.on('error', (err) => {
            if (process.stdin.isTTY) {
              process.stdin.resume();
            }
            console.log(colors.error(`\n✖ Failed to start build process: ${err.message}`));
            resolve();
          });
          child.on('close', (code) => {
            if (process.stdin.isTTY) {
              process.stdin.resume();
            }
            if (code === 0) {
              console.log(colors.success(`\n✔ Build completed successfully.`));
            } else {
              console.log(colors.error(`\n✖ Build process exited with code ${code}.`));
            }
            resolve();
          });
        });
      }
      break;
    }

    case 'help':
      await showHelpMenu();
      break;

    case 'restart': {
      console.log(colors.primary('\nRestarting devD...'));
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
        process.stdin.pause();
        process.stdin.removeAllListeners();
      }
      const child = spawn(process.argv[0], process.argv.slice(1), { stdio: 'inherit' });
      child.on('close', (code) => {
        process.exit(code);
      });
      return;
    }

    case 'status':
      printBanner();
      await showDashboard();
      break;
      
    case 'commit': {
      const res = await runCommitWizard();
      if (res === 'escape') {
        await runMenuLoop();
        return;
      }
      break;
    }
      
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

    case 'pull': {
      printBanner();
      const pullSpinner = ora(colors.primary('Pulling remote changes...')).start();
      const pullRes = await pull();
      pullSpinner.stop();
      if (pullRes.success) {
        console.log(colors.success('✔ Pulled remote changes successfully.'));
      } else {
        console.log(colors.error('Pull failed.'));
        await handleGitError(pullRes);
      }
      break;
    }
    
    case 'stash': {
      try {
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
      } catch (e) {
        console.log(colors.info('\nStash cancelled.'));
        await runMenuLoop();
        return;
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
        console.log(colors.info('\nBumping cancelled.'));
        await runMenuLoop();
        return;
      }
      break;
    }
    
    case 'ai':
      try {
        await runAIInteractive();
      } catch (e) {
        await runMenuLoop();
        return;
      }
      break;
 
    case 'update': {
      try {
        const updateAnswer = await inquirer.prompt([
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
          await runMenuLoop();
          return;
        }
        await runSelfUpdate(updateAnswer.type === 'commit');
      } catch (e) {
        console.log(colors.info('\nUpdate cancelled.'));
        await runMenuLoop();
        return;
      }
      break;
    }
      
    case 'exit':
      console.log(colors.success('Goodbye!'));
      process.exit(0);
      break;
  }
}

let hasCheckedForUpdates = false;

async function runMenuLoop() {
  printBanner();
  
  if (!hasCheckedForUpdates) {
    hasCheckedForUpdates = true;
    try {
      const update = await checkForUpdates(getLocalVersion());
      if (update) {
        if (update.type === 'release') {
          console.log(colors.warning(`✨ A new version of devD is available: v${update.version}`));
        } else {
          console.log(colors.warning(`✨ A new commit update is available on main branch (hash: ${update.version})`));
        }
        
        const answer = await inquirer.prompt([
          {
            type: 'confirm',
            name: 'autoUpdate',
            message: 'Would you like to download and install the update now?',
            default: true
          }
        ]);
        if (answer.autoUpdate) {
          await runSelfUpdate(update.type === 'commit');
          return;
        }
        console.log();
      }
    } catch (err) {
      // Ignore
    }
  }
  
  const gitActive = await isGitRepository();
  const result = await showInteractiveMenu(gitActive);

  if (result.type === 'input') {
    const cmdInput = result.value;
    if (cmdInput.toLowerCase() === 'dir') {
      const targetDir = await navigateDirectories();
      if (targetDir) {
        process.chdir(targetDir);
        console.log(colors.success(`\n✔ Changed directory to: ${targetDir}\n`));
      }
      await runMenuLoop();
      return;
    } else if (cmdInput.toLowerCase().startsWith('dir ')) {
      const targetPath = cmdInput.slice(4).trim();
      const resolvedPath = path.resolve(targetPath);
      if (fs.existsSync(resolvedPath)) {
        process.chdir(resolvedPath);
        console.log(colors.success(`\n✔ Changed directory to: ${resolvedPath}\n`));
      } else {
        console.log(colors.error(`\n✖ Path does not exist: ${targetPath}\n`));
        await pressEnterToContinue();
      }
      await runMenuLoop();
      return;
    } else if (cmdInput.toLowerCase() === 'update' || cmdInput.toLowerCase() === 'u') {
      await runSelfUpdate(false);
      await pressEnterToContinue();
      await runMenuLoop();
      return;
    } else if (cmdInput.toLowerCase() === 'update --latest') {
      await runSelfUpdate(true);
      await pressEnterToContinue();
      await runMenuLoop();
      return;
    }
    
    const action = parseCommand(cmdInput);
    if (action) {
      if (GIT_ACTIONS.has(action)) {
        const gitActiveChecked = await ensureGitRepo();
        if (!gitActiveChecked) {
          await runMenuLoop();
          return;
        }
      }
      await handleMenuAction(action);
      
      const submenus = ['settings', 'preferences', 'git-controls', 'logs'];
      if (!submenus.includes(action)) {
        await pressEnterToContinue();
      }
      await runMenuLoop();
      return;
    } else {
      console.log(colors.warning(`\nUnknown command/shortcut: "${cmdInput}"`));
      console.log(colors.muted(`Available commands: status (s), commit (c), sync (y), stash, pop, bump (b), ai (a), update (u), update --latest, exit (q), dir [path]\n`));
      await pressEnterToContinue();
      await runMenuLoop();
      return;
    }
  } else {
    const action = result.value;
    if (GIT_ACTIONS.has(action)) {
      const gitActiveChecked = await ensureGitRepo();
      if (!gitActiveChecked) {
        await runMenuLoop();
        return;
      }
    }
    await handleMenuAction(action);
    
    const submenus = ['settings', 'preferences', 'git-controls', 'logs'];
    if (!submenus.includes(action)) {
      await pressEnterToContinue();
    }
    await runMenuLoop();
  }
}

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

async function pressEnterToContinue() {
  console.log();
  await inquirer.prompt([{
    type: 'input',
    name: 'continue',
    message: colors.muted('Press Enter to return to main menu...')
  }]);
}

program
  .name('devD')
  .description('Developer helper CLI companion for Git, stashing, & version bumping.')
  .version(getLocalVersion());

program
  .action(async () => {
    if (process.argv.slice(2).length === 0) {
      await runMenuLoop();
    }
  });

program
  .command('bump [type]')
  .alias('b')
  .description('Bump package version using bump-version (types: major, minor, patch, interactive)')
  .action(async (type) => {
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

program
  .command('run')
  .alias('r')
  .description('Run the app in this directory (auto-detects framework)')
  .action(async () => {
    await handleMenuAction('run-app');
  });

program
  .command('build')
  .description('Build the app in this directory (auto-detects framework)')
  .action(async () => {
    await handleMenuAction('build-app');
  });

program
  .command('tag')
  .alias('t')
  .description('Create and push a release Git tag')
  .action(async () => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    await createGitTag();
  });

program
  .command('release')
  .alias('rel')
  .description('Create a new GitHub Release')
  .action(async () => {
    const gitActive = await isGitRepository();
    if (!gitActive) {
      console.log(colors.error('Error: Not inside a Git repository.'));
      process.exit(1);
    }
    await createGitHubRelease();
  });

program.parse(process.argv);
