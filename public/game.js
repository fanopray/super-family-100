const socket = io();

// DOM Elements
const screens = {
  mode: document.getElementById('screen-mode'),
  lobby: document.getElementById('screen-lobby'),
  waiting: document.getElementById('screen-waiting'),
  game: document.getElementById('screen-game'),
  gameover: document.getElementById('screen-gameover')
};

// State
let myId = null;
let myName = '';
let roomCode = '';
let isMyTurn = false;
let gameMode = null; // 'single' or 'multi'

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

// Switch screen
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  screens[name].classList.add('active');
}

// Notification
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
// SINGLE PLAYER MODE
// ==========================================
async function startSinglePlayer() {
  try {
    const res = await fetch('/api/questions');
    const allQuestions = await res.json();
    
    // Shuffle and pick 5
    spQuestions = allQuestions.sort(() => Math.random() - 0.5).slice(0, spTotalRounds);
    spCurrentRound = 0;
    spScore = 0;

    // Setup game screen for single player
    document.getElementById('name-left').textContent = 'Kamu';
    document.getElementById('name-right').textContent = 'Target';
    document.getElementById('points-left').textContent = '0';
    document.getElementById('points-right').textContent = '100';
    document.getElementById('score-right').classList.remove('active-turn');
    document.getElementById('score-left').classList.add('active-turn');

    showScreen('game');
    spStartRound();
  } catch (err) {
    showNotification('Gagal memuat pertanyaan!', 'error');
  }
}

