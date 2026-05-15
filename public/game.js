const socket = io();

const screens = {
  mode: document.getElementById('screen-mode'),
  lobby: document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game: document.getElementById('screen-game'),
  gameover: document.getElementById('screen-gameover')
};

let myId = null;
let myName = '';
let roomCode = '';
let gameMode = null;
let clientTimer = null;

// Single Player State
let spQuestions = [];
let spCurrentRound = 0;
let spTotalRounds = 5;
let spScore = 0;
let spStrikes = 0;
let spMaxStrikes = 3;
let spRevealedAnswers = [];
let spTimer = null;
let spTimeLeft = 30;

function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

function showNotification(message, type = 'info') {
  const notif = document.createElement('div');
  notif.className = `notification ${type}`;
  notif.textContent = message;
  document.body.appendChild(notif);
  setTimeout(() => notif.remove(), 3000);
}

// ==========================================
// MODE SELECT
// ==========================================
document.getElementById('btnSinglePlayer').addEventListener('click', () => {
  gameMode = 'single';
  startSinglePlayer();
});

document.getElementById('btnMultiPlayer').addEventListener('click', () => {
  gameMode = 'multi';
  showScreen('lobby');
});

document.getElementById('btnBackFromLobby').addEventListener('click', () => {
  showScreen('mode');
});

// ==========================================
// SINGLE PLAYER
// ==========================================
async function startSinglePlayer() {
  try {
    const res = await fetch('/api/questions');
    const allQuestions = await res.json();
    spQuestions = allQuestions.sort(() => Math.random() - 0.5).slice(0, spTotalRounds);
    spCurrentRound = 0;
    spScore = 0;

    document.getElementById('name-left').textContent = 'Kamu';
    document.getElementById('name-right').textContent = 'Target';
    document.getElementById('points-left').textContent = '0';
    document.getElementById('points-right').textContent = '100';
    document.getElementById('score-right').classList.remove('active-turn');
    document.getElementById('score-left').classList.add('active-turn');
    document.getElementById('multiplierDisplay').style.display = 'none';

    showScreen('game');
    spStartRound();
  } catch (err) {
    showNotification('Gagal memuat pertanyaan!', 'error');
  }
}

