import readline from 'readline';
import { colors, printBanner } from './ui.js';

export async function showInteractiveMenu(gitActive) {
  const items = gitActive ? [
    { name: '✍️  Stage & Commit Wizard (Conventional)', value: 'commit' },
    { name: '⚙️  Git Controls', value: 'git-controls' },
    { name: '🚀 Bump Version', value: 'bump' },
    { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
    { name: '✨ Update devD CLI', value: 'update' },
    { name: 'ℹ️  Help & Commands', value: 'help' },
    { name: '🔁 Restart devD CLI', value: 'restart' },
    { name: '❌ Exit', value: 'exit' }
  ] : [
    { name: '🤖 Ask Gemini / AI Query', value: 'ai' },
    { name: '✨ Update devD CLI', value: 'update' },
    { name: 'ℹ️  Help & Commands', value: 'help' },
    { name: '🔁 Restart devD CLI', value: 'restart' },
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
        process.stdin.setRawMode(false);
      }
    }

    process.stdin.on('keypress', onKeypress);
  });
}
