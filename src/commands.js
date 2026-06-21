import inquirer from 'inquirer';
import { colors, printBanner } from './ui.js';

export const COMMANDS_HELP = [
  { command: 'run', shortcuts: ['dev'], desc: 'Run the project (auto-detected framework)' },
  { command: 'build', shortcuts: [], desc: 'Build the project (auto-detected framework)' },
  { command: 'status', shortcuts: ['s', 'dashboard'], desc: 'Show repository status dashboard' },
  { command: 'commit', shortcuts: ['c', 'wizard'], desc: 'Run conventional commit wizard' },
  { command: 'sync', shortcuts: ['y'], desc: 'Pull remote changes and push local commits' },
  { command: 'pull', shortcuts: [], desc: 'Pull remote changes (git pull --rebase)' },
  { command: 'stash', shortcuts: [], desc: 'Save current modifications to stash stack' },
  { command: 'pop', shortcuts: ['stash-pop'], desc: 'Restore/apply the last stashed modifications' },
  { command: 'bump', shortcuts: ['b'], desc: 'Bump package version dynamically using bump-version' },
  { command: 'tag', shortcuts: ['t'], desc: 'Create and push a release Git tag' },
  { command: 'release', shortcuts: ['rel'], desc: 'Create a new GitHub Release' },
  { command: 'ai', shortcuts: ['a', 'gemini'], desc: 'Query Gemini AI assistant directly' },
  { command: 'update', shortcuts: ['u'], desc: 'Update devD CLI from latest release tag' },
  { command: 'update --latest', shortcuts: [], desc: 'Update devD CLI from latest main branch commit' },
  { command: 'dir', shortcuts: [], desc: 'Open interactive directory navigator' },
  { command: 'dir <path>', shortcuts: [], desc: 'Change working directory to specific path' },
  { command: 'help', shortcuts: ['h', '?'], desc: 'Show command help list and descriptions' },
  { command: 'restart', shortcuts: ['r'], desc: 'Restart the devD CLI companion' },
  { command: 'exit', shortcuts: ['q', 'quit'], desc: 'Exit the devD companion CLI' }
];

export function parseCommand(cmdInput) {
  const lowerCmd = cmdInput.trim().toLowerCase();
  if (lowerCmd === 'run' || lowerCmd === 'dev') return 'run-app';
  if (lowerCmd === 'build') return 'build-app';
  if (lowerCmd === 'status' || lowerCmd === 's' || lowerCmd === 'dashboard') return 'status';
  if (lowerCmd === 'commit' || lowerCmd === 'c' || lowerCmd === 'wizard') return 'commit';
  if (lowerCmd === 'sync' || lowerCmd === 'y') return 'sync';
  if (lowerCmd === 'pull') return 'pull';
  if (lowerCmd === 'stash') return 'stash';
  if (lowerCmd === 'stash-pop' || lowerCmd === 'pop') return 'stash-pop';
  if (lowerCmd === 'bump' || lowerCmd === 'b') return 'bump';
  if (lowerCmd === 'tag' || lowerCmd === 't') return 'tag';
  if (lowerCmd === 'release' || lowerCmd === 'rel') return 'release';
  if (lowerCmd === 'ai' || lowerCmd === 'a' || lowerCmd === 'gemini') return 'ai';
  if (lowerCmd === 'update' || lowerCmd === 'u') return 'update';
  if (lowerCmd === 'help' || lowerCmd === 'h' || lowerCmd === '?') return 'help';
  if (lowerCmd === 'restart' || lowerCmd === 'r') return 'restart';
  if (lowerCmd === 'exit' || lowerCmd === 'q' || lowerCmd === 'quit') return 'exit';
  return null;
}

export async function showHelpMenu() {
  printBanner();
  console.log(colors.accent('ℹ️  HELP & DOCUMENTATION\n'));
  
  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'category',
      message: 'Select help category:',
      choices: [
        { name: '📖 List CLI Commands & Shortcuts', value: 'commands' },
        { name: '↩ Return to main menu', value: 'back' }
      ],
      loop: false
    }
  ]);

  if (answer.category === 'commands') {
    printBanner();
    console.log(colors.accent('📋  AVAILABLE COMMANDS & SHORTCUTS\n'));
    
    COMMANDS_HELP.forEach(item => {
      const shortcutsText = item.shortcuts.length ? ` (shortcuts: ${item.shortcuts.join(', ')})` : '';
      console.log(`   ${colors.bright(item.command)}${colors.muted(shortcutsText)}`);
      console.log(`   ${colors.success('↳')} ${item.desc}\n`);
    });
    
    await pressEnterToContinue();
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
