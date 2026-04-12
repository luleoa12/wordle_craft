const ROWS = 6;
const COLS = 5;
const CYCLE = ['gray', 'yellow', 'green'];

let dragging = false;
let dragColor = null;
let undoStack = [];
let redoStack = [];
let cbMode = false;

let state = {
  answer: '',
  answerType: '',
  grid: [],       // 6×5 of {letter, color}
  loading: false,
};

// Loaded from words.txt
let WORD_LIST = [];

async function loadWordList() {
  try {
    const response = await fetch('words.txt');
    const text = await response.text();
    WORD_LIST = text.split('\n').map(w => w.trim().toLowerCase()).filter(w => w.length === 5);
  } catch (err) {
    showToast('toastContainer', 'error', 'Failed to load word list. Please refresh.');
  }
}

// Init 
function initGrid() {
  state.grid = [];
  for (let r = 0; r < ROWS; r++) {
    state.grid.push([]);
    for (let c = 0; c < COLS; c++) {
      state.grid[r].push({ letter: '', color: 'gray', clicked: false });
    }
  }
  renderGrid();
}

function updateToolbar() {
  const undoBtn = document.getElementById('undoBtn');
  const redoBtn = document.getElementById('redoBtn');
  if (undoBtn) undoBtn.disabled = undoStack.length === 0;
  if (redoBtn) redoBtn.disabled = redoStack.length === 0;
}

function saveUndo() {
  if (!state.grid) return;
  undoStack.push(JSON.stringify(state.grid));
  if (undoStack.length > 50) undoStack.shift();
  redoStack = [];
  updateToolbar();
}

function doUndo() {
  if (!undoStack.length) return;
  redoStack.push(JSON.stringify(state.grid));
  const snap = undoStack.pop();
  state.grid = JSON.parse(snap);
  renderGrid();
  updateToolbar();
  saveSession();
}

function doRedo() {
  if (!redoStack.length) return;
  undoStack.push(JSON.stringify(state.grid));
  const snap = redoStack.pop();
  state.grid = JSON.parse(snap);
  renderGrid();
  updateToolbar();
  saveSession();
}

function colorLabel(c) {
  return '';
}

function toggleColorBlind() {
  cbMode = !cbMode;
  const toggle = document.getElementById('cbModeToggle');
  if (toggle) toggle.checked = cbMode;
  document.body.classList.toggle('cb-mode', cbMode);
  renderGrid();
}

function applyColor(r, c, color) {
  const cell = state.grid[r][c];
  if (cell.color === color && cell.clicked) return;

  cell.color = color;
  cell.letter = '';
  cell.clicked = true;

  const tileEdit = document.getElementById(`tile-edit-${r}-${c}`);
  if (tileEdit) {
    tileEdit.className = `tile tile-${cell.color} tile-clicked`;
    tileEdit.textContent = colorLabel(cell.color);
  }

  const tilePrev = document.getElementById(`tile-prev-${r}-${c}`);
  if (tilePrev) {
    tilePrev.className = `tile tile-${cell.color} tile-clicked`;
    tilePrev.textContent = colorLabel(cell.color);
  }

  for (let i = 0; i < COLS; i++) {
    const tile = document.getElementById(`tile-edit-${r}-${i}`);
    if (tile) tile.classList.remove('pulse-error');
  }
  if (window._impossibleRows) {
    window._impossibleRows = window._impossibleRows.filter(row => row !== r);
  }

  if (typeof clearToast === 'function') {
    clearToast('step2Toast');
  }

  const step3 = document.getElementById('step3');
  if (step3) step3.classList.add('disabled');
  saveSession();
}

function tileDown(r, c, e) {
  if (e.button !== 0) return;
  saveUndo();
  dragging = true;

  const cell = state.grid[r][c];
  const idx = CYCLE.indexOf(cell.color);
  dragColor = CYCLE[(idx + 1) % CYCLE.length];
  applyColor(r, c, dragColor);
}

function tileDrag(r, c) {
  if (!dragging) return;
  applyColor(r, c, dragColor);
}

function tileCtx(r, c, e) {
  e.preventDefault();
  saveUndo();
  const cur = CYCLE.indexOf(state.grid[r][c].color);
  applyColor(r, c, CYCLE[(cur + 2) % 3]);
}

function getGridHTML(interactive) {
  let html = '';
  for (let r = 0; r < ROWS; r++) {
    html += `<div class="grid-row-wrap"><div class="grid-row">`;
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];
      const clsStr = `tile tile-${cell.color} ${cell.clicked ? 'tile-clicked' : ''}`;

      let eventAttrs = '';
      if (interactive) {
        if (state.answer) {
          eventAttrs = `onmousedown="tileDown(${r}, ${c}, event)" onmouseenter="tileDrag(${r}, ${c})"`;
        } else {
          eventAttrs = `onmousedown="showToast('toastContainer', 'warn', 'Initialize payload first on Step 1!')"`;
        }
      }

      html += `<div id="tile-${interactive ? 'edit' : 'prev'}-${r}-${c}" class="${clsStr}" ${eventAttrs}>${colorLabel(cell.color)}</div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

function renderGrid() {
  document.getElementById('gridBuilder').innerHTML = getGridHTML(true);
}

// Fetch word 
async function fetchTodaysWord() {
  if (state.loading) return;
  state.loading = true;
  const icon = document.getElementById('fetchIcon');

  try {
    const now = new Date();
    const isoLocal = now.getFullYear() + '-' +
      String(now.getMonth() + 1).padStart(2, '0') + '-' +
      String(now.getDate()).padStart(2, '0') + 'T' +
      String(now.getHours()).padStart(2, '0') + ':' +
      String(now.getMinutes()).padStart(2, '0') + ':' +
      String(now.getSeconds()).padStart(2, '0');

    const res = await fetch(`https://wordle-craft.luleoa12.workers.dev?datetime=${isoLocal}`);
    const data = await res.json();
    const word = data.answer?.toUpperCase();

    if (word && /^[A-Z]{5}$/.test(word)) {
      applyAnswer(word, 'fetched');
      showToast('toastContainer', 'ok', 'Word successfully fetched');
    } else {
      throw new Error('Word not found or invalid format. Override manually.');
    }
  } catch (err) {
    console.error(`[Fetch] Pipeline crashed:`, err);
    showToast('toastContainer', 'warn', `${err.message || 'Network error.'}`);
  } finally {
    state.loading = false;
    icon.innerHTML = '';
  }
}