function spStartRound() {
  if (spCurrentRound >= spTotalRounds) { spEndGame(); return; }

  const question = spQuestions[spCurrentRound];
  spStrikes = 0;
  spRevealedAnswers = [];
  spTimeLeft = 30;

  document.getElementById('roundDisplay').textContent = `Ronde ${spCurrentRound + 1}/${spTotalRounds}`;
  document.getElementById('questionText').textContent = question.question;
  document.getElementById('strikesDisplay').innerHTML = '';
  document.getElementById('buzzerContainer').style.display = 'none';
  document.getElementById('chooseContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'flex';
  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').focus();
  document.getElementById('statusText').textContent = '🎯 Tebak jawaban survei terpopuler!';
  document.getElementById('timerContainer').style.display = 'block';

  generateAnswerBoard(question.answers.length);
  spStartTimer();
}

function spStartTimer() {
  clearInterval(spTimer);
  spTimeLeft = 30;
  updateTimerDisplay();
  spTimer = setInterval(() => {
    spTimeLeft--;
    updateTimerDisplay();
    if (spTimeLeft <= 0) { clearInterval(spTimer); spRoundTimeout(); }
  }, 1000);
}

function updateTimerDisplay() {
  document.getElementById('timerText').textContent = spTimeLeft;
  const pct = (spTimeLeft / 30) * 100;
  document.getElementById('timerFill').style.width = pct + '%';
  document.getElementById('timerFill').style.background =
    spTimeLeft <= 10 ? '#e53e3e' : spTimeLeft <= 20 ? '#ffd700' : '#48bb78';
}

function spRoundTimeout() {
  showNotification('⏰ Waktu habis!', 'error');
  spRevealAll();
  spCurrentRound++;
  setTimeout(() => spStartRound(), 3000);
}

function spSubmitAnswer(answer) {
  const question = spQuestions[spCurrentRound];
  const normalized = answer.toLowerCase().trim();
  let matched = null;
  for (let i = 0; i < question.answers.length; i++) {
    if (spRevealedAnswers.includes(i)) continue;
    const ans = question.answers[i].text.toLowerCase();
    if (ans.includes(normalized) || normalized.includes(ans)) { matched = i; break; }
  }

  if (matched !== null) {
    spRevealedAnswers.push(matched);
    spScore += question.answers[matched].score;
    revealCard(matched, question.answers[matched].text, question.answers[matched].score);
    document.getElementById('points-left').textContent = spScore;
    showNotification(`✅ "${question.answers[matched].text}" - ${question.answers[matched].score} poin!`, 'success');
    if (spRevealedAnswers.length === question.answers.length) {
      clearInterval(spTimer);
      showNotification('🎉 Sempurna!', 'success');
      spCurrentRound++;
      setTimeout(() => spStartRound(), 2000);
    }
  } else {
    spStrikes++;
    showStrikes(spStrikes);
    showNotification(`❌ "${answer}" tidak ada!`, 'error');
    if (spStrikes >= spMaxStrikes) {
      clearInterval(spTimer);
      showNotification('💥 3 Strike!', 'error');
      spRevealAll();
      spCurrentRound++;
      setTimeout(() => spStartRound(), 3000);
    }
  }
  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').focus();
}

function spRevealAll() {
  const question = spQuestions[spCurrentRound];
  question.answers.forEach((ans, i) => {
    if (!spRevealedAnswers.includes(i)) {
      setTimeout(() => revealCard(i, ans.text, ans.score), (i + 1) * 200);
    }
  });
}

function spEndGame() {
  clearInterval(spTimer);
  document.getElementById('timerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'none';
  let maxScore = 0;
  spQuestions.forEach(q => q.answers.forEach(a => maxScore += a.score));
  const pct = (spScore / maxScore) * 100;
  let grade = pct >= 80 ? '🌟 LUAR BIASA!' : pct >= 60 ? '👏 HEBAT!' : pct >= 40 ? '👍 BAGUS!' : pct >= 20 ? '😊 LUMAYAN!' : '💪 COBA LAGI!';
  document.getElementById('gameoverTitle').textContent = '🎮 Single Player Selesai!';
  document.getElementById('gameoverResult').innerHTML = `
    <p class="winner-name">${grade}</p>
    <p class="final-score">Skor: ${spScore} / ${maxScore} (${Math.round(pct)}%)</p>
  `;
  showScreen('gameover');
}

// ==========================================
// MULTIPLAYER
// ==========================================
document.getElementById('btnCreate').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  if (!name) { showNotification('Masukkan nama!', 'error'); return; }
  myName = name;
  socket.emit('createRoom', name);
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name) { showNotification('Masukkan nama!', 'error'); return; }
  if (!code || code.length !== 4) { showNotification('Kode room 4 karakter!', 'error'); return; }
  myName = name;
  socket.emit('joinRoom', { code, playerName: name });
});

socket.on('connect', () => { myId = socket.id; });

socket.on('roomCreated', ({ code, player }) => {
  roomCode = code; myId = player.id;
  document.getElementById('displayRoomCode').textContent = code;
  showScreen('waiting');
});

socket.on('roomJoined', ({ code, player, opponent }) => {
  roomCode = code; myId = player.id;
  setupMultiplayer(player, opponent);
  showScreen('game');
});

socket.on('opponentJoined', (opponent) => {
  showNotification(`${opponent.name} bergabung!`, 'success');
  setupMultiplayer({ id: myId, name: myName }, opponent);
  showScreen('game');
});

socket.on('error', (msg) => showNotification(msg, 'error'));

function setupMultiplayer(me, opponent) {
  document.getElementById('name-left').textContent = me.name;
  document.getElementById('name-right').textContent = opponent.name;
  document.getElementById('points-left').textContent = '0';
  document.getElementById('points-right').textContent = '0';
  document.getElementById('timerContainer').style.display = 'block';
  document.getElementById('multiplierDisplay').style.display = 'block';
}

