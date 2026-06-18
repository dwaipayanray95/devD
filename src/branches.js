import readline from 'readline';
import inquirer from 'inquirer';
import { runGitCommand, getAheadBehind } from './git.js';
import { colors, printBanner } from './ui.js';
import { spawn } from 'child_process';

/**
 * Gets a clean list of all local and remote branches.
 * @returns {Promise<Array<{name: string, isCurrent: boolean, isRemote: boolean}>>}
 */
async function getAllBranches() {
  const res = await runGitCommand('branch -a');
  if (!res.success || !res.stdout) return [];
  
  const branches = res.stdout.split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      const isCurrent = line.startsWith('*');
      let name = line.replace(/^\*\s+/, '').trim();
      const isRemote = name.startsWith('remotes/');
      if (isRemote) {
        name = name.replace(/^remotes\//, '');
      }
      return { name, isCurrent, isRemote };
    });

  // De-duplicate branches by name (e.g. if local branch is same name as remote)
  const uniqueBranches = [];
  const namesSeen = new Set();
  
  // Prioritize current branch, then local, then remote
  branches.sort((a, b) => {
    if (a.isCurrent) return -1;
    if (b.isCurrent) return 1;
    if (a.isRemote && !b.isRemote) return 1;
    if (!a.isRemote && b.isRemote) return -1;
    return a.name.localeCompare(b.name);
  });

  for (const b of branches) {
    if (!namesSeen.has(b.name)) {
      namesSeen.add(b.name);
      uniqueBranches.push(b);
    }
  }

  return uniqueBranches;
}

