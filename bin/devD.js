#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { exec } from 'child_process';
import { promisify } from 'util';
import fs, { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname, join } from 'path';
import { createRequire } from 'module';
import readline from 'readline';

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

function crossSpawn(cmd, args, options = {}) {
  if (process.platform === 'win32') {
    if (cmd === 'npm' || cmd === 'npx') {
      return spawn(`${cmd}.cmd`, args, options);
    }
  }
  return spawn(cmd, args, options);
}

function runBumper(type) {
  return new Promise((resolve) => {
    const cmd = 'npx';
    const args = ['--yes', '-p', 'github:dwaipayanray95/bump-version', 'bump-version'];
    if (type && type !== 'interactive') {
      args.push(type.trim().toLowerCase());
    }
    
    console.log(colors.info(`\nRunning bump-version CLI from GitHub...`));
    
    // Execute using npx to always fetch the latest commit directly from GitHub dynamically (without warnings)
    const child = crossSpawn(cmd, args, { stdio: 'inherit' });
    
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

function getWindowsDrives() {
  const drives = [];
  for (let i = 65; i <= 90; i++) {
    const drive = String.fromCharCode(i) + ':\\';
    try {
      if (fs.existsSync(drive)) {
        drives.push(drive);
      }
    } catch (e) {}
  }
  return drives;
}

async function navigateDirectories() {
  let currentDir = process.cwd();
  const isWin = process.platform === 'win32';
  
  while (true) {
    printBanner();
    console.log(colors.accent('📁  DIRECTORY NAVIGATOR'));
    console.log(`   Current Path: ${colors.bright(currentDir)}\n`);
    console.log(colors.muted('   [Arrows] Navigate  |  [Enter] Open Folder  |  [Space] Select & CD'));
    console.log(colors.muted('   [Esc] Cancel and return\n'));

    let dirs = [];
    try {
      const entries = fs.readdirSync(currentDir, { withFileTypes: true });
      dirs = entries
        .filter(entry => entry.isDirectory() && !entry.name.startsWith('.'))
        .map(entry => entry.name)
        .sort();
    } catch (err) {
      console.log(colors.error(`   Error reading directory: ${err.message}`));
    }

    const choices = [];
    
    // Parent directory option
    const parentDir = path.dirname(currentDir);
    if (parentDir !== currentDir) {
      choices.push({ name: '⬆️  .. (Go Up)', value: 'UP' });
    } else if (isWin) {
      choices.push({ name: '💾 Choose Drive', value: 'DRIVES' });
    }

    dirs.forEach(d => {
      choices.push({ name: `📁 ${d}`, value: d });
    });

    choices.unshift({ name: `📌 Select current directory: ${currentDir}`, value: 'CONFIRM' });

    let selection;
    let spacePressed = false;
    let escPressed = false;

    const keypressHandler = (ch, key) => {
      if (key) {
        if (key.name === 'space') {
          spacePressed = true;
          if (uiPrompt && uiPrompt.ui) {
            uiPrompt.ui.rl.emit('line');
          }
        } else if (key.name === 'escape' || key.name === 'esc') {
          escPressed = true;
          if (uiPrompt && uiPrompt.ui) {
            uiPrompt.ui.rl.emit('line');
          }
        }
      }
    };

    process.stdin.on('keypress', keypressHandler);

    let uiPrompt;
    try {
      const promptPromise = inquirer.prompt([
        {
          type: 'list',
          name: 'folder',
          message: 'Navigate:',
          choices,
          loop: false,
          pageSize: process.stdout.rows ? Math.max(10, process.stdout.rows - 10) : 15
        }
      ]);
      uiPrompt = promptPromise;
      const answer = await promptPromise;
      selection = answer.folder;
    } catch (err) {
      // Catch prompt interruptions
    } finally {
      process.stdin.removeListener('keypress', keypressHandler);
    }

    if (escPressed) {
      return null;
    }

    if (spacePressed) {
      if (selection && selection !== 'CONFIRM' && selection !== 'UP' && selection !== 'DRIVES') {
        return path.join(currentDir, selection);
      }
      return currentDir;
    }

    if (!selection) {
      return null;
    }

    if (selection === 'CONFIRM') {
      return currentDir;
    }

    if (selection === 'UP') {
      currentDir = parentDir;
    } else if (selection === 'DRIVES') {
      const drives = getWindowsDrives();
      let driveAnswer;
      try {
        driveAnswer = await inquirer.prompt([
          {
            type: 'list',
            name: 'drive',
            message: 'Select Drive:',
            choices: drives.map(d => ({ name: d, value: d })),
            loop: false
          }
        ]);
        currentDir = driveAnswer.drive;
      } catch (err) {
        // Handle cancel
      }
    } else {
      currentDir = path.join(currentDir, selection);
    }
  }
}

async function handleMenuAction(action) {
  switch (action) {
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
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
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
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
        await runMenuLoop();
        return;
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
          await runMenuLoop();
          return;
        }
        await runSelfUpdate(updateAnswer.type === 'commit');
      } catch (e) {
        if (e.message !== 'ESCAPE_CANCELLED') throw e;
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

  await pressEnterToContinue();
  await runMenuLoop();
}

/**
 * Custom interactive menu component combining a text input field and a selectable list.
 */
async function showInteractiveMenu(gitActive) {
  const items = gitActive ? [
    { name: '📊 Show Repo Status Dashboard', value: 'status' },
    { name: '✍️  Stage & Commit Wizard (Conventional)', value: 'commit' },
    { name: '🔄 Sync Repo (Pull & Push)', value: 'sync' },
    { name: '📥 Stash Current Changes', value: 'stash' },
    { name: '📤 Pop Last Stash', value: 'stash-pop' },
    { name: '🚀 Bump Version', value: 'bump' },
    { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
    { name: '✨ Update devD CLI', value: 'update' },
    { name: '❌ Exit', value: 'exit' }
  ] : [
    { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
    { name: '❌ Exit', value: 'exit' }
  ];

  let inputBuffer = '';
  let selectedIndex = 0;
  
  const wasRaw = process.stdin.isRaw;
  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  readline.emitKeypressEvents(process.stdin);
  
  const renderUI = (buffer, sIndex) => {
    printBanner();
    console.log(colors.accent('📋  SELECTABLE MENU'));
    items.forEach((item, idx) => {
      if (idx === sIndex) {
        console.log(colors.primary(`   ❯ ${colors.bright(item.name)}`));
      } else {
        console.log(`     ${colors.muted(item.name)}`);
      }
    });
    console.log();
    console.log(colors.accent('⌨️  COMMAND / SHORTCUT'));
    console.log(`   devD > ${colors.bright(buffer)}${colors.muted('_')}`);
    console.log();
    console.log(colors.muted('   [Arrows] Navigate menu  |  [Type] Custom command / dir path  |  [Enter] Confirm'));
  };

  renderUI(inputBuffer, selectedIndex);

  return new Promise((resolve) => {
    const onKeypress = (str, key) => {
      if (key) {
        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.exit(0);
        }
        
        if (key.name === 'up') {
          selectedIndex = (selectedIndex - 1 + items.length) % items.length;
          renderUI(inputBuffer, selectedIndex);
        } else if (key.name === 'down') {
          selectedIndex = (selectedIndex + 1) % items.length;
          renderUI(inputBuffer, selectedIndex);
        } else if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          if (inputBuffer.trim()) {
            resolve({ type: 'input', value: inputBuffer.trim() });
          } else {
            resolve({ type: 'menu', value: items[selectedIndex].value });
          }
        } else if (key.name === 'escape' || key.name === 'esc') {
          cleanup();
          resolve({ type: 'menu', value: 'exit' });
        } else if (key.name === 'backspace') {
          inputBuffer = inputBuffer.slice(0, -1);
          renderUI(inputBuffer, selectedIndex);
        } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          inputBuffer += key.sequence;
          renderUI(inputBuffer, selectedIndex);
        }
      }
    };

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(wasRaw);
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}

/**
 * Main interactive console menu loop.
 */
async function runMenuLoop() {
  printBanner();
  await checkForUpdates(getLocalVersion());
  
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
    
    // Parse commands and shortcuts
    const lowerCmd = cmdInput.toLowerCase();
    let action = null;
    if (lowerCmd === 'status' || lowerCmd === 's' || lowerCmd === 'dashboard') action = 'status';
    else if (lowerCmd === 'commit' || lowerCmd === 'c' || lowerCmd === 'wizard') action = 'commit';
    else if (lowerCmd === 'sync' || lowerCmd === 'y') action = 'sync';
    else if (lowerCmd === 'stash') action = 'stash';
    else if (lowerCmd === 'stash-pop' || lowerCmd === 'pop') action = 'stash-pop';
    else if (lowerCmd === 'bump' || lowerCmd === 'b') action = 'bump';
    else if (lowerCmd === 'ai' || lowerCmd === 'a' || lowerCmd === 'gemini') action = 'ai';
    else if (lowerCmd === 'update' || lowerCmd === 'u') action = 'update';
    else if (lowerCmd === 'exit' || lowerCmd === 'q' || lowerCmd === 'quit') action = 'exit';
    
    if (action) {
      if (action !== 'ai' && action !== 'update' && action !== 'exit') {
        const gitActiveChecked = await ensureGitRepo();
        if (!gitActiveChecked) {
          await runMenuLoop();
          return;
        }
      }
      await handleMenuAction(action);
      return;
    } else {
      console.log(colors.warning(`\nUnknown command/shortcut: "${cmdInput}"`));
      console.log(colors.muted(`Available commands: status (s), commit (c), sync (y), stash, pop, bump (b), ai (a), update (u), exit (q), dir [path]\n`));
      await pressEnterToContinue();
      await runMenuLoop();
      return;
    }
  } else {
    const action = result.value;
    if (action !== 'ai' && action !== 'update' && action !== 'exit') {
      const gitActiveChecked = await ensureGitRepo();
      if (!gitActiveChecked) {
        await runMenuLoop();
        return;
      }
    }
    await handleMenuAction(action);
  }
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
    const child = crossSpawn(cmd, args, { stdio: 'inherit' });
    
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

program.parse(process.argv);
