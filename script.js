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

function getGridHTML(interactive) {
  let html = '';
  for (let r = 0; r < ROWS; r++) {
    html += `<div class="grid-row-wrap"><div class="grid-row">`;
    for (let c = 0; c < COLS; c++) {
      const cell = state.grid[r][c];
      const clsStr = `tile tile-${cell.color} ${cell.clicked ? 'tile-clicked' : ''}`;

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
  cell.clicked = true;

  const tileEdit = document.getElementById(`tile-edit-${r}-${c}`);
  if (tileEdit) {
    tileEdit.className = `tile tile-${cell.color} tile-clicked`;
    tileEdit.textContent = '';
  }

  const tilePrev = document.getElementById(`tile-prev-${r}-${c}`);
  if (tilePrev) {
    tilePrev.className = `tile tile-${cell.color} tile-clicked`;
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
    const now = new Date().toISOString();
    console.log(now)
    const res = await fetch(`https://wordle-craft.luleoa12.workers.dev?datetime=${now}`);
    const data = await res.json();
    const word = data.answer?.toUpperCase();

    if (word && /^[A-Z]{5}$/.test(word)) {
      applyAnswer(word);
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
  initGrid();
  renderGrid();
  document.getElementById('step3').classList.add('disabled');
}

function shuffleColors(color1, color2) {
  if (!state.answer) { showToast('toastContainer', 'warn', 'Set target first.'); return; }

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
