import readline from 'readline';
import inquirer from 'inquirer';
import ora from 'ora';
import { 
  colors, 
  printBanner, 
  promptWithEscape, 
  askGemini, 
  getGeminiApiKey 
} from './ui.js';
import { 
  isGitRepository, 
  runGitCommand, 
  pull, 
  push, 
  stashSave, 
  stashPop, 
  getAheadBehind, 
  getRecentCommits, 
  getChangedFiles, 
  stageFiles, 
  unstageFiles, 
  commit, 
  getLocalBranches,
  getStashes
} from './git.js';

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

/**
 * Visual branch manager TUI with live search filtering.
 */
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
          selectedIndex = 0;
          renderUI();
        } else if (key.sequence && key.sequence.length === 1 && !key.ctrl && !key.meta) {
          filterQuery += key.sequence;
          selectedIndex = 0;
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

  try {
    const answer = await promptWithEscape([
      {
        type: 'list',
        name: 'action',
        message: 'Select action:',
        choices: choices,
        loop: false
      }
    ]);

    if (answer.action === 'cancel') {
      return manageBranches();
    }

    switch (answer.action) {
      case 'checkout': {
        console.log(colors.info(`\nChecking out to branch: ${selectedBranch.name}...`));
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
        const createAnswer = await promptWithEscape([
          {
            type: 'input',
            name: 'branchName',
            message: 'Enter new branch name:',
            validate: val => val.trim().length > 0 ? true : 'Branch name cannot be empty.'
          }
        ]);
        const newName = createAnswer.branchName.trim();
        console.log(colors.info(`\nCreating and checking out to branch "${newName}" starting from "${selectedBranch.name}"...`));
        const res = await runGitCommand(`checkout -b ${newName} ${selectedBranch.name}`);
        if (res.success) {
          console.log(colors.success(`✔ Branch "${newName}" created and checked out successfully.`));
        } else {
          console.log(colors.error(`✖ Failed to create branch: ${res.stderr || res.error}`));
        }
        break;
      }

      case 'delete': {
        const confirmDelete = await promptWithEscape([
          {
            type: 'confirm',
            name: 'confirm',
            message: `Are you sure you want to delete branch "${selectedBranch.name}"?`,
            default: false
          }
        ]);
        if (confirmDelete.confirm) {
          console.log(colors.info(`\nDeleting branch "${selectedBranch.name}"...`));
          let res = await runGitCommand(`branch -d ${selectedBranch.name}`);
          if (!res.success) {
            const forceDelete = await promptWithEscape([
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
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.info('\nAction cancelled. Returning to branch list...'));
      // Wait a moment so the console message is readable, then loop back
      await new Promise(r => setTimeout(r, 800));
      return manageBranches();
    }
    throw error;
  }
}

/**
 * Colorized git repository status dashboard.
 */
export async function showDashboard() {
  const spinner = ora(colors.primary('Loading Repository Status...')).start();
  try {
    const aheadBehind = await getAheadBehind();
    const changedFiles = await getChangedFiles();
    const stashes = await getStashes();
    const commits = await getRecentCommits(3);
    spinner.stop();

    const branchText = colors.bright(aheadBehind.branch);
    let syncText = colors.success('Up to date');
    if (!aheadBehind.hasUpstream) {
      syncText = colors.warning('No remote upstream tracking branch');
    } else if (aheadBehind.ahead > 0 || aheadBehind.behind > 0) {
      const parts = [];
      if (aheadBehind.ahead > 0) parts.push(colors.info(`↑ ${aheadBehind.ahead} commit(s) ahead`));
      if (aheadBehind.behind > 0) parts.push(colors.error(`↓ ${aheadBehind.behind} commit(s) behind`));
      syncText = parts.join(', ');
    }
    
    console.log(colors.accent('◉  BRANCH STATUS'));
    console.log(`   Branch:  ${branchText}`);
    console.log(`   Sync:    ${syncText}`);
    console.log();

    console.log(colors.accent('◉  WORKING TREE CHANGES'));
    if (changedFiles.length === 0) {
      console.log(colors.muted('   Working tree clean. Nothing to commit.'));
    } else {
      const staged = changedFiles.filter(f => f.state === 'staged');
      const unstaged = changedFiles.filter(f => f.state === 'unstaged' || f.state === 'both');
      const conflicts = changedFiles.filter(f => f.state === 'conflict');

      if (conflicts.length > 0) {
        console.log(colors.error('   ⚠️  Conflicts (Resolve before committing):'));
        conflicts.forEach(f => console.log(`      ${colors.error('✗')} ${f.path}`));
      }

      if (staged.length > 0) {
        console.log(colors.success('   Staged for commit:'));
        staged.forEach(f => console.log(`      ${colors.success('✔')} [${f.type}] ${f.path}`));
      }

      if (unstaged.length > 0) {
        console.log(colors.warning('   Unstaged changes:'));
        unstaged.forEach(f => console.log(`      ${colors.warning('✎')} [${f.type}] ${f.path}`));
      }
    }
    console.log();

    if (stashes.length > 0) {
      console.log(colors.accent(`◉  STASH STACK (${stashes.length})`));
      stashes.slice(0, 3).forEach((s, idx) => console.log(`   stash@{${idx}}: ${colors.muted(s.substring(s.indexOf(':') + 1).trim())}`));
      if (stashes.length > 3) console.log(colors.muted(`   ... and ${stashes.length - 3} more`));
      console.log();
    }

    console.log(colors.accent('◉  RECENT COMMIT HISTORY'));
    if (commits.length === 0) {
      console.log(colors.muted('   No commits found.'));
    } else {
      commits.forEach(c => {
        console.log(`   ${colors.primary(c.hash)} ${colors.bright(c.message)} ${colors.muted(`(${c.author})`)}`);
      });
    }
    console.log();

  } catch (error) {
    spinner.stop();
    console.log(colors.error('Error loading dashboard: ' + error.message));
  }
}

/**
 * Conventional Commit Wizard workflow.
 */
export async function runCommitWizard() {
  try {
    printBanner();
    
    const stageSpinner = ora(colors.primary('Staging all changes...')).start();
    await stageFiles('all');
    stageSpinner.succeed(colors.success('Staged all changes successfully.'));

    const activeChanges = await getChangedFiles();
    const currentStaged = activeChanges.filter(f => f.state === 'staged');
    if (currentStaged.length === 0) {
      console.log(colors.warning('\nNo changes detected in working tree. Nothing to commit.'));
      return;
    }

    const commitOptionsAnswer = await promptWithEscape([
      {
        type: 'list',
        name: 'method',
        message: 'Choose commit message creation method:',
        choices: [
          { name: 'Write it myself (Conventional Commit Wizard)', value: 'manual' },
          { name: '🤖 Let Gemini draft it from git diff', value: 'ai' },
          { name: '↩ Back to main menu', value: 'back' }
        ],
        loop: false
      }
    ]);

    if (commitOptionsAnswer.method === 'back') {
      return;
    }

    let commitMessage = '';

    if (commitOptionsAnswer.method === 'ai') {
      const apiKey = getGeminiApiKey();
      if (!apiKey) {
        console.log(colors.error('\nAPI Key Error: GEMINI_API_KEY is not set. Falling back to manual commit...'));
        commitOptionsAnswer.method = 'manual';
      } else {
        const spinner = ora(colors.primary('Generating diff...')).start();
        const diffRes = await runGitCommand('diff --cached');
        spinner.stop();

        if (!diffRes.success || !diffRes.stdout) {
          console.log(colors.warning('Could not extract git diff. Falling back to manual...'));
          commitOptionsAnswer.method = 'manual';
        } else {
          let diffContent = diffRes.stdout;
          if (diffContent.length > 8000) {
            diffContent = diffContent.substring(0, 8000) + '\n[DIFF TRUNCATED...]';
          }

          try {
            const aiPrompt = `Write a short, professional Conventional Commit message describing the following Git diff. 
Follow conventional commits specification strictly (e.g. feat(parser): add options, or fix(auth): resolve JWT expiry).
The commit message MUST be a single line under 72 characters. 
Do not output code blocks, quotes, markdown formatting, or any introductory text. Just output the commit message itself.

GIT DIFF:
${diffContent}`;

            const suggestion = await askGemini(aiPrompt);
            console.log(`\n🤖 ${colors.primary('Gemini Suggested Commit Message:')}`);
            console.log(colors.bright(`   "${suggestion}"`));
            console.log();

            const approvalAnswer = await promptWithEscape([
              {
                type: 'list',
                name: 'action',
                message: 'What would you like to do with this message?',
                choices: [
                  { name: 'Use it', value: 'use' },
                  { name: 'Edit it', value: 'edit' },
                  { name: 'Discard and write conventional commit manually', value: 'discard' }
                ],
                loop: false
              }
            ]);

            if (approvalAnswer.action === 'use') {
              commitMessage = suggestion;
            } else if (approvalAnswer.action === 'edit') {
              const editAnswer = await promptWithEscape([
                {
                  type: 'input',
                  name: 'message',
                  message: 'Edit commit message:',
                  default: suggestion
                }
              ]);
              commitMessage = editAnswer.message;
            } else {
              commitOptionsAnswer.method = 'manual';
            }
          } catch (err) {
            console.log(colors.error(`AI message generation failed: ${err.message}`));
            console.log(colors.warning('Falling back to manual commit...'));
            commitOptionsAnswer.method = 'manual';
          }
        }
      }
    }

    if (commitOptionsAnswer.method === 'manual') {
      const manualAnswers = await promptWithEscape([
        {
          type: 'list',
          name: 'type',
          message: 'Select the type of change you are committing:',
          choices: [
            { name: 'custom:   A custom format commit (no prefix/scope)', value: 'custom' },
            { name: 'feat:     A new feature', value: 'feat' },
            { name: 'fix:      A bug fix', value: 'fix' },
            { name: 'docs:     Documentation only changes', value: 'docs' },
            { name: 'style:    Formatting, white-space, semi-colons (no code changes)', value: 'style' },
            { name: 'refactor: A code change that neither fixes a bug nor adds a feature', value: 'refactor' },
            { name: 'perf:     A code change that improves performance', value: 'perf' },
            { name: 'test:     Adding missing tests or correcting existing tests', value: 'test' },
            { name: 'chore:    Changes to the build process or auxiliary tools and libraries', value: 'chore' },
            { name: 'ci:       CI configuration files and scripts', value: 'ci' },
            { name: 'revert:   Reverts a previous commit', value: 'revert' }
          ],
          loop: false,
          pageSize: process.stdout.rows ? Math.max(15, process.stdout.rows - 8) : 15
        },
        {
          type: 'input',
          name: 'scope',
          message: 'What is the scope of this change? (e.g. component/file, press Enter to skip):',
          filter: val => val.trim().toLowerCase(),
          when: (answers) => answers.type !== 'custom'
        },
        {
          type: 'input',
          name: 'subject',
          message: 'Write a short description of the changes (imperative, lower-case):',
          validate: val => val.trim().length > 0 ? true : 'Subject is required.'
        },
        {
          type: 'input',
          name: 'body',
          message: 'Provide a longer description of the changes (optional, press Enter to skip):',
          filter: val => val.trim()
        }
      ]);

      if (manualAnswers.type === 'custom') {
        commitMessage = manualAnswers.subject;
      } else {
        const scopeStr = manualAnswers.scope ? `(${manualAnswers.scope})` : '';
        commitMessage = `${manualAnswers.type}${scopeStr}: ${manualAnswers.subject}`;
      }
      if (manualAnswers.body) {
        commitMessage += `\n\n${manualAnswers.body}`;
      }
    }

    const commitSpinner = ora(colors.primary('Creating commit...')).start();
    const commitRes = await commit(commitMessage);
    commitSpinner.stop();

    if (commitRes.success) {
      console.log(colors.success(`\n✔ Commit created successfully: "${commitMessage}"`));
      
      const pushAnswer = await promptWithEscape([
        {
          type: 'confirm',
          name: 'push',
          message: 'Would you like to push these changes to the remote branch now?',
          default: true
        }
      ]);

      if (pushAnswer.push) {
        const branches = await getLocalBranches();
        const currentBranch = branches.find(b => b.current)?.name || 'main';
        
        const branchAnswer = await promptWithEscape([
          {
            type: 'list',
            name: 'targetBranch',
            message: 'Select target branch to push to:',
            choices: [
              ...branches.map(b => ({ name: b.current ? `${b.name} (current)` : b.name, value: b.name })),
              { name: '✍️  Type a custom branch name...', value: 'custom' }
            ],
            default: currentBranch,
            loop: false,
            pageSize: process.stdout.rows ? Math.max(15, process.stdout.rows - 8) : 15
          }
        ]);

        let selectedBranch = branchAnswer.targetBranch;
        if (selectedBranch === 'custom') {
          const customAnswer = await promptWithEscape([
            {
              type: 'input',
              name: 'customBranch',
              message: 'Enter target branch name:',
              validate: val => val.trim().length > 0 ? true : 'Branch name is required.'
            }
          ]);
          selectedBranch = customAnswer.customBranch.trim();
        }

        const pushSpinner = ora(colors.primary(`Pushing to origin ${selectedBranch}...`)).start();
        const pushRes = await runGitCommand(`push origin ${selectedBranch}`);
        pushSpinner.stop();

        if (pushRes.success) {
          console.log(colors.success(`✔ Successfully pushed to origin/${selectedBranch}.`));
        } else {
          console.log(colors.error('\n✖ Push failed:'));
          console.log(colors.warning(pushRes.stderr || pushRes.error));
          await handleGitError(pushRes);
        }
      }
    } else {
      console.log(colors.error('\n✖ Commit failed:'));
      console.log(colors.warning(commitRes.stderr || commitRes.error));
      await handleGitError(commitRes);
    }
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.info('\nAction cancelled. Returning to main menu...'));
      return 'escape';
    }
    throw error;
  }
}

/**
 * Diagnostics & recovery interface for Git exceptions.
 */
export async function handleGitError(res) {
  const errorText = res.stderr || res.error || '';
  console.log();
  console.log(colors.accent('🔧  DEVD DIAGNOSTICS & RECOVERY'));
  
  let suggestion = 'Check repository state manually.';
  let options = [{ name: 'Ignore and return to main menu', value: 'exit' }];

  if (errorText.includes('diverged') || errorText.includes('behind') || errorText.includes('non-fast-forward')) {
    suggestion = 'Your local branch is behind the remote. You should pull and sync changes.';
    options.unshift(
      { name: 'Pull changes (git pull --rebase)', value: 'pull' },
      { name: 'Stash changes, Pull, and Pop stash', value: 'stash-pull-pop' }
    );
  } else if (errorText.includes('conflict') || errorText.includes('merge failed')) {
    suggestion = 'There are unresolved conflicts in your working directory.';
    options.unshift(
      { name: 'Abort pull/merge rebase (git rebase --abort)', value: 'rebase-abort' }
    );
  } else if (errorText.includes('nothing to commit') || errorText.includes('no changes added to commit')) {
    suggestion = 'No files are currently staged. Ensure you stage files before committing.';
    options.unshift(
      { name: 'Go to Git Commit Wizard (includes staging)', value: 'commit-wizard' }
    );
  }

  console.log(`   Issue:      ${colors.warning(suggestion)}`);
  console.log(`   Details:    ${colors.muted(errorText.substring(0, 300))}`);
  console.log();

  const recoveryAnswer = await promptWithEscape([
    {
      type: 'list',
      name: 'action',
      message: 'Choose a recovery action:',
      choices: options,
      loop: false
    }
  ]);

  if (recoveryAnswer.action === 'pull') {
    const spinner = ora('Pulling with rebase...').start();
    const pullRes = await runGitCommand('pull --rebase');
    spinner.stop();
    if (pullRes.success) {
      console.log(colors.success('✔ Pulled successfully.'));
    } else {
      console.log(colors.error('✖ Pull failed with rebase conflicts. Use resolving tools.'));
    }
  } else if (recoveryAnswer.action === 'stash-pull-pop') {
    const spinner = ora('Stashing changes...').start();
    const stashRes = await runGitCommand('stash push -m "Auto stash by devD before sync"');
    spinner.stop();
    
    if (stashRes.success) {
      const pullSpinner = ora('Pulling...').start();
      const pullRes = await runGitCommand('pull --rebase');
      pullSpinner.stop();
      
      const popSpinner = ora('Restoring stashed changes...').start();
      const popRes = await runGitCommand('stash pop');
      popSpinner.stop();
      
      if (pullRes.success && popRes.success) {
        console.log(colors.success('✔ Stashed, pulled, and restored changes successfully!'));
      } else {
        console.log(colors.warning('⚠ Pull or restore completed with warnings. Check git status.'));
      }
    }
  } else if (recoveryAnswer.action === 'rebase-abort') {
    await runGitCommand('rebase --abort');
    console.log(colors.success('✔ Rebase aborted successfully.'));
  } else if (recoveryAnswer.action === 'commit-wizard') {
    await runCommitWizard();
  }
}

/**
 * Git Submenu display and router loop.
 */
export async function showGitControlsMenu(onActionCallback) {
  printBanner();
  console.log(colors.accent('⚙️  GIT CONTROLS MENU\n'));
  
  try {
    const answer = await promptWithEscape([
      {
        type: 'list',
        name: 'action',
        message: 'Select Git action:',
        choices: [
          { name: '✍️  Stage & Commit Wizard (Conventional)', value: 'commit' },
          { name: '🌿 Git Branch Manager', value: 'branch-manager' },
          { name: '🏷️  Create & Push Release Tag', value: 'tag' },
          { name: '🚀 Create GitHub Release', value: 'release' },
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
      return 'back';
    }
    
    await onActionCallback(answer.action);
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      return 'back';
    }
    throw error;
  }
}

/**
 * Interactive Git release tagging wizard.
 */
export async function createGitTag() {
  try {
    printBanner();
    console.log(colors.accent('🏷️  CREATE & PUSH RELEASE TAG\n'));

    const answers = await promptWithEscape([
      {
        type: 'input',
        name: 'tagName',
        message: 'Enter tag name (e.g. v1.0.0):',
        validate: val => val.trim().length > 0 ? true : 'Tag name is required.'
      },
      {
        type: 'input',
        name: 'message',
        message: 'Enter tag message / annotation (optional):',
        filter: val => val.trim()
      },
      {
        type: 'confirm',
        name: 'pushTag',
        message: 'Would you like to push this tag to the remote origin?',
        default: true
      }
    ]);

    const tagName = answers.tagName.trim();
    const tagMsg = answers.message;
    
    const tagSpinner = ora(colors.primary(`Creating tag ${tagName}...`)).start();
    const tagArgs = tagMsg ? ['tag', '-a', tagName, '-m', tagMsg] : ['tag', tagName];
    const tagRes = await runGitCommand(tagArgs);
    tagSpinner.stop();

    if (tagRes.success) {
      console.log(colors.success(`\n✔ Tag "${tagName}" created successfully.`));
      
      if (answers.pushTag) {
        const pushSpinner = ora(colors.primary(`Pushing tag ${tagName} to origin...`)).start();
        const pushRes = await runGitCommand(['push', 'origin', tagName]);
        pushSpinner.stop();
        
        if (pushRes.success) {
          console.log(colors.success(`✔ Tag "${tagName}" pushed successfully to origin.`));
        } else {
          console.log(colors.error(`✖ Failed to push tag: ${pushRes.stderr || pushRes.error}`));
        }
      }
    } else {
      console.log(colors.error(`✖ Failed to create tag: ${tagRes.stderr || tagRes.error}`));
    }
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.info('\nTagging cancelled.'));
    } else {
      throw error;
    }
  }
}

/**
 * Parse owner and repo from origin remote URL.
 */
export async function getGitHubRepoDetails() {
  const res = await runGitCommand('remote get-url origin');
  if (!res.success || !res.stdout) return null;
  const url = res.stdout.trim();
  const match = url.match(/github\.com[:/]([^/]+)\/([^.]+)(?:\.git)?/);
  if (match) {
    return {
      owner: match[1],
      repo: match[2].replace(/\.git$/, '')
    };
  }
  return null;
}

/**
 * Interactive GitHub Release creation wizard.
 */
export async function createGitHubRelease() {
  try {
    printBanner();
    console.log(colors.accent('🚀 CREATE GITHUB RELEASE\n'));

    const repoInfo = await getGitHubRepoDetails();
    if (!repoInfo) {
      console.log(colors.error('✖ Could not resolve GitHub repository details from git remote origin URL.'));
      console.log(colors.muted('Ensure your remote origin is set to a GitHub URL.'));
      return;
    }

    const currentAheadBehind = await getAheadBehind();
    const currentBranch = currentAheadBehind.branch;

    const answers = await promptWithEscape([
      {
        type: 'input',
        name: 'tagName',
        message: 'Enter tag name (e.g. v1.0.0):',
        validate: val => val.trim().length > 0 ? true : 'Tag name is required.'
      },
      {
        type: 'input',
        name: 'title',
        message: 'Enter release title:',
        default: (answers) => `Release ${answers.tagName}`
      },
      {
        type: 'input',
        name: 'targetBranch',
        message: 'Enter target branch or commit SHA:',
        default: currentBranch
      },
      {
        type: 'input',
        name: 'body',
        message: 'Enter release notes / description (optional):',
        filter: val => val.trim()
      },
      {
        type: 'confirm',
        name: 'draft',
        message: 'Is this a draft release?',
        default: false
      },
      {
        type: 'confirm',
        name: 'prerelease',
        message: 'Is this a pre-release (beta/alpha)?',
        default: false
      }
    ]);

    let token = process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
    if (!token) {
      console.log(colors.warning('\n⚠️  No GITHUB_TOKEN or GH_TOKEN found in environment variables.'));
      const tokenAnswer = await promptWithEscape([
        {
          type: 'password',
          name: 'token',
          message: 'Paste your GitHub Personal Access Token (requires repo scope):',
          mask: '*',
          validate: val => val.trim().length > 0 ? true : 'Token is required.'
        }
      ]);
      token = tokenAnswer.token.trim();
    }

    const spinner = ora(colors.primary('Creating GitHub Release...')).start();
    
    try {
      const url = `https://api.github.com/repos/${repoInfo.owner}/${repoInfo.repo}/releases`;
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.github+json',
          'Authorization': `Bearer ${token}`,
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'devD-CLI',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tag_name: answers.tagName.trim(),
          target_commitish: answers.targetBranch.trim(),
          name: answers.title.trim(),
          body: answers.body || '',
          draft: answers.draft,
          prerelease: answers.prerelease
        })
      });

      const data = await response.json();
      spinner.stop();

      if (response.ok) {
        console.log(colors.success(`\n✔ GitHub Release created successfully!`));
        console.log(`   URL: ${colors.info(data.html_url)}`);
      } else {
        const errorMsg = data.message || 'Unknown GitHub API error';
        console.log(colors.error(`\n✖ GitHub API returned error: ${errorMsg}`));
        if (data.errors) {
          data.errors.forEach(e => console.log(colors.muted(`   ↳ ${e.resource}: ${e.code} (${e.field || ''})`)));
        }
      }
    } catch (apiErr) {
      spinner.stop();
      console.log(colors.error(`\n✖ Failed to connect to GitHub API: ${apiErr.message}`));
    }
  } catch (error) {
    if (error.message === 'ESCAPE_CANCELLED') {
      console.log(colors.info('\nRelease creation cancelled.'));
    } else {
      throw error;
    }
  }
}
