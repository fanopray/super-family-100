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
let spTotalRounds = 3;
let spScore = 0;
let spStrikes = 0;
let spMaxStrikes = 3;
let spRevealedAnswers = [];
let spTimer = null;
let spTimeLeft = 30;
let spUsedQuestionIds = []; // Track used questions across games

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
  audio.init();
  audio.startBGM();
  startSinglePlayer();
});

document.getElementById('btnMultiPlayer').addEventListener('click', () => {
  gameMode = 'multi';
  audio.init();
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
    
    // Filter out used questions
    let available = allQuestions.filter(q => !spUsedQuestionIds.includes(q.id));
    
    // If not enough, reset
    if (available.length < spTotalRounds) {
      spUsedQuestionIds = [];
      available = allQuestions;
    }
    
    spQuestions = available.sort(() => Math.random() - 0.5).slice(0, spTotalRounds);
    
    // Track used
    spQuestions.forEach(q => spUsedQuestionIds.push(q.id));
    
    spCurrentRound = 0;
    spScore = 0;

    document.getElementById('name-left').textContent = 'Skor';
    document.getElementById('name-right').textContent = 'Babak';
    document.getElementById('points-left').textContent = '0';
    document.getElementById('points-right').textContent = '1x';
    document.getElementById('score-right').classList.remove('active-turn');
    document.getElementById('score-left').classList.add('active-turn');
    document.getElementById('multiplierDisplay').style.display = 'block';

    showScreen('game');
    spStartRound();
  } catch (err) {
    showNotification('Gagal memuat pertanyaan!', 'error');
  }
}

