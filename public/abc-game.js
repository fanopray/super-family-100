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
let myName = '';
let roomCode = '';
let isHost = false;
let abcTimer = null;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showNotif(msg, type = 'info') {
  const n = document.createElement('div');
  n.style.cssText = `position:fixed;top:20px;left:50%;transform:translateX(-50%);padding:12px 24px;border-radius:10px;font-weight:bold;z-index:1000;color:#fff;max-width:90%;text-align:center;background:${type==='success'?'#38a169':type==='error'?'#c53030':'#357abd'}`;
  n.textContent = msg;
  document.body.appendChild(n);
  setTimeout(() => n.remove(), 2500);
}

// ==========================================
// HOME - Create / Join
// ==========================================
socket.on('connect', () => { myId = socket.id; });

document.getElementById('btnCreateAbc').addEventListener('click', () => {
  const name = document.getElementById('playerNameAbc').value.trim();
  if (!name) { showNotif('Masukkan nama dulu!', 'error'); return; }
  myName = name;
  audioAbc.init();
  socket.emit('abc:create', name);
});

document.getElementById('btnJoinAbc').addEventListener('click', () => {
  const name = document.getElementById('playerNameAbc').value.trim();
  const code = document.getElementById('abcRoomCode').value.trim().toUpperCase();
  if (!name) { showNotif('Masukkan nama dulu!', 'error'); return; }
  if (!code || code.length !== 4) { showNotif('Kode room 4 karakter!', 'error'); return; }
  myName = name;
  audioAbc.init();
  socket.emit('abc:join', { code, name });
});

document.getElementById('abcRoomCode').addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('btnJoinAbc').click();
});
document.getElementById('playerNameAbc').addEventListener('keypress', e => {
  if (e.key === 'Enter') document.getElementById('btnCreateAbc').click();
});

// ==========================================
// SETUP → now merged into lobby
// ==========================================
socket.on('abc:roomCreated', ({ code }) => {
  roomCode = code;
  isHost = true;
  document.getElementById('lobbyCode').textContent = code;
  document.getElementById('hostSettings').style.display = 'block';
  document.getElementById('lobbyInfo').style.display = 'none';
  document.getElementById('hostStartBtn').style.display = 'block';
  document.getElementById('waitingMsg').style.display = 'none';
  showScreen('lobby');
});

// Start game (host) — reads settings from lobby
document.getElementById('btnStartGame').addEventListener('click', () => {
  const selected = document.querySelector('input[name="category"]:checked');
  if (!selected) { showNotif('Pilih kategori!', 'error'); return; }
  const category = selected.value;
  const method = document.getElementById('letterMethod').value;
  socket.emit('abc:startGame', { code: roomCode, category, letterMethod: method });
});

// ==========================================
// LOBBY (Kumpulin pemain)
// ==========================================
socket.on('abc:joined', ({ code }) => {
  roomCode = code;
  isHost = false;
  showScreen('lobby');
});

socket.on('abc:lobbyUpdate', ({ code, players, category, letterMethod, hostId }) => {
  document.getElementById('lobbyCode').textContent = code;
  document.getElementById('playerCount').textContent = `${players.length}/5 pemain`;

  const list = document.getElementById('playerList');
  list.innerHTML = '';
  players.forEach(p => {
    const isMe = p.id === myId;
    const isHostPlayer = p.id === hostId;
    list.innerHTML += `<div class="player-item ${isMe ? 'me' : ''}">
      <span class="name">${p.name}</span>
      ${isHostPlayer ? '<span class="host-badge">👑 HOST</span>' : ''}
      ${isMe ? '<span class="you-badge">← Kamu</span>' : ''}
    </div>`;
  });

  // Host sees settings, others see info
  if (myId === hostId) {
    document.getElementById('hostSettings').style.display = 'block';
    document.getElementById('lobbyInfo').style.display = 'none';
    document.getElementById('hostStartBtn').style.display = 'block';
    document.getElementById('waitingMsg').style.display = 'none';
  } else {
    document.getElementById('hostSettings').style.display = 'none';
    document.getElementById('lobbyInfo').style.display = 'flex';
    document.getElementById('lobbyCategory').textContent = `Kategori: ${(category || '?').toUpperCase()}`;
    document.getElementById('lobbyMethod').textContent = `Huruf: ${letterMethod === 'random' ? 'Random' : 'Input Angka'}`;
    document.getElementById('hostStartBtn').style.display = 'none';
    document.getElementById('waitingMsg').style.display = 'block';
  }
});