function handleCustomWord(input) {
  input.value = input.value.toUpperCase().replace(/[^A-Z]/g, '');
}

function applyCustomWord() {
  const val = document.getElementById('customWord').value.trim().toUpperCase();
  if (val.length !== 5) {
    showToast('toastContainer', 'error', 'Word must be exactly 5 letters');
    return;
  }
  applyAnswer(val);
}

function applyAnswer(word, type = 'custom') {
  const newAnswer = word.toUpperCase();
  if (state.answer && state.answer !== newAnswer) {
    initGrid();
  }
  state.answer = newAnswer;
  state.answerType = type;
  renderGrid();
  goToStep(2);
  saveSession();
}

function scoreGuess(guessStr, answerStr) {
  const guess = guessStr.split('');
  const answer = answerStr.split('');
  const result = ['gray', 'gray', 'gray', 'gray', 'gray'];
  const answerCounts = {};

  for (let char of answer) {
    answerCounts[char] = (answerCounts[char] || 0) + 1;
  }

  for (let i = 0; i < 5; i++) {
    if (guess[i] === answer[i]) {
      result[i] = 'green';
      answerCounts[guess[i]]--;
    }
  }

  for (let i = 0; i < 5; i++) {
    if (result[i] !== 'green' && answerCounts[guess[i]] > 0) {
      result[i] = 'yellow';
      answerCounts[guess[i]]--;
    }
  }
  return result;
}

function patternMatches(actualPattern, desiredPattern) {
  for (let i = 0; i < 5; i++) {
    if (actualPattern[i] !== desiredPattern[i]) return false;
  }
  return true;
}

// Find words 
function findWords() {
  if (!state.answer) {
    showToast('toastContainer', 'warn', 'Please initialize payload first (Step 1).');
    return;
  }

  const answer = state.answer.toUpperCase();
  const resultsByRow = [];
  window._impossibleRows = [];

  // 1. Check for solved row (all green)
  let firstAllGreenIdx = -1;
  for (let r = 0; r < ROWS; r++) {
    const isAllGreen = state.grid[r].every(c => c.color === 'green');
    if (isAllGreen) {
      firstAllGreenIdx = r;
      break;
    }
  }

  // 2. If solved early, ensure no guesses exist below it
  if (firstAllGreenIdx !== -1 && firstAllGreenIdx < ROWS - 1) {
    let hasGuessesBelow = false;
    for (let r = firstAllGreenIdx + 1; r < ROWS; r++) {
      if (state.grid[r].some(c => c.clicked || c.color !== 'gray')) {
        hasGuessesBelow = true;
        break;
      }
    }

    if (hasGuessesBelow) {
      document.getElementById('solvedRowNumber').textContent = (firstAllGreenIdx + 1).toString();
      openModal('solvedErrorModal');
      return;
    }
  }

  for (let r = 0; r < ROWS; r++) {
    const desiredPattern = state.grid[r].map(c => c.color);

    const validWords = WORD_LIST.filter(word => {
      const actualPattern = scoreGuess(word.toUpperCase(), answer);
      return patternMatches(actualPattern, desiredPattern);
    });

    resultsByRow.push(validWords);

    if (validWords.length > 0) {
      const chosenWord = validWords[Math.floor(Math.random() * validWords.length)];
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c].letter = chosenWord[c];
      }
      for (let c = 0; c < COLS; c++) {
        const t = document.getElementById(`tile-edit-${r}-${c}`);
        if (t) t.classList.remove('pulse-error');
      }
    } else {
      window._impossibleRows.push(r);
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c].letter = '';
      }
    }
  }

  if (window._impossibleRows.length > 0) {
    openModal('impossibleModal');
  } else {
    showToast('toastContainer', 'ok', `Matches successfully generated.`);
    generateShare();
    goToStep(3);
  }
}

function handleRepaint() {
  closeModal('impossibleModal');
  closeModal('solvedErrorModal');
  window._impossibleRows.forEach(r => {
    for (let c = 0; c < COLS; c++) {
      const t = document.getElementById(`tile-edit-${r}-${c}`);
      if (t) t.classList.add('pulse-error');
    }
  });
  showToast('toastContainer', 'error', 'Adjust the pulsing red tiles', 'step2Toast');
}

function handleContinueAnyway() {
  closeModal('impossibleModal');
  closeModal('solvedErrorModal');
  generateShare();
  goToStep(3);
}

function resetGrid() {
  saveUndo();
  initGrid();
  renderGrid();
  document.getElementById('step3').classList.add('disabled');
  saveSession();
}

