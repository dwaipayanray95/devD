import inquirer from 'inquirer';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { 
  getChangedFiles, 
  stageFiles, 
  unstageFiles,
  commit, 
  getAheadBehind, 
  getRecentCommits, 
  getStashes, 
  runGitCommand,
  push,
  getLocalBranches
} from './git.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Reads and returns the local package version from package.json dynamically.
 * @returns {string}
 */
export function getLocalVersion() {
  try {
    const pkgPath = join(__dirname, '../package.json');
    const pkgContent = JSON.parse(readFileSync(pkgPath, 'utf8'));
    return pkgContent.version;
  } catch (e) {
    return '0.1.0';
  }
}

// Constants for UI theme colors
export const colors = {
  primary: chalk.cyan,
  success: chalk.green,
  warning: chalk.yellow,
  error: chalk.red,
  muted: chalk.gray,
  info: chalk.blue,
  accent: chalk.magenta,
  bright: chalk.white.bold
};

/**
 * Renders a premium console banner.
 */
export function printBanner() {
  console.clear();
  const title = `🚀  DEVD COMPANION CLI v${getLocalVersion()}`;
  const width = 54;
  const padding = Math.max(0, Math.floor((width - title.length) / 2));
  const line = ' '.repeat(padding) + title + ' '.repeat(width - title.length - padding);

  console.log(colors.primary('┌────────────────────────────────────────────────────────┐'));
  console.log(colors.primary('│') + colors.bright(line) + colors.primary('│'));
  console.log(colors.primary('│') + colors.muted('             Accelerating Developer Workflows           ') + colors.primary('│'));
  console.log(colors.primary('└────────────────────────────────────────────────────────┘'));
  console.log();
}

/**
 * Retrieves the Gemini API Key.
 * @returns {string|null}
 */
export function getGeminiApiKey() {
  return process.env.GEMINI_API_KEY || null;
}

/**
 * Calls the Gemini API using native fetch.
 * @param {string} prompt 
 * @returns {Promise<string>}
 */
export async function askGemini(prompt) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured in your environment. Set it with: export GEMINI_API_KEY="..."');
  }

  const spinner = ora(colors.primary('Thinking...')).start();
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: prompt }]
        }]
      })
    });

    const data = await response.json();
    spinner.stop();

    if (!response.ok) {
      const errorMsg = data.error?.message || 'Failed call to Gemini API';
      throw new Error(errorMsg);
    }

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) {
      throw new Error('Empty response received from Gemini.');
    }
    return text.trim();
  } catch (error) {
    spinner.stop();
    throw error;
  }
}

/**
 * Displays a colorized dashboard of the repository status.
 */