// --- ROUND START ---
socket.on('newRound', ({ round, totalRounds, question, answerCount, scores, multiplier }) => {
  document.getElementById('roundDisplay').textContent = `Ronde ${round}/${totalRounds}`;
  document.getElementById('questionText').textContent = question;
  document.getElementById('strikesDisplay').innerHTML = '';
  document.getElementById('statusText').textContent = 'Bersiap...';
  document.getElementById('buzzerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'none';
  document.getElementById('chooseContainer').style.display = 'none';
  document.getElementById('multiplierDisplay').textContent = `Poin: ${multiplier}x`;
  updateScores(scores);
  generateAnswerBoard(answerCount);
  document.getElementById('score-left').classList.remove('active-turn');
  document.getElementById('score-right').classList.remove('active-turn');
});

// --- BUZZER ---
socket.on('buzzerReady', () => {
  document.getElementById('buzzerContainer').style.display = 'block';
  document.getElementById('answerContainer').style.display = 'none';
  document.getElementById('statusText').textContent = '🔔 Tekan BUZZER secepat mungkin!';
});

socket.on('buzzerWon', ({ winnerId, winnerName }) => {
  document.getElementById('buzzerContainer').style.display = 'none';
  if (winnerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '🎯 Kamu menang buzzer! Jawab dalam 15 detik!';
  } else {
    document.getElementById('answerContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `🔔 ${winnerName} menang buzzer!`;
  }
  setActiveTurn(winnerId);
});

// --- FACE-OFF ---
socket.on('faceOffSwitch', ({ newPlayerId, newPlayerName }) => {
  if (newPlayerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '🎯 Giliran kamu! Jawab dalam 15 detik!';
  } else {
    document.getElementById('answerContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `Giliran ${newPlayerName} menjawab...`;
  }
  setActiveTurn(newPlayerId);
});

socket.on('buzzerWrongAnswer', ({ playerId, answer }) => {
  if (playerId === myId) {
    showNotification(`❌ "${answer}" salah!`, 'error');
  } else {
    showNotification(`❌ Lawan salah: "${answer}"`, 'info');
  }
  document.getElementById('answerInput').value = '';
});

// --- CHOOSE MAIN/LEMPAR ---
socket.on('chooseMainLempar', ({ chooserId, chooserName }) => {
  document.getElementById('answerContainer').style.display = 'none';
  if (chooserId === myId) {
    document.getElementById('chooseContainer').style.display = 'flex';
    document.getElementById('statusText').textContent = '🤔 Pilih MAIN atau LEMPAR ke lawan?';
  } else {
    document.getElementById('chooseContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `${chooserName} sedang memilih main atau lempar...`;
  }
});

document.getElementById('btnMain').addEventListener('click', () => {
  socket.emit('chooseMainOrLempar', { code: roomCode, choice: 'main' });
  document.getElementById('chooseContainer').style.display = 'none';
});

document.getElementById('btnLempar').addEventListener('click', () => {
  socket.emit('chooseMainOrLempar', { code: roomCode, choice: 'lempar' });
  document.getElementById('chooseContainer').style.display = 'none';
});

// --- PLAY PHASE ---
socket.on('playPhaseStart', ({ activePlayerId, activePlayerName }) => {
  document.getElementById('chooseContainer').style.display = 'none';
  document.getElementById('strikesDisplay').innerHTML = '';
  if (activePlayerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '🎯 Tebak semua jawaban! 30 detik per jawaban.';
  } else {
    document.getElementById('answerContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `${activePlayerName} sedang bermain...`;
  }
  setActiveTurn(activePlayerId);
});

// --- STEAL PHASE ---
socket.on('stealPhase', ({ stealPlayerId, stealPlayerName }) => {
  document.getElementById('strikesDisplay').innerHTML = '';
  if (stealPlayerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').value = '';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '⚡ STEAL! 1 kesempatan, 15 detik!';
  } else {
    document.getElementById('answerContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `⚡ ${stealPlayerName} mencoba steal!`;
  }
  setActiveTurn(stealPlayerId);
});

socket.on('stealFailed', ({ activePlayerName }) => {
  showNotification(`❌ Steal gagal! Poin ke ${activePlayerName}`, 'info');
});

// --- ANSWERS ---
socket.on('correctAnswer', ({ index, text, score, playerId }) => {
  revealCard(index, text, score);
  showNotification(`✅ "${text}" - ${score} poin!`, 'success');
  document.getElementById('answerInput').value = '';
});

socket.on('wrongAnswer', ({ strikes, playerId, answer }) => {
  showStrikes(strikes);
  if (playerId === myId) {
    showNotification(`❌ "${answer}" salah!`, 'error');
  } else {
    showNotification(`❌ Lawan salah: "${answer}"`, 'info');
  }
  document.getElementById('answerInput').value = '';
});

// --- TIMER ---
socket.on('startTimer', ({ duration, phase }) => {
  startClientTimer(duration);
});

function startClientTimer(duration) {
  clearInterval(clientTimer);
  let timeLeft = duration;
  document.getElementById('timerContainer').style.display = 'block';
  document.getElementById('timerText').textContent = timeLeft;
  document.getElementById('timerFill').style.width = '100%';

  clientTimer = setInterval(() => {
    timeLeft--;
    if (timeLeft < 0) { clearInterval(clientTimer); return; }
    document.getElementById('timerText').textContent = timeLeft;
    const pct = (timeLeft / duration) * 100;
    document.getElementById('timerFill').style.width = pct + '%';
    document.getElementById('timerFill').style.background =
      timeLeft <= 5 ? '#e53e3e' : timeLeft <= 10 ? '#ffd700' : '#48bb78';
  }, 1000);
}

// --- ROUND COMPLETE ---
socket.on('roundComplete', ({ winnerId, winnerName, roundScore, multiplier, finalScore, scores, allAnswers }) => {
  clearInterval(clientTimer);
  document.getElementById('answerContainer').style.display = 'none';
  document.getElementById('chooseContainer').style.display = 'none';
  document.getElementById('statusText').textContent = `🏆 ${winnerName} +${finalScore} poin! (${roundScore} × ${multiplier})`;
  updateScores(scores);

  if (allAnswers) {
    allAnswers.forEach((ans, i) => {
      const card = document.getElementById(`answer-${i}`);
      if (card && !card.classList.contains('revealed')) {
        setTimeout(() => revealCard(i, ans.text, ans.score), (i + 1) * 250);
      }
    });
  }
  showNotification(`${winnerName} +${finalScore} (${multiplier}x)`, 'success');
});

// --- GAME OVER ---
socket.on('gameOver', ({ winner, winnerId, scores, players, isDraw }) => {
  clearInterval(clientTimer);
  let html = '';
  if (isDraw) {
    html = `<p class="winner-name">🤝 SERI!</p>
      <p class="final-score">${players[0].name}: ${scores[players[0].id]} - ${players[1].name}: ${scores[players[1].id]}</p>`;
  } else {
    const loser = players.find(p => p.id !== winnerId);
    html = `<p class="winner-name">🏆 ${winner} Menang!</p>
      <p class="final-score">${winner}: ${scores[winnerId]}</p>
      <p class="final-score">${loser.name}: ${scores[loser.id]}</p>`;
    document.getElementById('gameoverTitle').textContent = winnerId === myId ? '🎉 Kamu Menang! 🎉' : '😢 Kamu Kalah! 😢';
  }
  document.getElementById('gameoverResult').innerHTML = html;
  showScreen('gameover');
});

socket.on('playerDisconnected', ({ name }) => {
  clearInterval(clientTimer);
  showNotification(`${name} terputus!`, 'error');
  setTimeout(() => showScreen('mode'), 2000);
});

// ==========================================
// HELPERS
// ==========================================
function generateAnswerBoard(count) {
  const board = document.getElementById('answerBoard');
  board.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.id = `answer-${i}`;
    card.innerHTML = `<span class="answer-number">${i + 1}</span><span class="answer-text">???</span><span class="answer-score"></span>`;
    board.appendChild(card);
  }
}

function revealCard(index, text, score) {
  const card = document.getElementById(`answer-${index}`);
  if (card) {
    card.classList.add('revealed');
    card.querySelector('.answer-text').textContent = text;
    card.querySelector('.answer-score').textContent = score;
  }
}

function showStrikes(count) {
  const div = document.getElementById('strikesDisplay');
  div.innerHTML = '';
  for (let i = 0; i < count; i++) div.innerHTML += '<span class="strike-x">✕</span>';
}

function updateScores(scores) {
  document.getElementById('points-left').textContent = scores[myId] || 0;
  for (const id in scores) {
    if (id !== myId) document.getElementById('points-right').textContent = scores[id] || 0;
  }
}

function setActiveTurn(playerId) {
  document.getElementById('score-left').classList.remove('active-turn');
  document.getElementById('score-right').classList.remove('active-turn');
  if (playerId === myId) document.getElementById('score-left').classList.add('active-turn');
  else document.getElementById('score-right').classList.add('active-turn');
}

// ==========================================
// INPUT EVENTS
// ==========================================
document.getElementById('btnBuzzer').addEventListener('click', () => {
  if (gameMode === 'multi') socket.emit('buzzer', roomCode);
});

document.getElementById('btnSubmitAnswer').addEventListener('click', () => submitAnswer());

document.getElementById('answerInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') submitAnswer();
});

document.getElementById('btnPass').addEventListener('click', () => {
  if (gameMode === 'single') {
    clearInterval(spTimer);
    spRevealAll();
    spCurrentRound++;
    setTimeout(() => spStartRound(), 2500);
  }
});

document.getElementById('btnPlayAgain').addEventListener('click', () => window.location.reload());

function submitAnswer() {
  const input = document.getElementById('answerInput');
  const answer = input.value.trim();
  if (!answer) return;

  if (gameMode === 'single') {
    spSubmitAnswer(answer);
  } else {
    // Determine which phase we're in based on server state
    socket.emit('faceOffAnswer', { code: roomCode, answer });
    socket.emit('submitAnswer', { code: roomCode, answer });
  }
}

document.getElementById('roomCode').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnJoin').click();
});
document.getElementById('playerName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnCreate').click();
});
