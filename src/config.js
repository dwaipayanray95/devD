import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.devd');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

export function getStoredToken() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      return data.githubToken || null;
    }
  } catch (e) {
    // Ignore
  }
  return null;
}

export function saveStoredToken(token) {
  try {
    if (!fs.existsSync(CONFIG_DIR)) {
      fs.mkdirSync(CONFIG_DIR, { recursive: true });
    }
    let data = {};
    if (fs.existsSync(CONFIG_FILE)) {
      data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    }
    data.githubToken = token;
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(data, null, 2), 'utf8');
    return true;
  } catch (e) {
    // Ignore
  }
  return false;
}