function shuffleColors(color1, color2) {
  if (!state.answer) { showToast('toastContainer', 'warn', 'Set target first.'); return; }
  saveUndo();

  const positions1 = [];
  const positions2 = [];

  // Collect positions of each color
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const color = state.grid[r][c].color;
      if (color === color1) {
        positions1.push({ r, c });
      } else if (color === color2) {
        positions2.push({ r, c });
      }
    }
  }

  // If no tiles of either color, do nothing
  if (positions1.length === 0 && positions2.length === 0) {
    showToast('toastContainer', 'warn', `No ${color1} or ${color2} tiles to shuffle!`);
    return;
  }

  // Create a copy of the current grid
  const newGrid = JSON.parse(JSON.stringify(state.grid));

  // Shuffle tiles within each color group separately
  const shuffleArray = (arr) => arr.sort(() => Math.random() - 0.5);

  // Shuffle color1 tiles among themselves
  if (positions1.length > 1) {
    const shuffled1 = shuffleArray([...positions1]);
    const tiles1 = positions1.map(pos => newGrid[pos.r][pos.c]);

    for (let i = 0; i < shuffled1.length; i++) {
      const newPos = shuffled1[i];
      newGrid[newPos.r][newPos.c] = tiles1[i];
    }
  }

  // Shuffle color2 tiles among themselves
  if (positions2.length > 1) {
    const shuffled2 = shuffleArray([...positions2]);
    const tiles2 = positions2.map(pos => newGrid[pos.r][pos.c]);

    for (let i = 0; i < shuffled2.length; i++) {
      const newPos = shuffled2[i];
      newGrid[newPos.r][newPos.c] = tiles2[i];
    }
  }

  state.grid = newGrid;
  renderGrid();
  showToast('toastContainer', 'info', `Shuffled ${color1} and ${color2} tiles within their positions!`);
  document.getElementById('step3').classList.add('disabled');
  saveSession();
}

function shuffleGrayYellow() {
  shuffleColors('gray', 'yellow');
}

function shuffleGrayGreen() {
  shuffleColors('gray', 'green');
}

function shuffleYellowGreen() {
  shuffleColors('yellow', 'green');
}

function shuffleAll() {
  shuffleColors('gray', 'yellow');
  // Need to call again for full randomization
  setTimeout(() => {
    shuffleColors('gray', 'green');
  }, 100);
}

// Shuffle board with valid patterns
function randomizeBoard() {
  if (!state.answer) { showToast('toastContainer', 'warn', 'Set target first.'); return; }
  saveUndo();
  if (WORD_LIST.length === 0) { showToast('toastContainer', 'error', 'Word list not loaded yet.'); return; }

  const answer = state.answer.toUpperCase();
  const colors = ['gray', 'yellow', 'green'];

  for (let r = 0; r < ROWS; r++) {
    let validPatternFound = false;
    let attempts = 0;
    const maxAttempts = 100;

    while (!validPatternFound && attempts < maxAttempts) {
      attempts++;

      // Generate a random pattern
      const desiredPattern = [];
      for (let c = 0; c < COLS; c++) {
        const color = colors[Math.floor(Math.random() * colors.length)];
        desiredPattern.push(color);
      }

      // Check if this pattern has valid words
      const validWords = WORD_LIST.filter(word => {
        const actualPattern = scoreGuess(word.toUpperCase(), answer);
        return patternMatches(actualPattern, desiredPattern);
      });

      if (validWords.length > 0) {
        for (let c = 0; c < COLS; c++) {
          state.grid[r][c] = { letter: '', color: desiredPattern[c] };
        }
        validPatternFound = true;
      }
    }

    // Fallback: if no valid pattern found after many attempts, use all gray
    if (!validPatternFound) {
      for (let c = 0; c < COLS; c++) {
        state.grid[r][c] = { letter: '', color: 'gray' };
      }
    }
  }

  renderGrid();
  showToast('toastContainer', 'info', 'Board randomly generated!');
  document.getElementById('step3').classList.add('disabled');
  saveSession();
}

// Share 
function generateShare() {
  const container = document.getElementById('wordListContainer');
  if (!container) return;
  container.innerHTML = '';

  for (let r = 0; r < ROWS; r++) {
    const row = state.grid[r];
    const isRowSolved = row.every(c => !!c.letter);

    const rowDiv = document.createElement('div');
    rowDiv.className = 'word-list-row';

    if (isRowSolved) {
      const word = row.map(c => c.letter).join('');
      const upperWord = word.toUpperCase();
      const wordSpan = document.createElement('span');
      wordSpan.className = 'word-list-word';
      wordSpan.textContent = upperWord;

      const copyBtn = document.createElement('button');
      copyBtn.className = 'btn btn-primary btn-sm';
      copyBtn.innerHTML = '<span style="font-size:0.85rem;">COPY</span>';

      copyBtn.onclick = async () => {
        const textToCopy = upperWord;
        let success = false;

        try {
          if (navigator.clipboard && navigator.clipboard.writeText) {
            await navigator.clipboard.writeText(textToCopy);
            success = true;
          } else {
            const textArea = document.createElement("textarea");
            textArea.value = textToCopy;
            document.body.appendChild(textArea);
            textArea.select();
            success = document.execCommand('copy');
            document.body.removeChild(textArea);
          }

          if (success) {
            showToast('toastContainer', 'ok', `Copied "${textToCopy}"!`);
            copyBtn.innerHTML = '<span style="font-size:0.85rem;">COPIED</span>';
            setTimeout(() => { copyBtn.innerHTML = '<span style="font-size:0.85rem;">COPY</span>'; }, 1500);
          } else {
            throw new Error('Copy failed');
          }
        } catch (e) {
          showToast('toastContainer', 'error', 'Failed to copy.');
        }
      };

      rowDiv.appendChild(wordSpan);
      rowDiv.appendChild(copyBtn);
    } else {
      const emptySpan = document.createElement('span');
      emptySpan.className = 'word-list-word';
      emptySpan.style.cssText = 'color: var(--muted); font-style: italic;';
      emptySpan.textContent = '—';
      rowDiv.appendChild(emptySpan);
    }
    container.appendChild(rowDiv);
  }

  const hash = encryptShare();
  const visibleLink = document.getElementById('visibleShareLink');
  if (visibleLink) {
    visibleLink.textContent = window.location.hostname + window.location.pathname + '?b=' + hash;
  }
}