function spStartRound() {
  if (spCurrentRound >= spTotalRounds) { spEndGame(); return; }

  const question = spQuestions[spCurrentRound];
  const multiplier = spCurrentRound + 1; // Babak 1=1x, 2=2x, 3=3x
  spStrikes = 0;
  spRevealedAnswers = [];
  spTimeLeft = 30;

  document.getElementById('roundDisplay').textContent = `Babak ${spCurrentRound + 1}/${spTotalRounds}`;
  document.getElementById('multiplierDisplay').textContent = `Poin: ${multiplier}x`;
  document.getElementById('points-right').textContent = `${multiplier}x`;
  document.getElementById('questionText').textContent = question.question;
  document.getElementById('strikesDisplay').innerHTML = '';
  document.getElementById('buzzerContainer').style.display = 'none';
  document.getElementById('chooseContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'flex';
  document.getElementById('answerInput').value = '';
  document.getElementById('answerInput').focus();
  document.getElementById('statusText').textContent = `🎯 Babak ${spCurrentRound + 1} (${multiplier}x poin) - Tebak jawaban!`;
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
  const multiplier = spCurrentRound + 1;
  const normalized = answer.toLowerCase().trim();
  let matched = null;
  for (let i = 0; i < question.answers.length; i++) {
    if (spRevealedAnswers.includes(i)) continue;
    const ans = question.answers[i].text.toLowerCase();
    if (ans.includes(normalized) || normalized.includes(ans) || spFuzzyMatch(normalized, ans)) { matched = i; break; }
  }

  if (matched !== null) {
    spRevealedAnswers.push(matched);
    const earnedScore = question.answers[matched].score * multiplier;
    spScore += earnedScore;
    revealCard(matched, question.answers[matched].text, question.answers[matched].score);
    document.getElementById('points-left').textContent = spScore;
    showNotification(`✅ "${question.answers[matched].text}" - ${question.answers[matched].score} × ${multiplier} = ${earnedScore} poin!`, 'success');
    audio.playCorrect();

    // Reset timer 30 detik setiap jawab benar
    clearInterval(spTimer);
    spStartTimer();

    if (spRevealedAnswers.length === question.answers.length) {
      clearInterval(spTimer);
      showNotification('🎉 Sempurna!', 'success');
      spCurrentRound++;
      setTimeout(() => spStartRound(), 2000);
    }
  } else {
    spStrikes++;
    showStrikes(spStrikes);
    audio.playStrike();
    showNotification(`❌ "${answer}" tidak ada!`, 'error');
    if (spStrikes >= spMaxStrikes) {
      clearInterval(spTimer);
      showNotification('💥 3 Strike! Babak selesai!', 'error');
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
  audio.stopBGM();
  audio.playGameOver();
  document.getElementById('timerContainer').style.display = 'none';
  document.getElementById('answerContainer').style.display = 'none';

  let grade = '';
  let emoji = '';
  if (spScore >= 500) { grade = 'AMPUN SUHU 🙇'; emoji = '🔥'; }
  else if (spScore >= 400) { grade = 'JAGO JUGA LU 😎'; emoji = '⭐'; }
  else if (spScore >= 300) { grade = 'GOKIL 🤩'; emoji = '🎯'; }
  else if (spScore >= 200) { grade = 'B AJAH 😐'; emoji = '👌'; }
  else if (spScore >= 100) { grade = 'KURENG 😅'; emoji = '😬'; }
  else { grade = 'BODOH 💀'; emoji = '🤡'; }

  document.getElementById('gameoverTitle').textContent = `${emoji} Single Player Selesai! ${emoji}`;
  document.getElementById('gameoverResult').innerHTML = `
    <p class="winner-name">${grade}</p>
    <p class="final-score">Total Skor: ${spScore}</p>
    <p style="color:#888; margin-top:15px; font-size:0.9rem;">
      Babak 1 (1x) + Babak 2 (2x) + Babak 3 (3x)
    </p>
    <p style="color:#666; margin-top:8px; font-size:0.85rem;">
      0-100: Bodoh | 100-200: Kureng | 200-300: B Ajah<br>
      300-400: Gokil | 400-500: Jago | 500+: Ampun Suhu
    </p>
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
  audio.startBGM();
});

socket.on('buzzerWon', ({ winnerId, winnerName }) => {
  document.getElementById('buzzerContainer').style.display = 'none';
  audio.playBuzzer();
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
  audio.playCorrect();
  showNotification(`✅ "${text}" - ${score} poin!`, 'success');
  document.getElementById('answerInput').value = '';
});

socket.on('wrongAnswer', ({ strikes, playerId, answer }) => {
  showStrikes(strikes);
  audio.playStrike();
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
    if (timeLeft <= 5 && timeLeft > 0) audio.playCountdown();
  }, 1000);
}

// --- ROUND COMPLETE ---
socket.on('roundComplete', ({ winnerId, winnerName, roundScore, multiplier, finalScore, scores, allAnswers }) => {
  clearInterval(clientTimer);
  audio.playRoundWin();
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
socket.on('gameOver', ({ winner, winnerId, scores, players, isDraw, roomCode: rc }) => {
  clearInterval(clientTimer);
  audio.stopBGM();
  audio.playGameOver();
  roomCode = rc || roomCode;
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
  
  // Show play again button for multiplayer
  if (gameMode === 'multi') {
    document.getElementById('btnPlayAgain').textContent = '🔄 Main Lagi (Room Sama)';
    document.getElementById('btnPlayAgain').onclick = () => {
      socket.emit('playAgain', roomCode);
      document.getElementById('btnPlayAgain').textContent = '⏳ Menunggu lawan...';
      document.getElementById('btnPlayAgain').disabled = true;
    };
  }
  showScreen('gameover');
});

socket.on('playerReady', ({ playerName, readyCount }) => {
  if (readyCount === 1) {
    showNotification(`${playerName} siap main lagi!`, 'info');
  }
});

socket.on('gameRestart', ({ scores }) => {
  document.getElementById('btnPlayAgain').textContent = '🔄 Main Lagi (Room Sama)';
  document.getElementById('btnPlayAgain').disabled = false;
  document.getElementById('points-left').textContent = '0';
  document.getElementById('points-right').textContent = '0';
  showNotification('🎮 Game dimulai lagi!', 'success');
  showScreen('game');
});

socket.on('playerDisconnected', ({ name }) => {
  clearInterval(clientTimer);
  showNotification(`${name} terputus!`, 'error');
  setTimeout(() => showScreen('mode'), 2000);
});

// ==========================================
// HELPERS
// ==========================================
function spFuzzyMatch(input, target) {
  const normalize = (str) => str.replace(/[^a-z0-9\s]/g, '').replace(/\s+/g, ' ').trim();
  const n1 = normalize(input);
  const n2 = normalize(target);
  if (n1 === n2) return true;
  
  // Abbreviation check
  const abbrs = {
    'hp':['handphone','hp/handphone','hape'],'handphone':['hp','hp/handphone'],
    'hape':['hp','handphone'],'tv':['televisi','tivi'],'televisi':['tv'],
    'ac':['air conditioner','pendingin'],'ig':['instagram'],'instagram':['ig'],
    'wa':['whatsapp'],'whatsapp':['wa'],'fb':['facebook'],'facebook':['fb'],
    'yt':['youtube'],'youtube':['yt'],'tt':['tiktok'],'tiktok':['tt'],
    'ojol':['ojek online'],'ojek online':['ojol'],'nasgor':['nasi goreng'],
    'nasi goreng':['nasgor'],'wifi':['wi-fi','internet'],'mie':['mi'],
    'mi':['mie'],'wfh':['work from home','kerja dari rumah'],
    'pns':['pegawai negeri'],'ktp':['kartu tanda penduduk'],
  };
  const inputForms = abbrs[n1] || [];
  const targetForms = abbrs[n2] || [];
  if (targetForms.includes(n1) || inputForms.includes(n2)) return true;
  for (const f of inputForms) { if (n2.includes(f) || f.includes(n2)) return true; }
  for (const f of targetForms) { if (n1.includes(f) || f.includes(n1)) return true; }
  
  // Levenshtein
  if (n1.length >= 3 && n2.length >= 3) {
    const maxLen = Math.max(n1.length, n2.length);
    const dist = spLevenshtein(n1, n2);
    const threshold = maxLen <= 5 ? 1 : 2;
    if (dist <= threshold) return true;
  }
  return false;
}

function spLevenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i-1] === a[j-1] ? m[i-1][j-1] : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
    }
  }
  return m[b.length][a.length];
}

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

document.getElementById('btnPlayAgain').addEventListener('click', () => {
  if (gameMode === 'single') {
    window.location.reload();
  }
  // Multiplayer handled by gameOver socket event
});

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


// Mute toggle
function toggleMute() {
  const muted = audio.toggle();
  document.getElementById('btnMute').textContent = muted ? '🔇' : '🔊';
}
