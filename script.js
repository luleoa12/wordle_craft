const ROWS = 6;
const COLS = 5;
const CYCLE = ['gray', 'yellow', 'green'];

let state = {
  answer: '',
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
    console.info(`[WordList] Loaded ${WORD_LIST.length} words from words.txt`);
  } catch (err) {
    console.error(`[WordList] Failed to load words.txt:`, err);
    showToast('toastContainer', 'error', 'Failed to load word list. Please refresh.');
  }
}

// Init 
function initGrid() {
  state.grid = [];
  for (let r = 0; r < ROWS; r++) {
    state.grid.push([]);
    for (let c = 0; c < COLS; c++) {
      state.grid[r].push({ letter: '', color: 'gray' });
    }
  }
  renderGrid();
}

function getGridHTML(interactive) {
  let html = '';
  for (let r = 0; r < ROWS; r++) {
    html += `<div class="grid-row-wrap"><div class="grid-row">`;
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];
      const val = cell.letter;
      const clsStr = `tile tile-${cell.color}`;

      let clickAttr = '';
      if (interactive) {
        if (state.answer) {
          clickAttr = `onclick="cycleTile(${r}, ${c})"`;
        } else {
          clickAttr = `onclick="showToast('toastContainer', 'warn', 'Initialize payload first on Step 1!')"`;
        }
      }

      html += `<div id="tile-${interactive ? 'edit' : 'prev'}-${r}-${c}" class="${clsStr}" ${clickAttr}"></div>`;
    }
    html += `</div></div>`;
  }
  return html;
}

function renderGrid() {
  document.getElementById('gridBuilder').innerHTML = getGridHTML(true);
}

function cycleTile(r, c) {
  const cell = state.grid[r][c];
  const idx = CYCLE.indexOf(cell.color);
  cell.color = CYCLE[(idx + 1) % CYCLE.length];
  cell.letter = '';

  const tileEdit = document.getElementById(`tile-edit-${r}-${c}`);
  if (tileEdit) {
    tileEdit.className = `tile tile-${cell.color}`;
    tileEdit.textContent = '';
  }

  const tilePrev = document.getElementById(`tile-prev-${r}-${c}`);
  if (tilePrev) {
    tilePrev.className = `tile tile-${cell.color}`;
    tilePrev.textContent = '';
  }

  for (let i = 0; i < COLS; i++) {
    const tile = document.getElementById(`tile-edit-${r}-${i}`);
    if (tile) tile.classList.remove('pulse-error');
  }
  if (window._impossibleRows) {
    window._impossibleRows = window._impossibleRows.filter(row => row !== r);
  }
  clearToast('step2Toast');

  document.getElementById('step3').classList.add('disabled');
}

// Fetch word 
async function fetchTodaysWord() {
  if (state.loading) return;
  state.loading = true;
  const icon = document.getElementById('fetchIcon');

  try {
    const today = new Date().toLocaleDateString("en-CA");
    const res = await fetch(`https://wordle-craft.luleoa12.workers.dev?date=${today}`);
    const data = await res.json();
    const word = data.answer?.toUpperCase();

    if (word && /^[A-Z]{5}$/.test(word)) {
      applyAnswer(word);
      showToast('toastContainer', 'ok', 'Word successfully fetched');
    } else {
      console.error(`[Fetch] Validation failed. Word: "${word}"`);
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

function applyAnswer(word) {
  state.answer = word.toUpperCase();
  renderGrid();
  goToStep(2);
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
  generateShare();
  goToStep(3);
}

function resetGrid() {
  initGrid();
  renderGrid();
  document.getElementById('step3').classList.add('disabled');
}

// Shuffle board with valid patterns
function randomizeBoard() {
  if (!state.answer) { showToast('toastContainer', 'warn', 'Set target first.'); return; }
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
// Theme Switcher 
const THEMES = {
  beige: { bg: '#ece0c2', btn: '#d4a373', body: '#fdfaf5' },
  blue: { bg: '#BAE6FD', btn: '#38bdf8', body: '#e0f2fe' },
  green: { bg: '#BBF7D0', btn: '#4ade80', body: '#dcfce7' },
  yellow: { bg: '#FEF08A', btn: '#facc15', body: '#fef9c3' },
  orange: { bg: '#FED7AA', btn: '#fb923c', body: '#ffedd5' },
  pink: { bg: '#FBCFE8', btn: '#f472b6', body: '#fce7f3' },
  purple: { bg: '#E9D5FF', btn: '#c084fc', body: '#f3e8ff' },
};

function setTheme(themeName) {
  const t = THEMES[themeName] || THEMES['beige'];
  const root = document.documentElement;
  root.style.setProperty('--bg-main', t.body);
  root.style.setProperty('--bg-panel', t.bg);
  root.style.setProperty('--accent-primary', t.btn);
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
}

function openModal(id) {
  const modal = document.getElementById(id);
  if (!modal) return;
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

function closeIntro() {
  closeModal('introModal');
  localStorage.setItem('wc_intro_v4', 'true');
}

document.addEventListener('keydown', (e) => {
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
  const savedTheme = localStorage.getItem('wc_theme') || 'beige';
  setTheme(savedTheme);

  if (!localStorage.getItem('wc_intro_v4')) {
    openModal('introModal');
  }
});
