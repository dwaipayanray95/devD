import { exec, execFile, spawn } from 'child_process';
import { promisify } from 'util';
import { logMessage } from './logger.js';

const execAsync = promisify(exec);
const execFileAsync = promisify(execFile);

/**
 * Executes a Git command in the current working directory.
 * @param {string|string[]} args - The arguments or array of arguments to pass to the git CLI.
 * @returns {Promise<{success: boolean, stdout: string, stderr: string, error?: string}>}
 */
export async function runGitCommand(args, cwd = process.cwd()) {
  const cmdStr = Array.isArray(args) ? `git ${args.join(' ')}` : `git ${args}`;
  try {
    let stdout, stderr;
    if (Array.isArray(args)) {
      const { stdout: out, stderr: err } = await execFileAsync('git', args, { cwd });
      stdout = out;
      stderr = err;
    } else {
      const { stdout: out, stderr: err } = await execAsync(`git ${args}`, { cwd });
      stdout = out;
      stderr = err;
    }
    logMessage(`Executed: ${cmdStr}`, 'INFO');
    return { success: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const errorMsg = error.message;
    const stderrMsg = error.stderr?.trim() || '';
    logMessage(`Failed: ${cmdStr} - Error: ${errorMsg} - Stderr: ${stderrMsg}`, 'ERROR');
    return { 
      success: false, 
      error: errorMsg, 
      stdout: error.stdout?.trim() || '', 
      stderr: stderrMsg
    };
  }
}

/**
 * Checks if the current directory is a git repository.
 * @returns {Promise<boolean>}
 */
export async function isGitRepository() {
  const res = await runGitCommand('rev-parse --is-inside-work-tree');
  return res.success && res.stdout === 'true';
}

/**
 * Returns a list of changed, untracked, and deleted files.
 * @returns {Promise<Array<{path: string, type: string, state: 'staged'|'unstaged'|'both'|'conflict', rawStatus: string}>>}
 */
export async function getChangedFiles() {
  const res = await runGitCommand('status --porcelain');
  if (!res.success || !res.stdout) return [];
  
  return res.stdout.split('\n').filter(Boolean).map(line => {
    const status = line.slice(0, 2);
    const path = line.slice(3).replace(/^"|"$/g, ''); // strip optional quotes around spaces/unicode
    let state = 'unstaged';
    let type = 'Modified';
    
    if (status === '??') {
      type = 'Untracked';
    } else if (status === ' A' || status === 'A ') {
      type = 'Added';
      state = status === 'A ' ? 'staged' : 'unstaged';
    } else if (status === ' D' || status === 'D ') {
      type = 'Deleted';
      state = status === 'D ' ? 'staged' : 'unstaged';
    } else if (status === 'M ') {
      type = 'Modified';
      state = 'staged';
    } else if (status === ' M') {
      type = 'Modified';
      state = 'unstaged';
    } else if (status === 'MM') {
      type = 'Modified (Staged & Unstaged)';
      state = 'both';
    } else if (status === 'R ') {
      type = 'Renamed';
      state = 'staged';
    } else if (status === 'UU' || status === 'U' || status.includes('U')) {
      type = 'Conflict';
      state = 'conflict';
    }
    
    return { path, type, state, rawStatus: status };
  });
}

export async function stageFiles(files) {
  if (files === 'all') {
    return runGitCommand(['add', '.']);
  }
  return runGitCommand(['add', ...files]);
}

/**
 * Unstages files (reset HEAD).
 * @param {string[]|'all'} files 
 */
export async function unstageFiles(files) {
  if (files === 'all') {
    return runGitCommand(['reset', 'HEAD']);
  }
  return runGitCommand(['reset', 'HEAD', ...files]);
}

/**
 * Commits currently staged changes. Uses spawn with stdio inherit to support GPG signing.
 * @param {string} message 
 */
export async function commit(message) {
  return new Promise((resolve) => {
    if (process.stdin.isTTY) {
      process.stdin.pause();
    }
    const child = spawn('git', ['commit', '-m', message], { stdio: 'inherit' });
    child.on('close', (code) => {
      if (process.stdin.isTTY) {
        process.stdin.resume();
      }
      if (code === 0) {
        resolve({ success: true, stdout: 'Commit created successfully' });
      } else {
        resolve({ success: false, error: `Git commit exited with code ${code}` });
      }
    });
  });
}

/**
 * Retrieves the local branches.
 * @returns {Promise<Array<{name: string, current: boolean}>>}
 */
export async function getLocalBranches() {
  const res = await runGitCommand('branch');
  if (!res.success || !res.stdout) return [];
  return res.stdout.split('\n').filter(Boolean).map(line => {
    const name = line.replace(/^\*\s+/, '').trim();
    const current = line.startsWith('*');
    return { name, current };
  });
}

/**
 * Gets the current branch and its ahead/behind counts against upstream.
 * @returns {Promise<{branch: string, ahead: number, behind: number, hasUpstream: boolean}>}
 */
export async function getAheadBehind() {
  let branchRes = await runGitCommand('symbolic-ref --short HEAD');
  if (!branchRes.success) {
    branchRes = await runGitCommand('rev-parse --abbrev-ref HEAD');
  }
  if (!branchRes.success) return { branch: 'unknown', ahead: 0, behind: 0, hasUpstream: false };
  const branch = branchRes.stdout;
  
  const upstreamRes = await runGitCommand('rev-parse --abbrev-ref HEAD@{upstream}');
  if (!upstreamRes.success) {
    return { branch, ahead: 0, behind: 0, hasUpstream: false };
  }
  
  const diffRes = await runGitCommand('rev-list --left-right --count HEAD...HEAD@{upstream}');
  if (!diffRes.success) {
    return { branch, ahead: 0, behind: 0, hasUpstream: true };
  }
  
  const [ahead, behind] = diffRes.stdout.split(/\s+/).map(Number);
  return { branch, ahead, behind, hasUpstream: true };
}

/**
 * Pulls changes from remote.
 */
export async function pull() {
  return runGitCommand('pull --rebase');
}

/**
 * Pushes changes to remote.
 */
export async function push() {
  const aheadBehind = await getAheadBehind();
  if (!aheadBehind.hasUpstream) {
    // If no upstream is set, push and set upstream to origin current-branch
    return runGitCommand(`push --set-upstream origin ${aheadBehind.branch}`);
  }
  return runGitCommand('push');
}

/**
 * List stashes.
 * @returns {Promise<string[]>}
 */
export async function getStashes() {
  const res = await runGitCommand('stash list');
  if (!res.success || !res.stdout) return [];
  return res.stdout.split('\n').filter(Boolean);
}

export async function stashSave(message) {
  const args = ['stash', 'push'];
  if (message) {
    args.push('-m', message);
  }
  return runGitCommand(args);
}

/**
 * Pops the last stashed changes.
 */
export async function stashPop() {
  return runGitCommand('stash pop');
}

/**
 * Gets the recent commits.
 * @param {number} limit 
 * @returns {Promise<Array<{hash: string, message: string, author: string}>>}
 */
export async function getRecentCommits(limit = 3) {
  const res = await runGitCommand(`log -n ${limit} --pretty=format:"%h|%s|%an"`);
  if (!res.success || !res.stdout) return [];
  
  return res.stdout.split('\n').filter(Boolean).map(line => {
    const [hash, message, author] = line.split('|');
    return { hash, message, author };
  });
}
