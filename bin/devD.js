#!/usr/bin/env node

import { Command } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import fs, { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path, { dirname, join } from 'path';
import { spawn } from 'child_process';

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
  getAheadBehind
} from '../src/git.js';
import { 
  printBanner, 
  showDashboard, 
  runCommitWizard, 
  handleGitError, 
  askGemini, 
  colors,
  checkForUpdates,
  getLocalVersion
} from '../src/ui.js';
import { parseCommand, showHelpMenu } from '../src/commands.js';
import { navigateDirectories } from '../src/navigator.js';
import { showInteractiveMenu } from '../src/menu.js';
import { runSelfUpdate, crossSpawn } from '../src/updater.js';

const program = new Command();

function runBumper(type) {
  return new Promise((resolve) => {
    const cmd = 'npx';
    const args = ['--yes', '-p', 'github:dwaipayanray95/bump-version', 'bump-version'];
    if (type && type !== 'interactive') {
      args.push(type.trim().toLowerCase());
    }
    
    console.log(colors.info(`\nRunning bump-version CLI from GitHub...`));
    
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }

    const child = crossSpawn(cmd, args, { stdio: 'inherit' });
    
    child.on('close', (code) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
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

async function showGitControlsMenu() {
  printBanner();
  console.log(colors.accent('⚙️  GIT CONTROLS MENU\n'));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select Git action:',
      choices: [
        { name: '✍️  Stage & Commit Wizard (Conventional)', value: 'commit' },
        { name: '📊 Show Repo Status Dashboard', value: 'status' },
        { name: '🔄 Sync Repo (Pull & Push)', value: 'sync' },
        { name: '📥 Stash Current Changes', value: 'stash' },
        { name: '📤 Pop Last Stash', value: 'stash-pop' },
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
        { name: '🔁 Restart devD CLI', value: 'restart' },
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

async function handleMenuAction(action) {
  console.clear();
  switch (action) {
    case 'settings':
      await showSettingsMenu();
      break;

    case 'git-controls':
      await showGitControlsMenu();
      break;

    case 'help':
      await showHelpMenu();
      break;

    case 'restart': {
      console.log(colors.primary('\nRestarting devD...'));
      if (process.stdin.isTTY) {
        process.stdin.pause();
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

  await pressEnterToContinue();
  await runMenuLoop();
}

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
    
    const action = parseCommand(cmdInput);
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
      console.log(colors.muted(`Available commands: status (s), commit (c), sync (y), stash, pop, bump (b), ai (a), update (u), update --latest, exit (q), dir [path]\n`));
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

program.parse(process.argv);