function spStartRound() {
  if (spCurrentRound >= spTotalRounds) {
    spEndGame();
    return;
  }

  const question = spQuestions[spCurrentRound];
  spStrikes = 0;
  spRevealedAnswers = [];
  spTimeLeft = 30;

  document.getElementById('roundDisplay').textContent = `Ronde ${spCurrentRound + 1}/${spTotalRounds}`;
  document.getElementById('questionText').textContent = question.question;
  document.getElementById('strikesDisplay').innerHTML = '';
  document.getElementById('buzzerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'flex';
  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').focus();
  document.getElementById('statusText').textContent = '🎯 Tebak jawaban survei terpopuler!';
  document.getElementById('timerContainer').style.display = 'block';
  document.getElementById('btnPass').textContent = 'Skip Ronde';

  // Generate answer board
  const board = document.getElementById('answerBoard');
  board.innerHTML = '';
  for (let i = 0; i < question.answers.length; i++) {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.id = `answer-${i}`;
    card.innerHTML = `
      <span class="answer-number">${i + 1}</span>
      <span class="answer-text">???</span>
      <span class="answer-score"></span>
    `;
    board.appendChild(card);
  }

  // Start timer
  spStartTimer();
}

function spStartTimer() {
  clearInterval(spTimer);
  spTimeLeft = 30;
  updateTimerDisplay();

  spTimer = setInterval(() => {
    spTimeLeft--;
    updateTimerDisplay();
    if (spTimeLeft <= 0) {
      clearInterval(spTimer);
      spRoundTimeout();
    }
  }, 1000);
}

function updateTimerDisplay() {
  document.getElementById('timerText').textContent = spTimeLeft;
  const percent = (spTimeLeft / 30) * 100;
  document.getElementById('timerFill').style.width = percent + '%';
  
  if (spTimeLeft <= 10) {
    document.getElementById('timerFill').style.background = '#e53e3e';
  } else if (spTimeLeft <= 20) {
    document.getElementById('timerFill').style.background = '#ffd700';
  } else {
    document.getElementById('timerFill').style.background = '#48bb78';
  }
}

function spRoundTimeout() {
  showNotification('⏰ Waktu habis!', 'error');
  spRevealAllAnswers();
  spCurrentRound++;
  setTimeout(() => spStartRound(), 3000);
}

function spSubmitAnswer(answer) {
  const question = spQuestions[spCurrentRound];
  const normalizedAnswer = answer.toLowerCase().trim();

  let matched = null;
  for (let i = 0; i < question.answers.length; i++) {
    if (spRevealedAnswers.includes(i)) continue;
    const ans = question.answers[i].text.toLowerCase();
    if (ans.includes(normalizedAnswer) || normalizedAnswer.includes(ans)) {
      matched = i;
      break;
    }
  }

  if (matched !== null) {
    // Benar!
    spRevealedAnswers.push(matched);
    spScore += question.answers[matched].score;

    const card = document.getElementById(`answer-${matched}`);
    card.classList.add('revealed');
    card.querySelector('.answer-text').textContent = question.answers[matched].text;
    card.querySelector('.answer-score').textContent = question.answers[matched].score;

    document.getElementById('points-left').textContent = spScore;
    showNotification(`✅ "${question.answers[matched].text}" - ${question.answers[matched].score} poin!`, 'success');

    // Cek semua terbuka
    if (spRevealedAnswers.length === question.answers.length) {
      clearInterval(spTimer);
      showNotification('🎉 Semua jawaban terbuka! Sempurna!', 'success');
      spCurrentRound++;
      setTimeout(() => spStartRound(), 2000);
    }
  } else {
    // Salah
    spStrikes++;
    const strikesDiv = document.getElementById('strikesDisplay');
    strikesDiv.innerHTML = '';
    for (let i = 0; i < spStrikes; i++) {
      strikesDiv.innerHTML += '<span class="strike-x">✕</span>';
    }
    showNotification(`❌ "${answer}" tidak ada di papan!`, 'error');

    if (spStrikes >= spMaxStrikes) {
      clearInterval(spTimer);
      showNotification('💥 3 Strike! Ronde selesai!', 'error');
      spRevealAllAnswers();
      spCurrentRound++;
      setTimeout(() => spStartRound(), 3000);
    }
  }

  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').focus();
}

function spRevealAllAnswers() {
  const question = spQuestions[spCurrentRound];
  question.answers.forEach((ans, i) => {
    const card = document.getElementById(`answer-${i}`);
    if (card && !card.classList.contains('revealed')) {
      setTimeout(() => {
        card.classList.add('revealed');
        card.querySelector('.answer-text').textContent = ans.text;
        card.querySelector('.answer-score').textContent = ans.score;
      }, (i + 1) * 200);
    }
  });
}

function spEndGame() {
  clearInterval(spTimer);
  document.getElementById('timerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'none';

  // Hitung max possible score
  let maxScore = 0;
  spQuestions.forEach(q => {
    q.answers.forEach(a => maxScore += a.score);
  });

  let grade = '';
  const percent = (spScore / maxScore) * 100;
  if (percent >= 80) grade = '🌟 LUAR BIASA!';
  else if (percent >= 60) grade = '👏 HEBAT!';
  else if (percent >= 40) grade = '👍 BAGUS!';
  else if (percent >= 20) grade = '😊 LUMAYAN!';
  else grade = '💪 COBA LAGI!';

  document.getElementById('gameoverTitle').textContent = '🎮 Single Player Selesai!';
  document.getElementById('gameoverResult').innerHTML = `
    <p class="winner-name">${grade}</p>
    <p class="final-score">Skor kamu: ${spScore} / ${maxScore}</p>
    <p class="final-score">${Math.round(percent)}% jawaban benar</p>
    <p style="color:#888; margin-top:10px;">Ronde dimainkan: ${spTotalRounds}</p>
  `;
  showScreen('gameover');
}

// ==========================================
// MULTIPLAYER MODE
// ==========================================
document.getElementById('btnCreate').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  if (!name) {
    showNotification('Masukkan nama dulu!', 'error');
    return;
  }
  myName = name;
  socket.emit('createRoom', name);
});

document.getElementById('btnJoin').addEventListener('click', () => {
  const name = document.getElementById('playerName').value.trim();
  const code = document.getElementById('roomCode').value.trim().toUpperCase();
  if (!name) {
    showNotification('Masukkan nama dulu!', 'error');
    return;
  }
  if (!code || code.length !== 4) {
    showNotification('Masukkan kode room 4 karakter!', 'error');
    return;
  }
  myName = name;
  socket.emit('joinRoom', { code, playerName: name });
});

// SOCKET EVENTS
socket.on('connect', () => {
  myId = socket.id;
});

socket.on('roomCreated', ({ code, player }) => {
  roomCode = code;
  myId = player.id;
  document.getElementById('displayRoomCode').textContent = code;
  showScreen('waiting');
});

