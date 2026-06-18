import fs from 'fs';
import path from 'path';
import inquirer from 'inquirer';
import { colors, printBanner } from './ui.js';

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

export async function navigateDirectories() {
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
