const socket = io();
const audioAbc = new AudioManager();

const screens = {
  home: document.getElementById('screen-home'),
  lobby: document.getElementById('screen-lobby'),
  number: document.getElementById('screen-number'),
  game: document.getElementById('screen-game'),
  gameover: document.getElementById('screen-gameover')
};

let myId = null;
let roomCode = '';
let isHost = false;
let abcTimer = null;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showNotif(msg, type = 'info') {
  const n = document.createElement('div');
  n.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:10px;font-weight:bold;z-index:1000;animation:slideD .3s ease;color:#fff;background:${type==='success'?'#38a169':type==='error'?'#c53030':'#357abd'}`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2500);
}

// ==========================================
// HOME
// ==========================================
socket.on('connect', () => { myId = socket.id; });

document.getElementById('btnCreateAbc').addEventListener('click', () => {
  audioAbc.init();
  socket.emit('abc:create');
});

document.getElementById('btnJoinAbc').addEventListener('click', () => {
  const code = document.getElementById('abcRoomCode').value.trim().toUpperCase();
  if (!code || code.length !== 4) { showNotif('Kode 4 karakter!', 'error'); return; }
  audioAbc.init();
  socket.emit('abc:join', code);
});

document.getElementById('abcRoomCode').addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('btnJoinAbc').click();
});

// ==========================================
// LOBBY
// ==========================================
socket.on('abc:roomCreated', ({ code }) => {
  roomCode = code;
  isHost = true;
  document.getElementById('lobbyCode').textContent = code;
  document.getElementById('hostControls').style.display = 'block';
  showScreen('lobby');
});

socket.on('abc:joined', ({ code }) => {
  roomCode = code;
  isHost = false;
  document.getElementById('lobbyCode').textContent = code;
  document.getElementById('hostControls').style.display = 'none';
  showScreen('lobby');
});

socket.on('abc:playerList', (players) => {
  const list = document.getElementById('playerList');
  list.innerHTML = '';
  players.forEach((p, i) => {
    list.innerHTML += `<div class="player-item"><span class="name">${p.name}</span>${i===0?'<span class="host-badge">HOST</span>':''}</div>`;
  });
  document.getElementById('lobbyHint').textContent = `${players.length}/5 pemain`;
});

socket.on('error', msg => showNotif(msg, 'error'));

// Start game (host only)
document.getElementById('btnStartGame').addEventListener('click', () => {
  const checkboxes = document.querySelectorAll('#categoryCheckboxes input:checked');
  const categories = Array.from(checkboxes).map(c => c.value);
  if (categories.length !== 5) { showNotif('Pilih tepat 5 kategori!', 'error'); return; }
  const method = document.getElementById('letterMethod').value;
  socket.emit('abc:startGame', { categories, letterMethod: method });
});

// ==========================================
// NUMBER INPUT
// ==========================================
socket.on('abc:requestNumber', () => {
  showScreen('number');
  document.getElementById('numberInput').value = '';
  document.getElementById('numberInput').focus();
});

document.getElementById('btnSubmitNumber').addEventListener('click', () => {
  const num = parseInt(document.getElementById('numberInput').value);
  if (!num || num < 1 || num > 100) { showNotif('Masukkan angka 1-100!', 'error'); return; }
  socket.emit('abc:submitNumber', { code: roomCode, number: num });
  showScreen('game');
});

document.getElementById('numberInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('btnSubmitNumber').click();
});

// ==========================================
// GAME
// ==========================================
socket.on('abc:gameStart', () => {
  audioAbc.startBGM();
  showScreen('game');
});

socket.on('abc:newRound', ({ round, totalRounds, category, letter, players, scores }) => {
  document.getElementById('abcRoundDisplay').textContent = `Babak ${round}/${totalRounds}`;
  document.getElementById('abcCategoryDisplay').textContent = `Kategori: ${category.toUpperCase()}`;
  document.getElementById('currentLetter').textContent = letter.toUpperCase();
  document.getElementById('answersScroll').innerHTML = '';
  document.getElementById('abcAnswerInput').value = '';
  document.getElementById('abcStatusText').textContent = '🎯 Sebutkan sebanyak-banyaknya!';
  document.getElementById('abcAnswerContainer').style.display = 'flex';

  // Update scoreboard
  renderScoreboard(players, scores);

  // Focus input
  setTimeout(() => document.getElementById('abcAnswerInput').focus(), 300);
});