socket.on('roomJoined', ({ code, player, opponent }) => {
  roomCode = code;
  myId = player.id;
  showNotification(`Bergabung dengan room ${code}!`, 'success');
  setupMultiplayerScreen(player, opponent);
  showScreen('game');
});

socket.on('opponentJoined', (opponent) => {
  showNotification(`${opponent.name} bergabung!`, 'success');
  const me = { id: myId, name: myName };
  setupMultiplayerScreen(me, opponent);
  showScreen('game');
});

socket.on('error', (msg) => {
  showNotification(msg, 'error');
});

function setupMultiplayerScreen(me, opponent) {
  document.getElementById('name-left').textContent = me.name;
  document.getElementById('name-right').textContent = opponent.name;
  document.getElementById('points-left').textContent = '0';
  document.getElementById('points-right').textContent = '0';
  document.getElementById('timerContainer').style.display = 'none';
  document.getElementById('btnPass').textContent = 'Pass';
}

// MULTIPLAYER GAME EVENTS
socket.on('newRound', ({ round, totalRounds, question, answerCount, scores }) => {
  document.getElementById('roundDisplay').textContent = `Ronde ${round}/${totalRounds}`;
  document.getElementById('questionText').textContent = question;
  document.getElementById('strikesDisplay').innerHTML = '';
  document.getElementById('statusText').textContent = 'Bersiap...';
  document.getElementById('buzzerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'none';

  updateScores(scores);

  const board = document.getElementById('answerBoard');
  board.innerHTML = '';
  for (let i = 0; i < answerCount; i++) {
    const card = document.createElement('div');
    card.className = 'answer-card';
    card.id = `answer-${i}`;
    card.innerHTML = `
      <span class="answer-number">${i + 1}</span>
      <span class="answer-text">???</span>
      <span class="answer-score"></span>
    `;
    board.appendChild(card);
  }

  document.getElementById('score-left').classList.remove('active-turn');
  document.getElementById('score-right').classList.remove('active-turn');
});

socket.on('buzzerReady', () => {
  document.getElementById('buzzerContainer').style.display = 'block';
  document.getElementById('statusText').textContent = '🔔 Tekan BUZZER secepat mungkin!';
  isMyTurn = false;
});

socket.on('buzzerWon', ({ winnerId, winnerName }) => {
  document.getElementById('buzzerContainer').style.display = 'none';

  if (winnerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '🎯 Kamu menang buzzer! Silakan jawab!';
    isMyTurn = true;
    setActiveTurn(winnerId);
  } else {
    document.getElementById('statusText').textContent = `🔔 ${winnerName} menang buzzer! Menunggu jawaban...`;
    isMyTurn = false;
    setActiveTurn(winnerId);
  }
});

socket.on('correctAnswer', ({ index, text, score, revealedAnswers, roundScore, playerId }) => {
  const card = document.getElementById(`answer-${index}`);
  card.classList.add('revealed');
  card.querySelector('.answer-text').textContent = text;
  card.querySelector('.answer-score').textContent = score;

  showNotification(`✅ "${text}" - ${score} poin!`, 'success');
  document.getElementById('answerInput').value = '';
});

socket.on('wrongAnswer', ({ strikes, playerId, answer }) => {
  const strikesDiv = document.getElementById('strikesDisplay');
  strikesDiv.innerHTML = '';
  for (let i = 0; i < strikes; i++) {
    strikesDiv.innerHTML += '<span class="strike-x">✕</span>';
  }

  if (playerId === myId) {
    showNotification(`❌ "${answer}" tidak ada di papan!`, 'error');
  } else {
    showNotification(`❌ Lawan salah menjawab "${answer}"`, 'info');
  }
  document.getElementById('answerInput').value = '';
});

socket.on('turnSwitch', ({ newPlayerId, newPlayerName, message }) => {
  document.getElementById('strikesDisplay').innerHTML = '';

  if (newPlayerId === myId) {
    document.getElementById('answerContainer').style.display = 'flex';
    document.getElementById('answerInput').focus();
    document.getElementById('statusText').textContent = '🎯 Kesempatan STEAL! Jawab dengan benar!';
    isMyTurn = true;
  } else {
    document.getElementById('answerContainer').style.display = 'none';
    document.getElementById('statusText').textContent = `⚡ ${newPlayerName} mencoba steal!`;
    isMyTurn = false;
  }
  setActiveTurn(newPlayerId);
});

socket.on('roundComplete', ({ winnerId, winnerName, roundScore, scores, allAnswers }) => {
  document.getElementById('answerContainer').style.display = 'none';
  document.getElementById('statusText').textContent = `🏆 ${winnerName} mendapat ${roundScore} poin ronde ini!`;
  updateScores(scores);

  if (allAnswers) {
    allAnswers.forEach((ans, i) => {
      const card = document.getElementById(`answer-${i}`);
      if (card && !card.classList.contains('revealed')) {
        setTimeout(() => {
          card.classList.add('revealed');
          card.querySelector('.answer-text').textContent = ans.text;
          card.querySelector('.answer-score').textContent = ans.score;
        }, (i + 1) * 300);
      }
    });
  }

  showNotification(`Ronde selesai! ${winnerName} +${roundScore}`, 'success');
});

socket.on('gameOver', ({ winner, winnerId, scores, players, isDraw }) => {
  let resultHTML = '';
  if (isDraw) {
    resultHTML = `
      <p class="winner-name">🤝 SERI!</p>
      <p class="final-score">${players[0].name}: ${scores[players[0].id]} - ${players[1].name}: ${scores[players[1].id]}</p>
    `;
  } else {
    const loser = players.find(p => p.id !== winnerId);
    resultHTML = `
      <p class="winner-name">🏆 ${winner} Menang!</p>
      <p class="final-score">${winner}: ${scores[winnerId]} poin</p>
      <p class="final-score">${loser.name}: ${scores[loser.id]} poin</p>
    `;

    if (winnerId === myId) {
      document.getElementById('gameoverTitle').textContent = '🎉 Kamu Menang! 🎉';
    } else {
      document.getElementById('gameoverTitle').textContent = '😢 Kamu Kalah! 😢';
    }
  }

  document.getElementById('gameoverResult').innerHTML = resultHTML;
  showScreen('gameover');
});

socket.on('playerDisconnected', ({ name }) => {
  showNotification(`${name} terputus dari game!`, 'error');
  setTimeout(() => showScreen('mode'), 2000);
});

// HELPER FUNCTIONS
function updateScores(scores) {
  document.getElementById('points-left').textContent = scores[myId] || 0;
  for (const id in scores) {
    if (id !== myId) {
      document.getElementById('points-right').textContent = scores[id] || 0;
    }
  }
}

function setActiveTurn(playerId) {
  document.getElementById('score-left').classList.remove('active-turn');
  document.getElementById('score-right').classList.remove('active-turn');
  if (playerId === myId) {
    document.getElementById('score-left').classList.add('active-turn');
  } else {
    document.getElementById('score-right').classList.add('active-turn');
  }
}

// INPUT EVENTS
document.getElementById('btnBuzzer').addEventListener('click', () => {
  socket.emit('buzzer', roomCode);
});

document.getElementById('btnSubmitAnswer').addEventListener('click', () => {
  submitAnswer();
});

document.getElementById('answerInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    submitAnswer();
  }
});

document.getElementById('btnPass').addEventListener('click', () => {
  if (gameMode === 'single') {
    // Skip round in single player
    clearInterval(spTimer);
    showNotification('⏭️ Ronde di-skip!', 'info');
    spRevealAllAnswers();
    spCurrentRound++;
    setTimeout(() => spStartRound(), 2500);
  } else {
    socket.emit('pass', roomCode);
  }
});

document.getElementById('btnPlayAgain').addEventListener('click', () => {
  window.location.reload();
});

function submitAnswer() {
  const input = document.getElementById('answerInput');
  const answer = input.value.trim();
  if (!answer) return;

  if (gameMode === 'single') {
    spSubmitAnswer(answer);
  } else {
    socket.emit('submitAnswer', { code: roomCode, answer });
  }
}

// Allow Enter on inputs
document.getElementById('roomCode').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnJoin').click();
});

document.getElementById('playerName').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('btnCreate').click();
});