async function generateEmojiShare() {
  const emojiMap = {
    'gray': '⬛',
    'yellow': '🟨',
    'green': '🟩'
  };

  let emojiPattern = '';
  for (let r = 0; r < ROWS; r++) {
    const row = state.grid[r];
    const rowEmojis = row.map(c => emojiMap[c.color] || '⬛').join('');
    emojiPattern += rowEmojis + '\n';
  }

  const shareText = `${emojiPattern}`;

  // Copy to clipboard
  let success = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(shareText);
      success = true;
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = shareText;
      document.body.appendChild(textArea);
      textArea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    }

    if (success) {
      showToast('toastContainer', 'ok', 'Emoji pattern copied to clipboard!');
    } else {
      throw new Error('Copy failed');
    }
  } catch (e) {
    showToast('toastContainer', 'error', 'Failed to copy emoji pattern.');
  }
}

const CIPHER_A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const CIPHER_B = 'nopqrstuvwxyz0123456789+/ABCDEFGHIJKLMabcdefghijklmNOPQRSTUVWXYZ';

function encryptShare() {
  const colorCode = {'gray': '0', 'yellow': '1', 'green': '2'};
  let p = '';
  for(let r=0; r<ROWS; r++) {
    for(let c=0; c<COLS; c++) {
      p += colorCode[state.grid[r][c].color] || '0';
    }
  }
  const w = state.answer || '';
  const raw = w + '|' + p;

  const salt = Math.floor(Math.random() * 256);
  let bytes = [salt];
  for(let i=0; i<raw.length; i++) {
    bytes.push(raw.charCodeAt(i) ^ salt ^ (i % 256));
  }
  
  let byteStr = '';
  for(let i=0; i<bytes.length; i++) {
    byteStr += String.fromCharCode(bytes[i]);
  }
  
  const b64 = btoa(byteStr).replace(/=/g, '');
  let res = '';
  for(let i=0; i<b64.length; i++) {
    const idx = CIPHER_A.indexOf(b64[i]);
    res += idx !== -1 ? CIPHER_B[idx] : b64[i];
  }
  return res;
}

function decryptShare(hash) {
  try {
    let b64 = '';
    for(let i=0; i<hash.length; i++) {
      const idx = CIPHER_B.indexOf(hash[i]);
      b64 += idx !== -1 ? CIPHER_A[idx] : hash[i];
    }
    while(b64.length % 4 !== 0) b64 += '=';
    
    const byteStr = atob(b64);
    if (byteStr.length < 1) return null;
    
    const salt = byteStr.charCodeAt(0);
    let raw = '';
    for(let i=1; i<byteStr.length; i++) {
      const charCode = byteStr.charCodeAt(i) ^ salt ^ ((i - 1) % 256);
      raw += String.fromCharCode(charCode);
    }
    
    const [w, p] = raw.split('|');
    return {w, p};
  } catch(e) { return null; }
}

async function generateLinkShare() {
  const hash = encryptShare();
  const link = window.location.origin + window.location.pathname + '?b=' + hash;

  let success = false;
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(link);
      success = true;
    } else {
      const textArea = document.createElement("textarea");
      textArea.value = link;
      document.body.appendChild(textArea);
      textArea.select();
      success = document.execCommand('copy');
      document.body.removeChild(textArea);
    }
    if (success) {
      showToast('toastContainer', 'ok', 'Shareable link copied to clipboard!');
      const btn = document.getElementById('copyLinkBtn');
      if (btn) {
        const textEl = btn.querySelector('.copy-btn-text');
        if (textEl) {
          const originalText = textEl.textContent;
          textEl.textContent = 'Copied!';
          setTimeout(() => {
            textEl.textContent = originalText;
          }, 1500);
        }
      }
    } else {
      throw new Error('Copy failed');
    }
  } catch (e) {
    showToast('toastContainer', 'error', 'Failed to copy link.');
  }
}

function loadFromHash(hash) {
  const data = decryptShare(hash);
  if (!data) {
     showToast('toastContainer', 'error', 'Invalid share link!');
     return;
  }
  const {w, p} = data;
  if (!w || !p || p.length !== 30) return;
  
  applyAnswer(w, 'shared');
  
  const codeColor = {'0': 'gray', '1': 'yellow', '2': 'green'};
  let idx = 0;
  for(let r=0; r<ROWS; r++) {
    for(let c=0; c<COLS; c++) {
      const color = codeColor[p[idx]] || 'gray';
      state.grid[r][c].color = color;
      if (color !== 'gray') {
        state.grid[r][c].clicked = true;
      }
      idx++;
    }
  }
  renderGrid();
  goToStep(2);
  showToast('toastContainer', 'info', `Loaded shared board with target word: ${w}`);
}