socket.on('abc:timerStart', ({ duration }) => {
  clearInterval(abcTimer);
  let timeLeft = duration;
  document.getElementById('abcTimerText').textContent = timeLeft;
  document.getElementById('abcTimerFill').style.width = '100%';

  abcTimer = setInterval(() => {
    timeLeft--;
    if (timeLeft < 0) { clearInterval(abcTimer); return; }
    document.getElementById('abcTimerText').textContent = timeLeft;
    const pct = (timeLeft / duration) * 100;
    document.getElementById('abcTimerFill').style.width = pct + '%';
    document.getElementById('abcTimerFill').style.background =
      timeLeft <= 10 ? '#e53e3e' : timeLeft <= 20 ? '#ffd700' : '#48bb78';
    if (timeLeft <= 5 && timeLeft > 0) audioAbc.playCountdown();
  }, 1000);
});

socket.on('abc:answerResult', ({ playerName, word, valid, playerId }) => {
  const scroll = document.getElementById('answersScroll');
  const entry = document.createElement('div');
  entry.className = `answer-entry ${valid ? 'valid' : 'invalid'}`;
  entry.innerHTML = `<span class="entry-word">${valid ? '✅' : '❌'} ${word}</span><span class="entry-player">${playerName}</span>`;
  scroll.appendChild(entry);
  scroll.scrollTop = scroll.scrollHeight;

  if (playerId === myId) {
    if (valid) { audioAbc.playCorrect(); showNotif(`✅ ${word}`, 'success'); }
    else { audioAbc.playWrong(); showNotif(`❌ ${word} - tidak valid!`, 'error'); }
  }
  document.getElementById('abcAnswerInput').value = '';
  document.getElementById('abcAnswerInput').focus();
});

socket.on('abc:scoreUpdate', ({ players, scores }) => {
  renderScoreboard(players, scores);
});

socket.on('abc:roundEnd', ({ players, scores }) => {
  clearInterval(abcTimer);
  document.getElementById('abcAnswerContainer').style.display = 'none';
  document.getElementById('abcStatusText').textContent = '⏰ Waktu habis! Babak selesai.';
  audioAbc.playRoundWin();
  renderScoreboard(players, scores);
});

socket.on('abc:gameOver', ({ players, scores, ranking }) => {
  clearInterval(abcTimer);
  audioAbc.stopBGM();
  audioAbc.playGameOver();

  let html = '';
  ranking.forEach((r, i) => {
    const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    html += `<p class="podium ${cls}">${medal} ${r.name} — ${r.score} poin</p>`;
  });

  document.getElementById('abcGameoverTitle').textContent = ranking[0].id === myId ? '🎉 Kamu Menang! 🎉' : `🏆 ${ranking[0].name} Menang!`;
  document.getElementById('abcGameoverResult').innerHTML = html;
  showScreen('gameover');
});

socket.on('abc:playerDisconnected', ({ name }) => {
  showNotif(`${name} keluar!`, 'error');
});

// ==========================================
// INPUT
// ==========================================
document.getElementById('btnAbcSubmit').addEventListener('click', submitAbcAnswer);
document.getElementById('abcAnswerInput').addEventListener('keypress', e => {
  if (e.key === 'Enter') submitAbcAnswer();
});

function submitAbcAnswer() {
  const input = document.getElementById('abcAnswerInput');
  const word = input.value.trim();
  if (!word) return;
  socket.emit('abc:answer', { code: roomCode, word });
}

document.getElementById('btnAbcPlayAgain').addEventListener('click', () => {
  socket.emit('abc:playAgain', roomCode);
});

document.getElementById('btnAbcHome').addEventListener('click', () => {
  window.location.reload();
});

socket.on('abc:restart', () => {
  showScreen('lobby');
  showNotif('Game di-reset! Host bisa mulai lagi.', 'info');
});

// ==========================================
// HELPERS
// ==========================================
function renderScoreboard(players, scores) {
  const sb = document.getElementById('scoreboardAbc');
  sb.innerHTML = '';
  players.forEach(p => {
    sb.innerHTML += `<div class="score-chip ${p.id === myId ? 'me' : ''}"><span class="chip-name">${p.name}</span><span class="chip-score">${scores[p.id] || 0}</span></div>`;
  });
}

function toggleMuteAbc() {
  const muted = audioAbc.toggle();
  document.getElementById('btnMuteAbc').textContent = muted ? '🔇' : '🔊';
}