socket.on('error', msg => showNotif(msg, 'error'));

// ==========================================
// NUMBER INPUT
// ==========================================
socket.on('abc:requestNumber', ({ round }) => {
  showScreen('number');
  document.getElementById('numberInput').value = '';
  document.getElementById('numberHint').textContent = `Babak ${round} — semua pemain input angka, lalu dijumlahkan!`;
  document.getElementById('numberInput').focus();
  document.getElementById('btnSubmitNumber').disabled = false;
  document.getElementById('btnSubmitNumber').textContent = 'OK';
});

document.getElementById('btnSubmitNumber').addEventListener('click', () => {
  const num = parseInt(document.getElementById('numberInput').value);
  if (!num || num < 1 || num > 100) { showNotif('Masukkan angka 1-100!', 'error'); return; }
  socket.emit('abc:submitNumber', { code: roomCode, number: num });
});

socket.on('abc:numberSubmitted', () => {
  document.getElementById('btnSubmitNumber').disabled = true;
  document.getElementById('btnSubmitNumber').textContent = '✓ Terkirim';
  document.getElementById('numberHint').textContent = '⏳ Mohon tunggu, pemain lain sedang menginput angka...';
});

socket.on('abc:numberProgress', ({ submitted, total }) => {
  if (document.getElementById('btnSubmitNumber').disabled) {
    document.getElementById('numberHint').textContent = `⏳ Menunggu pemain lain... (${submitted}/${total} sudah input)`;
  }
});

socket.on('abc:numberResult', ({ sum, letter }) => {
  document.getElementById('numberHint').textContent = `Total: ${sum} → Huruf: ${letter}`;
  showNotif(`Jumlah: ${sum} → Huruf ${letter}!`, 'success');
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
  showScreen('game');
  document.getElementById('abcRoundDisplay').textContent = `Babak ${round}/${totalRounds}`;
  document.getElementById('abcCategoryDisplay').textContent = `Kategori: ${category.toUpperCase()}`;
  document.getElementById('currentLetter').textContent = letter.toUpperCase();
  document.getElementById('answersScroll').innerHTML = '';
  document.getElementById('abcAnswerInput').value = '';
  document.getElementById('abcStatusText').textContent = '🎯 Sebutkan sebanyak-banyaknya!';
  document.getElementById('abcAnswerContainer').style.display = 'flex';
  renderScoreboard(players, scores);
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
    if (valid) { audioAbc.playCorrect(); }
    else { audioAbc.playWrong(); showNotif(`❌ Tidak valid / sudah disebut!`, 'error'); }
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
  document.getElementById('abcStatusText').textContent = '⏰ Waktu habis!';
  audioAbc.playRoundWin();
  renderScoreboard(players, scores);
});

socket.on('abc:gameOver', ({ players, scores, ranking }) => {
  clearInterval(abcTimer);
  audioAbc.stopBGM();
  audioAbc.playGameOver();
  let html = '';
  ranking.forEach((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    const cls = i === 0 ? 'gold' : i === 1 ? 'silver' : i === 2 ? 'bronze' : '';
    html += `<p class="podium ${cls}">${medal} ${r.name} — ${r.score} poin</p>`;
  });
  document.getElementById('abcGameoverTitle').textContent = ranking[0].id === myId ? '🎉 Kamu Menang! 🎉' : `🏆 ${ranking[0].name} Menang!`;
  document.getElementById('abcGameoverResult').innerHTML = html;
  showScreen('gameover');
});

socket.on('abc:playerDisconnected', ({ name }) => {
  showNotif(`${name} keluar dari game`, 'error');
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

socket.on('abc:restart', () => {
  showScreen('lobby');
  showNotif('Kembali ke lobby! Host bisa mulai lagi.', 'info');
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