export async function manageBranches() {
  let branches = await getAllBranches();
  if (branches.length === 0) {
    console.log(colors.warning('No branches found.'));
    return;
  }

  let filterQuery = '';
  let selectedIndex = 0;

  const getFilteredBranches = () => {
    if (!filterQuery) return branches;
    const q = filterQuery.toLowerCase();
    return branches.filter(b => b.name.toLowerCase().includes(q));
  };

  const renderUI = () => {
    printBanner();
    console.log(colors.accent('🌿 GIT BRANCH MANAGER'));
    console.log();
    console.log(`Search / Filter: ${colors.bright(filterQuery)}${colors.muted('_')}`);
    console.log(colors.muted('------------------------------------------------'));

    const filtered = getFilteredBranches();
    if (filtered.length === 0) {
      console.log(colors.warning('   No branches match search query.'));
    } else {
      // Limit display to fit the screen nicely (scrollable concept)
      const maxLines = 15;
      const startIdx = Math.max(0, Math.min(selectedIndex - Math.floor(maxLines / 2), filtered.length - maxLines));
      const endIdx = Math.min(startIdx + maxLines, filtered.length);

      if (selectedIndex >= filtered.length) {
        selectedIndex = Math.max(0, filtered.length - 1);
      }

      for (let i = startIdx; i < endIdx; i++) {
        const item = filtered[i];
        let branchStr = item.name;
        if (item.isCurrent) {
          branchStr = `${branchStr} (current)`;
        }
        if (item.isRemote) {
          branchStr = `${branchStr} [remote]`;
        }

        const prefix = i === selectedIndex ? colors.primary(' ❯ ') : '   ';
        let styledBranch = branchStr;
        if (item.isCurrent) {
          styledBranch = colors.success(branchStr);
        } else if (item.isRemote) {
          styledBranch = colors.muted(branchStr);
        } else {
          styledBranch = colors.bright(branchStr);
        }

        if (i === selectedIndex) {
          console.log(`${prefix}${colors.bright(styledBranch)}`);
        } else {
          console.log(`${prefix}${styledBranch}`);
        }
      }

      if (filtered.length > maxLines) {
        console.log(colors.muted(`   ... and ${filtered.length - maxLines} more branch(es) ...`));
      }
    }

    console.log(colors.muted('------------------------------------------------'));
    console.log(colors.muted('   [Arrows] Navigate  |  [Type] Filter  |  [Enter] Actions  |  [Esc] Back'));
  };

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
  }
  readline.emitKeypressEvents(process.stdin);

  renderUI();

  const selectedBranch = await new Promise((resolve) => {
    const onKeypress = (str, key) => {
      if (key) {
        if (key.ctrl && key.name === 'c') {
          cleanup();
          process.exit(0);
        }

        const filtered = getFilteredBranches();

        if (key.name === 'up') {
          if (filtered.length > 0) {
            selectedIndex = (selectedIndex - 1 + filtered.length) % filtered.length;
          }
          renderUI();
        } else if (key.name === 'down') {
          if (filtered.length > 0) {
            selectedIndex = (selectedIndex + 1) % filtered.length;
          }
          renderUI();
        } else if (key.name === 'return' || key.name === 'enter') {
          cleanup();
          if (filtered.length > 0 && selectedIndex < filtered.length) {
            resolve(filtered[selectedIndex]);
          } else {
            resolve(null);
          }
        } else if (key.name === 'escape' || key.name === 'esc') {
          cleanup();
          resolve(null);
        } else if (key.name === 'backspace') {
          filterQuery = filterQuery.slice(0, -1);
          selectedIndex = 0; // Reset index to top on filter change
          renderUI();
        } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          filterQuery += key.sequence;
          selectedIndex = 0; // Reset index to top on filter change
          renderUI();
        }
      }
    };

    function cleanup() {
      process.stdin.removeListener('keypress', onKeypress);
      if (process.stdin.isTTY) {
        process.stdin.setRawMode(false);
      }
    }

    process.stdin.on('keypress', onKeypress);
  });

  if (!selectedBranch) {
    return;
  }

  // Branch selected - show operations menu using Inquirer
  console.clear();
  printBanner();
  console.log(colors.accent(`🌿 OPTIONS FOR BRANCH: ${selectedBranch.name}\n`));

  const currentAheadBehind = await getAheadBehind();
  const currentBranchName = currentAheadBehind.branch;

  const choices = [
    { name: `🌿 Checkout to "${selectedBranch.name}"`, value: 'checkout' },
    { name: '➕ Create new branch from here', value: 'create' }
  ];

  if (!selectedBranch.isCurrent) {
    choices.push(
      { name: `❌ Delete branch "${selectedBranch.name}"`, value: 'delete' },
      { name: `🔀 Merge "${selectedBranch.name}" into current branch ("${currentBranchName}")`, value: 'merge' },
      { name: `🔄 Rebase current branch ("${currentBranchName}") onto "${selectedBranch.name}"`, value: 'rebase' }
    );
  }

  choices.push({ name: '↩ Cancel', value: 'cancel' });

  const answer = await inquirer.prompt([
    {
      type: 'list',
      name: 'action',
      message: 'Select action:',
      choices: choices,
      loop: false
    }
  ]);

  if (answer.action === 'cancel') {
    // Loop back to branch manager
    return manageBranches();
  }

  switch (answer.action) {
    case 'checkout': {
      console.log(colors.info(`\nChecking out to branch: ${selectedBranch.name}...`));
      // If remote branch, we might check it out by name directly
      let checkoutName = selectedBranch.name;
      if (selectedBranch.isRemote && selectedBranch.name.startsWith('origin/')) {
        checkoutName = selectedBranch.name.replace(/^origin\//, '');
      }
      const res = await runGitCommand(`checkout ${checkoutName}`);
      if (res.success) {
        console.log(colors.success(`✔ Checked out to branch "${checkoutName}".`));
      } else {
        console.log(colors.error(`✖ Failed to checkout branch: ${res.stderr || res.error}`));
      }
      break;
    }

    case 'create': {
      const createAnswer = await inquirer.prompt([
        {
          type: 'input',
          name: 'branchName',
          message: 'Enter new branch name:',
          validate: val => val.trim().length > 0 ? true : 'Branch name cannot be empty.'
        }
      ]);
      const newName = createAnswer.branchName.trim();
      console.log(colors.info(`\nCreating and checking out to branch "${newName}" starting from "${selectedBranch.name}"...`));
      
      let startPoint = selectedBranch.name;
      const res = await runGitCommand(`checkout -b ${newName} ${startPoint}`);
      if (res.success) {
        console.log(colors.success(`✔ Branch "${newName}" created and checked out successfully.`));
      } else {
        console.log(colors.error(`✖ Failed to create branch: ${res.stderr || res.error}`));
      }
      break;
    }

    case 'delete': {
      const confirmDelete = await inquirer.prompt([
        {
          type: 'confirm',
          name: 'confirm',
          message: `Are you sure you want to delete branch "${selectedBranch.name}"?`,
          default: false
        }
      ]);
      if (confirmDelete.confirm) {
        console.log(colors.info(`\nDeleting branch "${selectedBranch.name}"...`));
        // Force delete if standard delete fails (e.g. not merged)
        let res = await runGitCommand(`branch -d ${selectedBranch.name}`);
        if (!res.success) {
          const forceDelete = await inquirer.prompt([
            {
              type: 'confirm',
              name: 'force',
              message: `Standard delete failed (branch might not be merged). Force delete?`,
              default: false
            }
          ]);
          if (forceDelete.force) {
            res = await runGitCommand(`branch -D ${selectedBranch.name}`);
          }
        }
        if (res.success) {
          console.log(colors.success(`✔ Deleted branch "${selectedBranch.name}".`));
        } else {
          console.log(colors.error(`✖ Failed to delete branch: ${res.stderr || res.error}`));
        }
      }
      break;
    }

    case 'merge': {
      console.log(colors.info(`\nMerging branch "${selectedBranch.name}" into "${currentBranchName}"...`));
      const res = await runGitCommand(`merge ${selectedBranch.name}`);
      if (res.success) {
        console.log(colors.success(`✔ Merged successfully.`));
      } else {
        console.log(colors.error(`✖ Merge failed / has conflicts: ${res.stderr || res.error}`));
      }
      break;
    }

    case 'rebase': {
      console.log(colors.info(`\nRebasing current branch "${currentBranchName}" onto "${selectedBranch.name}"...`));
      const res = await runGitCommand(`rebase ${selectedBranch.name}`);
      if (res.success) {
        console.log(colors.success(`✔ Rebased successfully.`));
      } else {
        console.log(colors.error(`✖ Rebase failed / has conflicts: ${res.stderr || res.error}`));
      }
      break;
    }
  }
}
