// UI State & DOM Elements
const elements = {
  html: document.documentElement,
  themeToggle: document.getElementById('theme-toggle'),
  workspaceName: document.getElementById('workspace-name'),
  activeBranch: document.getElementById('active-branch'),
  syncStatus: document.getElementById('sync-status'),
  changesList: document.getElementById('changes-list'),
  consoleOutput: document.getElementById('console-output'),
  branchesList: document.getElementById('branches-list'),
  branchSearch: document.getElementById('branch-search'),
  formCommit: document.getElementById('form-commit'),
  formRelease: document.getElementById('form-release'),
  btnRefreshStatus: document.getElementById('btn-refresh-status'),
  btnCopyLogs: document.getElementById('btn-copy-logs'),
  btnSubmitIssue: document.getElementById('btn-submit-issue'),
  tabBtns: document.querySelectorAll('.tab-btn'),
  tabContents: document.querySelectorAll('.tab-content'),
  linkGithub: document.getElementById('link-github'),
  linkDocs: document.getElementById('link-docs')
};

let allBranches = [];
let logLines = [];

// Initialize Page
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initTabs();
  setupEventListeners();
  refreshAllData();
});

// Theme Management (Light / Dark Mode Toggle)
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  elements.html.setAttribute('data-theme', savedTheme);
  updateThemeIcon(savedTheme);
}

function toggleTheme() {
  const currentTheme = elements.html.getAttribute('data-theme');
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  elements.html.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);
  updateThemeIcon(newTheme);
  logToConsole(`Theme changed to ${newTheme} mode.`);
}

function updateThemeIcon(theme) {
  const toggleIcon = elements.themeToggle.querySelector('.toggle-icon');
  toggleIcon.textContent = theme === 'dark' ? '🌙' : '☀️';
}

// Tab Selector Navigation
function initTabs() {
  elements.tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const tabId = btn.getAttribute('data-tab');
      
      elements.tabBtns.forEach(b => b.classList.remove('active'));
      elements.tabContents.forEach(c => c.classList.add('hidden'));
      
      btn.classList.add('active');
      document.getElementById(`tab-${tabId}`).classList.remove('hidden');
    });
  });
}

// Event Listeners Registration
function setupEventListeners() {
  elements.themeToggle.addEventListener('click', toggleTheme);
  elements.btnRefreshStatus.addEventListener('click', refreshAllData);
  
  elements.btnCopyLogs.addEventListener('click', copyLogsToClipboard);
  elements.btnSubmitIssue.addEventListener('click', submitLogsIssue);
  
  elements.branchSearch.addEventListener('input', filterBranches);
  
  elements.formCommit.addEventListener('submit', handleCommitSubmit);
  elements.formRelease.addEventListener('submit', handleReleaseSubmit);
}

// Console Logging
function logToConsole(message, level = 'INFO') {
  const timestamp = new Date().toLocaleTimeString();
  const line = `[${timestamp}] [${level}] ${message}`;
  logLines.push(line);
  
  if (logLines.length > 200) {
    logLines.shift();
  }
  
  elements.consoleOutput.textContent = logLines.join('\n');
  elements.consoleOutput.scrollTop = elements.consoleOutput.scrollHeight;
}

// AJAX API Requests (Fetch workspace details)
async function refreshAllData() {
  logToConsole('Refreshing workspace status...');
  elements.btnRefreshStatus.classList.add('spinning');
  
  try {
    const response = await fetch('/api/status');
    const data = await response.json();
    
    // Update Workspace Info
    elements.workspaceName.textContent = data.workspaceName;
    elements.activeBranch.textContent = data.activeBranch;
    
    // Update Sync State
    let syncText = 'Up to date';
    if (!data.aheadBehind.hasUpstream) {
      syncText = 'No Remote Upstream';
      elements.syncStatus.className = 'stat-value text-warning';
    } else if (data.aheadBehind.ahead > 0 || data.aheadBehind.behind > 0) {
      const parts = [];
      if (data.aheadBehind.ahead > 0) parts.push(`↑ ${data.aheadBehind.ahead}`);
      if (data.aheadBehind.behind > 0) parts.push(`↓ ${data.aheadBehind.behind}`);
      syncText = parts.join(' ');
      elements.syncStatus.className = 'stat-value text-accent';
    } else {
      elements.syncStatus.className = 'stat-value text-success';
    }
    elements.syncStatus.textContent = syncText;

    // Render Working Tree changes
    renderChanges(data.changes);
    
    // Fetch and render branches list
    await fetchBranches();
    
    // Fetch project config
    if (data.repoDetails) {
      elements.linkGithub.href = `https://github.com/${data.repoDetails.owner}/${data.repoDetails.repo}`;
    }
    
    logToConsole('Workspace status loaded successfully.');
  } catch (err) {
    logToConsole(`Failed to load status: ${err.message}`, 'ERROR');
  } finally {
    elements.btnRefreshStatus.classList.remove('spinning');
  }
}

function renderChanges(changes) {
  elements.changesList.innerHTML = '';
  
  if (!changes || changes.length === 0) {
    elements.changesList.innerHTML = '<li class="empty-state">No changes detected. Working tree clean.</li>';
    return;
  }
  
  changes.forEach(change => {
    const li = document.createElement('li');
    let colorClass = 'text-secondary';
    let icon = '✎';
    
    if (change.state === 'staged') {
      colorClass = 'text-success';
      icon = '✔';
    } else if (change.state === 'conflict') {
      colorClass = 'text-error';
      icon = '⚠️';
    }
    
    li.innerHTML = `<span class="${colorClass}">${icon}</span> [${change.type}] ${change.path}`;
    elements.changesList.appendChild(li);
  });
}