// Toasts 
function showToast(id, type, msg) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${msg}</span>`;

  container.appendChild(toast);

  setTimeout(() => {
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  }, 3500);
}

function clearToast(id) {
  const container = document.getElementById('toastContainer');
  if (container) {
    // If we wanted to clear specific toasts, we'd need to track them.
    // For now, this is a placeholder to prevent errors.
  }
}
// Theme Switcher 
const THEMES = {
  beige: { bg: '#ece0c2', btn: '#d4a373', body: '#fdfaf5', icon: '#fff4e6' },
  blue: { bg: '#BAE6FD', btn: '#38bdf8', body: '#e0f2fe', icon: '#f0f9ff' },
  green: { bg: '#BBF7D0', btn: '#4ade80', body: '#dcfce7', icon: '#f0fdf4' },
  yellow: { bg: '#FEF08A', btn: '#facc15', body: '#fef9c3', icon: '#fefce8' },
  orange: { bg: '#FED7AA', btn: '#fb923c', body: '#ffedd5', icon: '#fff7ed' },
  pink: { bg: '#FBCFE8', btn: '#f472b6', body: '#fce7f3', icon: '#fdf2f8' },
  purple: { bg: '#E9D5FF', btn: '#c084fc', body: '#f3e8ff', icon: '#faf5ff' },
};

function setTheme(themeName) {
  const t = THEMES[themeName] || THEMES['beige'];
  const root = document.documentElement;
  root.style.setProperty('--bg-main', t.body);
  root.style.setProperty('--bg-panel', t.bg);
  root.style.setProperty('--accent-primary', t.btn);
  root.style.setProperty('--bg-icon-tint', t.icon);
  localStorage.setItem('wc_theme', themeName);

  const swatches = document.querySelectorAll('.theme-swatch');
  swatches.forEach(swatch => {
    swatch.classList.remove('active');
    swatch.style.boxShadow = '';
    if (swatch.onclick && swatch.onclick.toString().includes(`'${themeName}'`)) {
      swatch.classList.add('active');
    }
  });
};
window.setTheme = setTheme;

function goToStep(n) {
  for (let i = 1; i <= 3; i++) {
    const el = document.getElementById(`step${i}`);
    if (i === n) {
      el.classList.remove('disabled');
    } else {
      el.classList.add('disabled');
    }
  }
  
  if (n === 1) {
    const customInput = document.getElementById('customWord');
    if (customInput) {
      customInput.value = '';
      customInput.focus();
    }
  }
}

function openModal(id) {
  console.log('openModal called with id:', id);
  const modal = document.getElementById(id);
  if (!modal) {
    console.log('Modal not found with id:', id);
    return;
  }
  modal.style.display = 'flex';
  document.body.classList.add('modal-open');

  const buttons = modal.querySelectorAll('button');
  if (buttons.length > 0) buttons[0].focus();
}

function closeModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
  modal.style.display = 'none';
  document.body.classList.remove('modal-open');
}

function openShuffleModal() {
  console.log('openShuffleModal called');
  openModal('shuffleModal');
  updateShuffleUI();
}

function updateShuffleUI() {
  const colors = ['Gray', 'Yellow', 'Green'];
  colors.forEach(color => {
    const isChecked = document.getElementById(`shuffle${color}`).checked;
    const card = document.getElementById(`card${color}`);

    if (card) {
      if (isChecked) {
        card.classList.add('active');
      } else {
        card.classList.remove('active');
      }
    }
  });

  const patternToggle = document.getElementById('validPatternToggle');
  const patternCard = document.querySelector('.pattern-card');
  if (patternToggle && patternCard) {
    if (patternToggle.checked) {
      patternCard.classList.add('active');
    } else {
      patternCard.classList.remove('active');
    }
  }
}

function shuffleTiles() {
  if (!state.answer) {
    showToast('toastContainer', 'warn', 'Set target first.');
    return;
  }
  saveUndo();

  const shuffleGray = document.getElementById('shuffleGray').checked;
  const shuffleYellow = document.getElementById('shuffleYellow').checked;
  const shuffleGreen = document.getElementById('shuffleGreen').checked;
  const validPatternToggle = document.getElementById('validPatternToggle').checked;

  if (validPatternToggle) {
    generateValidPattern();
    return;
  }

  const shuffleColorPool = [];
  if (shuffleGray) shuffleColorPool.push('gray');
  if (shuffleYellow) shuffleColorPool.push('yellow');
  if (shuffleGreen) shuffleColorPool.push('green');

  console.log('Shuffle color pool:', shuffleColorPool);

  if (shuffleColorPool.length === 0) {
    showToast('toastContainer', 'warn', 'No colors selected for shuffling!');
    return;
  }

  const newGrid = JSON.parse(JSON.stringify(state.grid));

  let tilesToShuffle = [];
  const anyClicked = state.grid.some(row => row.some(cell => cell.clicked));

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];

      if (anyClicked) {
        if (cell.clicked && shuffleColorPool.includes(cell.color)) {
          tilesToShuffle.push({ r, c });
        }
      } else {
        if (shuffleColorPool.includes(cell.color)) {
          tilesToShuffle.push({ r, c });
        }
      }
    }
  }

  if (tilesToShuffle.length === 0) {
    showToast('toastContainer', 'warn', 'No clicked tiles match the selected colors!');
    return;
  }

  // Shuffle: assign a random color from the shuffle pool to eligible tiles
  for (const tile of tilesToShuffle) {
    const randomColor = shuffleColorPool[Math.floor(Math.random() * shuffleColorPool.length)];
    newGrid[tile.r][tile.c].color = randomColor;
    // Keep it as "clicked" since the user initiated this shuffle
  }

  console.log('Grid before shuffle:', state.grid.map(row => row.map(cell => cell.color)));
  console.log('Grid after shuffle:', newGrid.map(row => row.map(cell => cell.color)));

  state.grid = newGrid;

  // Force a complete re-render
  setTimeout(() => {
    renderGrid();
    showToast('toastContainer', 'info', 'Colors shuffled successfully!');
    document.getElementById('step3').classList.add('disabled');
    saveSession();
  }, 50);
}

// Shuffle board with valid patterns
function generateValidPattern() {
  if (!state.answer) {
    showToast('toastContainer', 'warn', 'Set target first.');
    return;
  }
  if (WORD_LIST.length === 0) {
    showToast('toastContainer', 'error', 'Word list not loaded yet.');
    return;
  }

  const answer = state.answer.toUpperCase();
  const shuffleGray = document.getElementById('shuffleGray').checked;
  const shuffleYellow = document.getElementById('shuffleYellow').checked;
  const shuffleGreen = document.getElementById('shuffleGreen').checked;

  const shuffleColorPool = [];
  if (shuffleGray) shuffleColorPool.push('gray');
  if (shuffleYellow) shuffleColorPool.push('yellow');
  if (shuffleGreen) shuffleColorPool.push('green');

  if (shuffleColorPool.length === 0) {
    showToast('toastContainer', 'warn', 'Select at least one color to randomize!');
    return;
  }

  let impossibleRows = [];

  for (let r = 0; r < ROWS; r++) {
    const row = state.grid[r];
    const rowHasClicked = row.some(c => c.clicked);
    const stayingConstraints = []; // {col, color}

    for (let c = 0; c < COLS; c++) {
      let stays = false;
      if (rowHasClicked) {
        if (!row[c].clicked || !shuffleColorPool.includes(row[c].color)) {
          stays = true;
        }
      } else {
        if (!shuffleColorPool.includes(row[c].color)) {
          stays = true;
        }
      }

      if (stays) {
        stayingConstraints.push({ c, color: row[c].color });
      }
    }

    const matchingWords = WORD_LIST.filter(word => {
      const actualPattern = scoreGuess(word.toUpperCase(), answer);

      const matchesConstraints = stayingConstraints.every(con => actualPattern[con.c] === con.color);
      if (!matchesConstraints) return false;

      for (let c = 0; c < COLS; c++) {
        let canShuffle = false;
        if (rowHasClicked) {
          if (row[c].clicked && shuffleColorPool.includes(row[c].color)) canShuffle = true;
        } else {
          if (shuffleColorPool.includes(row[c].color)) canShuffle = true;
        }

        if (canShuffle) {
          if (!shuffleColorPool.includes(actualPattern[c])) return false;
        }
      }

      return true;
    });

    if (matchingWords.length > 0) {
      const interestingWords = matchingWords.filter(word => {
        const p = scoreGuess(word.toUpperCase(), answer);
        return p.some(color => color !== 'gray');
      });

      const pool = interestingWords.length > 0 ? interestingWords : matchingWords;
      const chosenWord = pool[Math.floor(Math.random() * pool.length)];
      const newPattern = scoreGuess(chosenWord.toUpperCase(), answer);

      for (let c = 0; c < COLS; c++) {
        let canShuffle = false;
        if (rowHasClicked) {
          if (row[c].clicked && shuffleColorPool.includes(row[c].color)) canShuffle = true;
        } else {
          if (shuffleColorPool.includes(row[c].color)) canShuffle = true;
        }

        if (canShuffle) {
          state.grid[r][c].color = newPattern[c];
          state.grid[r][c].clicked = true;
        }
      }
    } else {
      impossibleRows.push(r + 1);
    }
  }

  renderGrid();

  if (impossibleRows.length > 0) {
    showToast('toastContainer', 'error', `IMPOSSIBLE PATTERN: No real words match constraints for row(s) ${impossibleRows.join(', ')}.`);
  } else {
    showToast('toastContainer', 'ok', 'Real Wordle patterns generated!');
  }
  document.getElementById('step3').classList.add('disabled');
}

function closeIntro() {
  closeModal('introModal');
  localStorage.setItem('wc_intro_v4', 'true');
}

const PREMADE_PATTERNS = [
  { name: '6', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'G', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'G', 'Y', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['Gr', 'Gr', 'Gr', 'Gr', 'Gr']] },
  { name: '7', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['Gr', 'Gr', 'Gr', 'Gr', 'Gr']] },
  { name: 'Checkerboard', pattern: [['G', 'Y', 'G', 'Y', 'G'], ['Y', 'G', 'Y', 'G', 'Y'], ['G', 'Y', 'G', 'Y', 'G'], ['Y', 'G', 'Y', 'G', 'Y'], ['G', 'Y', 'G', 'Y', 'G'], ['Y', 'G', 'Y', 'G', 'Y']] },
  { name: 'Among Us 1', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'Gr', 'Gr', 'G'], ['Gr', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'G', 'Y', 'G'], ['Gr', 'Gr', 'Gr', 'Gr', 'Gr']] },
  { name: 'Among Us 2', pattern: [['G', 'Y', 'Y', 'Y', 'Y'], ['Y', 'Y', 'Gr', 'Gr', 'Gr'], ['Y', 'Y', 'Gr', 'Gr', 'Gr'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'Y', 'Y', 'Y', 'Y'], ['G', 'Y', 'G', 'G', 'Y']] },
  { name: 'Smiley 1', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'Gr', 'Y', 'Gr', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['Gr', 'Y', 'Y', 'Y', 'Gr'], ['Y', 'Gr', 'Gr', 'Gr', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y']] },
  { name: 'Smiley 2', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Y', 'G', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Smiley 3', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Gr', 'G', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Smiley 4', pattern: [['G', 'Y', 'G', 'Y', 'G'], ['G', 'Y', 'G', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'Y', 'Y', 'Y', 'G']] },
  { name: 'Smiley 5', pattern: [['G', 'Gr', 'G', 'Gr', 'G'], ['G', 'Gr', 'G', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G']] },
  { name: 'Smiley 6', pattern: [['Y', 'Gr', 'Y', 'Gr', 'Y'], ['Y', 'Gr', 'Y', 'Gr', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['Gr', 'Y', 'Y', 'Y', 'Gr'], ['Gr', 'Y', 'Y', 'Y', 'Gr'], ['Y', 'Gr', 'Gr', 'Gr', 'Y']] },
  { name: 'Star 1', pattern: [['G', 'G', 'Y', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Star 2', pattern: [['G', 'G', 'Y', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'Y', 'Gr', 'Y', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Star 3', pattern: [['G', 'G', 'Y', 'G', 'G'], ['G', 'Y', 'Gr', 'Y', 'G'], ['Y', 'Gr', 'Gr', 'Gr', 'Y'], ['G', 'Y', 'Gr', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Star 4', pattern: [['G', 'G', 'Gr', 'G', 'G'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['Gr', 'Gr', 'Gr', 'Gr', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'Gr', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Star 5', pattern: [['G', 'G', 'Gr', 'G', 'G'], ['G', 'Gr', 'Y', 'Gr', 'G'], ['Gr', 'Y', 'Y', 'Y', 'Gr'], ['G', 'Gr', 'Y', 'Gr', 'G'], ['G', 'G', 'Gr', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 1', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'G', 'Y', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 2', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'Y', 'Gr', 'Y', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 3', pattern: [['G', 'G', 'G', 'G', 'G'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'Gr', 'Y', 'Gr', 'G'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 4', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 5', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 6', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 7', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'Gr', 'G', 'Gr', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Square 8', pattern: [['Y', 'Y', 'Y', 'Y', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'Y', 'Y', 'Y', 'Y'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 1', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 2', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'Gr', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 3', pattern: [['G', 'Gr', 'Gr', 'Gr', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['Gr', 'G', 'Gr', 'G', 'Gr'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 4', pattern: [['G', 'Gr', 'Gr', 'Gr', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['Gr', 'G', 'Y', 'G', 'Gr'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 5', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['Y', 'G', 'Y', 'G', 'Y'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Bullseye 6', pattern: [['G', 'Gr', 'Gr', 'Gr', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['Gr', 'G', 'G', 'G', 'Gr'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'G', 'G', 'G']] },
  { name: 'Kangaroo 1', pattern: [['G', 'Y', 'G', 'G', 'G'], ['Y', 'Y', 'G', 'G', 'G'], ['G', 'Y', 'Y', 'G', 'G'], ['G', 'Y', 'Y', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'Y'], ['G', 'Y', 'Y', 'G', 'G']] },
  { name: 'Kangaroo 2', pattern: [['G', 'Gr', 'G', 'G', 'G'], ['Gr', 'Gr', 'G', 'G', 'G'], ['G', 'Gr', 'Gr', 'G', 'G'], ['G', 'Gr', 'Gr', 'Gr', 'G'], ['G', 'G', 'Gr', 'G', 'Gr'], ['G', 'Gr', 'Gr', 'G', 'G']] },
  { name: 'Kangaroo 3', pattern: [['Y', 'Gr', 'Y', 'Y', 'Y'], ['Gr', 'Gr', 'Y', 'Y', 'Y'], ['Y', 'Gr', 'Gr', 'Y', 'Y'], ['Y', 'Gr', 'Gr', 'Gr', 'Y'], ['Y', 'Y', 'Gr', 'Y', 'Gr'], ['Y', 'Gr', 'Gr', 'Y', 'Y']] },
  { name: 'Question 1', pattern: [['G', 'Gr', 'Gr', 'Gr', 'G'], ['Gr', 'G', 'G', 'G', 'Gr'], ['G', 'G', 'Gr', 'Gr', 'G'], ['G', 'G', 'Gr', 'G', 'G'], ['G', 'G', 'G', 'G', 'G'], ['G', 'G', 'Gr', 'G', 'G']] },
  { name: 'Question 2', pattern: [['G', 'Y', 'Y', 'Y', 'G'], ['Y', 'G', 'G', 'G', 'Y'], ['G', 'G', 'Y', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'G', 'G', 'G'], ['G', 'G', 'Y', 'G', 'G']] },
  { name: 'Flower', pattern: [['G', 'G', 'Y', 'G', 'G'], ['G', 'Y', 'Gr', 'Y', 'G'], ['G', 'G', 'Y', 'G', 'G'], ['G', 'G', 'Gr', 'G', 'G'], ['Gr', 'G', 'Gr', 'G', 'Gr'], ['Gr', 'Gr', 'Gr', 'Gr', 'Gr']] }
];

function isPatternPossible(patternArr) {
  if (!state.answer || WORD_LIST.length === 0) return true;
  const target = state.answer.toUpperCase();
  const colorMap = { 'G': 'gray', 'Y': 'yellow', 'Gr': 'green' };

  for (let r = 0; r < ROWS; r++) {
    const desired = patternArr[r].map(c => colorMap[c]);
    const hasMatch = WORD_LIST.some(word => {
      const actual = scoreGuess(word.toUpperCase(), target);
      return patternMatches(actual, desired);
    });
    if (!hasMatch) return false;
  }
  return true;
}

let currentPatternFilter = 'all';

function setPatternFilter(filter) {
  currentPatternFilter = filter;
  // Update button active state
  document.querySelectorAll('.filter-pill').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.toLowerCase() === filter.toLowerCase());
  });
  renderExamplesGrid();
}

function openExamplesModal() {
  setPatternFilter('all');
  openModal('examplesModal');
}

function renderExamplesGrid() {
  const grid = document.getElementById('patternsGrid');
  if (!grid) return;

  const patterns = PREMADE_PATTERNS.map((p, idx) => ({
    ...p,
    idx,
    isPossible: isPatternPossible(p.pattern)
  }));

  const filtered = patterns.filter(p => {
    if (currentPatternFilter === 'all') return true;
    if (currentPatternFilter === 'possible') return p.isPossible;
    if (currentPatternFilter === 'impossible') return !p.isPossible;
    return true;
  });



  grid.innerHTML = filtered.map(p => {
    const statusClass = p.isPossible ? 'status-possible' : 'status-impossible';
    const statusText = p.isPossible ? 'Possible' : 'Impossible';

    return `
      <div class="pattern-item ${statusClass}" onclick="applyPremadePattern(${p.idx})">
        <div class="pattern-item-header">
          <div class="pattern-name">${p.name}</div>
          <div class="pattern-pill">${statusText}</div>
        </div>
        <div class="pattern-preview">
          ${p.pattern.map(row => `
            <div class="preview-row">
              ${row.map(c => `<div class="preview-tile preview-${c}"></div>`).join('')}
            </div>
          `).join('')}
        </div>
      </div>
    `;
  }).join('');
}

function applyPremadePattern(idx) {
  saveUndo();
  const p = PREMADE_PATTERNS[idx];
  if (!p) return;

  const colorMap = { 'G': 'gray', 'Y': 'yellow', 'Gr': 'green' };

  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      state.grid[r][c].color = colorMap[p.pattern[r][c]];
      state.grid[r][c].clicked = true;
      state.grid[r][c].letter = '';
    }
  }

  renderGrid();
  closeModal('examplesModal');
  showToast('toastContainer', 'ok', `${p.name} pattern applied!`);
  document.getElementById('step3').classList.add('disabled');
  saveSession();
}

document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
    doUndo(); e.preventDefault(); return;
  }
  if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
    doRedo(); e.preventDefault(); return;
  }

  if (e.key !== 'Tab') return;

  const openModalElement = Array.from(document.querySelectorAll('.modal-overlay'))
    .find(m => m.style.display === 'flex');

  if (!openModalElement) return;

  const focusable = Array.from(openModalElement.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
  if (focusable.length === 0) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];

  if (e.shiftKey) {
    if (document.activeElement === first) {
      last.focus();
      e.preventDefault();
    }
  } else {
    if (document.activeElement === last) {
      first.focus();
      e.preventDefault();
    }
  }
});

window.addEventListener('DOMContentLoaded', () => {
  loadWordList();
  initGrid();
  updateToolbar();
  const savedTheme = localStorage.getItem('wc_theme') || 'beige';
  setTheme(savedTheme);

  if (!localStorage.getItem('wc_intro_v4')) {
    openModal('introModal');
  }

  const urlParams = new URLSearchParams(window.location.search);
  const boardHash = urlParams.get('b');
  if (boardHash) {
    loadFromHash(boardHash);
    window.history.replaceState({}, document.title, window.location.pathname);
  } else {
    // Only check session if we are NOT loading from a shared link
    checkSession();
  }
});

function handleStartOver() {
  localStorage.removeItem('wc_session_state');
  location.reload();
}

function handleResetSession() {
  localStorage.removeItem('wc_session_state');
}

document.addEventListener('mouseup', () => {
  dragging = false;
});

// --- Session Persistence ---
function saveSession() {
  if (state.answer || state.grid.some(row => row.some(cell => cell.color !== 'gray'))) {
    localStorage.setItem('wc_session_state', JSON.stringify({
      answer: state.answer,
      answerType: state.answerType,
      grid: state.grid
    }));
  } else {
    localStorage.removeItem('wc_session_state');
  }
}

function checkSession() {
  // Only show restore prompt if the user reloaded the page (accidental loss protection)
  // performance.getEntriesByType("navigation") is standard for detecting navigation type
  const navEntries = performance.getEntriesByType("navigation");
  const isReload = navEntries.length > 0 && navEntries[0].type === 'reload';

  if (!isReload) {
    // If it's a fresh visit (not a reload), we don't show the prompt.
    return;
  }

  const saved = localStorage.getItem('wc_session_state');
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      // Logic: Only restore if they had a word AND had clicked at least one tile
      const hasWord = !!parsed.answer;
      const hasClickedTiles = parsed.grid && parsed.grid.some(row => row.some(cell => cell.clicked || cell.color !== 'gray'));
      
      if (hasWord && hasClickedTiles) {
        showRestoreToast(parsed);
      }
    } catch (e) {
      localStorage.removeItem('wc_session_state');
    }
  }
}

function showRestoreToast(parsed) {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-info`;
  toast.style.width = '100%';
  toast.style.display = 'flex';
  toast.style.justifyContent = 'space-between';
  toast.style.alignItems = 'center';
  toast.style.padding = '12px 16px';
  toast.style.gap = '16px';

  toast.innerHTML = `
    <span style="font-size: 0.85rem; line-height: 1.2;">Restore your last session?</span>
    <div style="display:flex; gap:8px;">
      <button id="restoreBtn" class="btn btn-primary" style="height: 32px; font-size: 0.8rem; padding: 0 12px; min-height: unset;">Yes</button>
      <button id="dismissRestoreBtn" class="btn btn-ghost" style="height: 32px; font-size: 0.8rem; padding: 0 12px; min-height: unset;">No</button>
    </div>
  `;

  // Insert before other toasts
  container.prepend(toast);

  document.getElementById('restoreBtn').onclick = () => {
    state.answer = parsed.answer;
    state.answerType = parsed.answerType || 'custom';
    state.grid = parsed.grid;
    renderGrid();
    if (state.answer) {
      if (state.answerType === 'custom') {
        const customInput = document.getElementById('customWord');
        if (customInput) customInput.value = state.answer;
        showToast('toastContainer', 'info', `Applied back your custom word: ${state.answer}`);
      } else {
        showToast('toastContainer', 'info', `Fetched today's word again: ${state.answer}`);
      }
      goToStep(2);
    } else {
      showToast('toastContainer', 'info', 'Restored previously painted tiles.');
    }
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  };

  document.getElementById('dismissRestoreBtn').onclick = () => {
    localStorage.removeItem('wc_session_state');
    toast.classList.add('fade-out');
    setTimeout(() => toast.remove(), 400);
  };
}