export async function showDashboard() {
  const spinner = ora(colors.primary('Loading Repository Status...')).start();
  try {
    const aheadBehind = await getAheadBehind();
    const changedFiles = await getChangedFiles();
    const stashes = await getStashes();
    const commits = await getRecentCommits(3);
    spinner.stop();

    // 1. Branch Header
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

    // 2. Working Tree Changes
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

    // 3. Stashes
    if (stashes.length > 0) {
      console.log(colors.accent(`◉  STASH STACK (${stashes.length})`));
      stashes.slice(0, 3).forEach((s, idx) => console.log(`   stash@{${idx}}: ${colors.muted(s.substring(s.indexOf(':') + 1).trim())}`));
      if (stashes.length > 3) console.log(colors.muted(`   ... and ${stashes.length - 3} more`));
      console.log();
    }

    // 4. Commit History
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
 * Runs the Conventional Commit Wizard.
 */
export async function runCommitWizard() {
  try {
    printBanner();
    
    // 1. Automatically stage all changes in working directory
    const stageSpinner = ora(colors.primary('Staging all changes...')).start();
    await stageFiles('all');
    stageSpinner.succeed(colors.success('Staged all changes successfully.'));

    // 2. Ensure there are actually staged files before writing commit message
    const activeChanges = await getChangedFiles();
    const currentStaged = activeChanges.filter(f => f.state === 'staged');
    if (currentStaged.length === 0) {
      console.log(colors.warning('\nNo changes detected in working tree. Nothing to commit.'));
      return;
    }

  // 3. Prompt for Commit Message or AI generation
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
        // Truncate diff if it's too long
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
        loop: false
      },
      {
        type: 'input',
        name: 'scope',
        message: 'What is the scope of this change? (e.g. component/file, press Enter to skip):',
        filter: val => val.trim().toLowerCase()
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

    const scopeStr = manualAnswers.scope ? `(${manualAnswers.scope})` : '';
    commitMessage = `${manualAnswers.type}${scopeStr}: ${manualAnswers.subject}`;
    if (manualAnswers.body) {
      commitMessage += `\n\n${manualAnswers.body}`;
    }
  }

  // 4. Exec Commit
  const commitSpinner = ora(colors.primary('Creating commit...')).start();
  const commitRes = await commit(commitMessage);
  commitSpinner.stop();

  if (commitRes.success) {
    console.log(colors.success(`\n✔ Commit created successfully: "${commitMessage}"`));
    
    // 5. Ask to push
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
          loop: false
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
      return;
    }
    throw error;
  }
}

/**
 * Interactive error handler/advisor when a Git command fails.
 * @param {{error?: string, stderr?: string}} res 
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
 * Checks GitHub for the latest release version.
 * @returns {Promise<string|null>} - The remote tag name (without 'v') or null if error/no release
 */
export async function getLatestRemoteVersion() {
  try {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), 1500); // 1.5s timeout to not block start
    const res = await fetch('https://api.github.com/repos/dwaipayanray95/devD/releases/latest', {
      headers: { 'User-Agent': 'devD-CLI' },
      signal: controller.signal
    });
    clearTimeout(id);
    if (!res.ok) return null;
    const data = await res.json();
    return data.tag_name ? data.tag_name.replace(/^v/, '') : null;
  } catch (error) {
    return null;
  }
}

/**
 * Checks if the remote version is newer than the local version.
 * @param {string} local 
 * @param {string} remote 
 * @returns {boolean}
 */
export function isOutdated(local, remote) {
  if (!remote) return false;
  const l = local.split('.').map(Number);
  const r = remote.split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if (r[i] > l[i]) return true;
    if (r[i] < l[i]) return false;
  }
  return false;
}

/**
 * Checks if there is a new update and prints a banner if so.
 * @param {string} localVersion 
 */
export async function checkForUpdates(localVersion) {
  const latest = await getLatestRemoteVersion();
  if (latest && isOutdated(localVersion, latest)) {
    console.log(colors.warning(`✨ A new version of devD is available: v${latest} (Current: v${localVersion})`));
    console.log(colors.info(`   Run: devD update`));
    console.log();
  }
}

/**
 * Wraps Inquirer prompts and rejects the promise if the user presses the Escape key.
 * @param {Array|Object} questions 
 * @returns {Promise<any>}
 */
export function promptWithEscape(questions) {
  let ui;
  let onCancel;
  
  const cancelPromise = new Promise((_, reject) => {
    onCancel = () => reject(new Error('ESCAPE_CANCELLED'));
  });

  const keypressHandler = (_, key) => {
    if (key && (key.name === 'escape' || key.name === 'esc')) {
      if (ui) {
        ui.close();
      }
      onCancel();
    }
  };

  process.stdin.on('keypress', keypressHandler);

  const promptPromise = inquirer.prompt(questions);
  ui = promptPromise.ui;

  return Promise.race([promptPromise, cancelPromise])
    .then(answers => {
      process.stdin.removeListener('keypress', keypressHandler);
      return answers;
    })
    .catch(err => {
      process.stdin.removeListener('keypress', keypressHandler);
      throw err;
    });
}