// Fetch list of branches
async function fetchBranches() {
  try {
    const response = await fetch('/api/branches');
    allBranches = await response.json();
    renderBranchesList(allBranches);
  } catch (err) {
    logToConsole(`Failed to fetch branches: ${err.message}`, 'ERROR');
  }
}

function renderBranchesList(branches) {
  elements.branchesList.innerHTML = '';
  
  if (branches.length === 0) {
    elements.branchesList.innerHTML = '<li class="empty-state">No branches found.</li>';
    return;
  }
  
  branches.forEach(branch => {
    const li = document.createElement('li');
    li.className = `branch-item ${branch.isCurrent ? 'current-branch' : ''}`;
    
    const icon = branch.isCurrent ? '🌿' : (branch.isRemote ? '🌎' : '🌿');
    
    li.innerHTML = `
      <div class="branch-name-container">
        <span class="branch-icon">${icon}</span>
        <span class="branch-name">${branch.name}</span>
        ${branch.isRemote ? '<span class="branch-meta">[remote]</span>' : ''}
      </div>
      <div class="branch-actions">
        ${!branch.isCurrent ? `<button class="btn-secondary btn-sm btn-checkout" data-branch="${branch.name}">Checkout</button>` : '<span class="text-success text-xs font-semibold">Active</span>'}
      </div>
    `;
    
    elements.branchesList.appendChild(li);
  });
  
  // Register click handlers for Checkout
  document.querySelectorAll('.btn-checkout').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const branchName = btn.getAttribute('data-branch');
      await executeBranchCheckout(branchName);
    });
  });
}

function filterBranches(e) {
  const query = e.target.value.toLowerCase();
  const filtered = allBranches.filter(b => b.name.toLowerCase().includes(query));
  renderBranchesList(filtered);
}

// Execute branch checkout
async function executeBranchCheckout(branchName) {
  logToConsole(`Checking out to branch: ${branchName}...`);
  try {
    const response = await fetch('/api/checkout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ branch: branchName })
    });
    const result = await response.json();
    
    if (result.success) {
      logToConsole(`✔ Checked out to branch "${branchName}" successfully.`);
      await refreshAllData();
    } else {
      logToConsole(`✖ Checkout failed: ${result.error || result.stderr}`, 'ERROR');
    }
  } catch (err) {
    logToConsole(`✖ Request error during checkout: ${err.message}`, 'ERROR');
  }
}

// Handle Conventional Commit Submission
async function handleCommitSubmit(e) {
  e.preventDefault();
  
  const type = document.getElementById('commit-type').value;
  const scope = document.getElementById('commit-scope').value.trim();
  const subject = document.getElementById('commit-subject').value.trim();
  const body = document.getElementById('commit-body').value.trim();
  
  logToConsole('Running Conventional Commit wizard...');
  
  try {
    const response = await fetch('/api/commit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, scope, subject, body })
    });
    const result = await response.json();
    
    if (result.success) {
      logToConsole(`✔ Commit created successfully: "${result.message}"`);
      elements.formCommit.reset();
      await refreshAllData();
    } else {
      logToConsole(`✖ Commit failed: ${result.error || result.stderr}`, 'ERROR');
    }
  } catch (err) {
    logToConsole(`✖ Request error during commit: ${err.message}`, 'ERROR');
  }
}

// Handle GitHub Release Submission
async function handleReleaseSubmit(e) {
  e.preventDefault();
  
  const tagName = document.getElementById('release-tag').value.trim();
  const title = document.getElementById('release-title').value.trim();
  const draft = document.getElementById('release-draft').checked;
  const prerelease = document.getElementById('release-prerelease').checked;
  
  logToConsole(`Preparing GitHub Release for tag: ${tagName}...`);
  
  try {
    const response = await fetch('/api/release', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ tagName, title, draft, prerelease })
    });
    const result = await response.json();
    
    if (result.success) {
      logToConsole(`✔ GitHub Release created successfully!`);
      logToConsole(`Release URL: ${result.url}`);
      elements.formRelease.reset();
      await refreshAllData();
    } else {
      logToConsole(`✖ Release failed: ${result.error}`, 'ERROR');
    }
  } catch (err) {
    logToConsole(`✖ Request error during release creation: ${err.message}`, 'ERROR');
  }
}

// Diagnostics actions
function copyLogsToClipboard() {
  const logsText = logLines.join('\n');
  navigator.clipboard.writeText(logsText)
    .then(() => {
      logToConsole('✔ Logs copied to clipboard successfully.');
    })
    .catch(err => {
      logToConsole(`Failed to copy logs: ${err.message}`, 'ERROR');
    });
}

function submitLogsIssue() {
  const logSnippet = logLines.slice(-30).join('\n');
  const title = encodeURIComponent('Bug Report / CLI Issue from Web Dashboard');
  const body = encodeURIComponent(`### System Logs\n\`\`\`text\n${logSnippet}\n\`\`\``);
  const url = `https://github.com/dwaipayanray95/devD/issues/new?title=${title}&body=${body}`;
  window.open(url, '_blank');
}
