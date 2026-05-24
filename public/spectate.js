const socket = io();
let currentRoom = null;

// ==========================================
// ROOM LIST
// ==========================================
function refreshRooms() {
  socket.emit('spectate:listRooms');
}

socket.on('connect', () => {
  refreshRooms();
});

socket.on('spectate:roomList', ({ familyRooms, abcRooms }) => {
  const list = document.getElementById('roomList');
  
  if (familyRooms.length === 0 && abcRooms.length === 0) {
    list.innerHTML = '<div class="no-rooms">😴 Belum ada pertandingan yang berlangsung</div>';
    return;
  }
  
  let html = '';
  
  familyRooms.forEach(r => {
    const players = r.players.map(p => p.name).join(' vs ');
    const stateText = r.state === 'waiting' ? '⏳ Menunggu pemain' : r.state === 'gameOver' ? '🏁 Selesai' : '🎮 Sedang main';
    html += `<div class="room-card" onclick="watchRoom('${r.code}', 'family')">
      <div class="room-info">
        <div class="room-code-label">${r.code}</div>
        <div class="room-players">👤 ${players}</div>
        <div class="room-state">${stateText} • Ronde ${r.round}/${r.totalRounds}</div>
      </div>
      <span class="room-type family">⭐ Family 100</span>
    </div>`;
  });
  
  abcRooms.forEach(r => {
    const players = r.players.map(p => p.name).join(', ');
    const stateText = r.state === 'lobby' ? '⏳ Di lobby' : r.state === 'gameOver' ? '🏁 Selesai' : '🎮 Sedang main';
    html += `<div class="room-card" onclick="watchRoom('${r.code}', 'abc')">
      <div class="room-info">
        <div class="room-code-label">${r.code}</div>
        <div class="room-players">👤 ${players} (${r.players.length} pemain)</div>
        <div class="room-state">${stateText} • ${r.category ? r.category.toUpperCase() : '-'} • Babak ${r.round}/${r.totalRounds}</div>
      </div>
      <span class="room-type abc">🔤 ABC</span>
    </div>`;
  });
  
  list.innerHTML = html;
});

function watchRoom(code, gameType) {
  currentRoom = { code, gameType };
  socket.emit('spectate:join', { code, gameType });
}

function backToList() {
  if (currentRoom) {
    socket.emit('spectate:leave', currentRoom.code);
  }
  currentRoom = null;
  document.getElementById('spec-home').classList.add('active');
  document.getElementById('spec-watch').classList.remove('active');
  // Reset views
  document.getElementById('familyView').style.display = 'none';
  document.getElementById('abcView').style.display = 'none';
  refreshRooms();
}

socket.on('spectate:joined', ({ code, type }) => {
  document.getElementById('spec-home').classList.remove('active');
  document.getElementById('spec-watch').classList.add('active');
  
  if (type === 'abc') {
    document.getElementById('abcView').style.display = 'block';
    document.getElementById('familyView').style.display = 'none';
  } else {
    document.getElementById('familyView').style.display = 'block';
    document.getElementById('abcView').style.display = 'none';
  }
});

socket.on('spectate:error', msg => {
  alert(msg);
});

// ==========================================
// ABC 5 DASAR SPECTATE EVENTS
// ==========================================
socket.on('abc:newRound', ({ round, totalRounds, category, letter, players, scores }) => {
  if (!currentRoom || currentRoom.gameType !== 'abc') return;
  renderAbcScoreboard(players, scores);
  document.getElementById('specAbcRound').textContent = `Babak ${round}/${totalRounds}`;
  document.getElementById('specAbcCategory').textContent = `Kategori: ${category.toUpperCase()}`;
  document.getElementById('specAbcLetter').textContent = letter.toUpperCase();
  document.getElementById('specAbcLog').innerHTML = '';
  document.getElementById('specAbcStatus').textContent = '🎯 Sedang bermain...';
});

socket.on('abc:answerResult', ({ playerName, word, valid }) => {
  if (!currentRoom || currentRoom.gameType !== 'abc') return;
  const log = document.getElementById('specAbcLog');
  const entry = document.createElement('div');
  entry.className = `spec-log-entry ${valid ? 'valid' : 'invalid'}`;
  entry.innerHTML = `<span>${valid ? '✅' : '❌'} ${word}</span><span class="log-player">${playerName}</span>`;
  log.appendChild(entry);
  log.scrollTop = log.scrollHeight;
});

socket.on('abc:scoreUpdate', ({ players, scores }) => {
  if (!currentRoom || currentRoom.gameType !== 'abc') return;
  renderAbcScoreboard(players, scores);
});

socket.on('abc:roundEnd', ({ players, scores }) => {
  if (!currentRoom || currentRoom.gameType !== 'abc') return;
  renderAbcScoreboard(players, scores);
  document.getElementById('specAbcStatus').textContent = '⏰ Babak selesai!';
});

socket.on('abc:gameOver', ({ ranking }) => {
  if (!currentRoom || currentRoom.gameType !== 'abc') return;
  let html = ranking.map((r, i) => {
    const medal = i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : `${i+1}.`;
    return `${medal} ${r.name}: ${r.score}`;
  }).join(' | ');
  document.getElementById('specAbcStatus').textContent = `🎉 SELESAI! ${html}`;
});

// ==========================================
// FAMILY 100 SPECTATE EVENTS
// ==========================================
socket.on('newRound', ({ round, totalRounds, question, answerCount, scores, multiplier }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyQuestion').textContent = question;
  document.getElementById('specFamilyRound').textContent = `Ronde ${round}/${totalRounds}`;
  document.getElementById('specFamilyMultiplier').textContent = `${multiplier}x`;
  document.getElementById('specFamilyStrikes').textContent = '';
  document.getElementById('specFamilyAnswers').innerHTML = Array(answerCount).fill(0).map(() => 
    `<div class="spec-answer hidden"><span class="ans-text">???</span><span class="ans-score">?</span></div>`
  ).join('');
  document.getElementById('specFamilyStatus').textContent = '🔔 Buzzer siap!';
});

socket.on('buzzerWon', ({ winnerName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🔔 ${winnerName} menang buzzer!`;
});

socket.on('correctAnswer', ({ index, text, score }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  const answers = document.getElementById('specFamilyAnswers').children;
  if (answers[index]) {
    answers[index].classList.remove('hidden');
    answers[index].classList.add('revealed');
    answers[index].innerHTML = `<span class="ans-text">${text}</span><span class="ans-score">${score}</span>`;
  }
});

socket.on('wrongAnswer', ({ strikes }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStrikes').textContent = '❌'.repeat(strikes);
});

socket.on('faceOffSwitch', ({ newPlayerName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🔄 Giliran ${newPlayerName}`;
});

socket.on('chooseMainLempar', ({ chooserName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🤔 ${chooserName} memilih main/lempar...`;
});

socket.on('playPhaseStart', ({ activePlayerName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🎮 ${activePlayerName} sedang menjawab...`;
});

socket.on('stealPhase', ({ stealPlayerName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🏴‍☠️ ${stealPlayerName} mencoba steal!`;
});

socket.on('stealFailed', ({ activePlayerName }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `❌ Steal gagal! Poin ke ${activePlayerName}`;
});

socket.on('roundComplete', ({ winnerName, finalScore, scores, players, allAnswers }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = `🏆 ${winnerName} menang ronde! +${finalScore} poin`;
  const board = document.getElementById('specFamilyAnswers');
  board.innerHTML = allAnswers.map(a => 
    `<div class="spec-answer revealed"><span class="ans-text">${a.text}</span><span class="ans-score">${a.score}</span></div>`
  ).join('');
  const sb = document.getElementById('specFamilyScoreboard');
  sb.innerHTML = players.map(p => `<div class="spec-player"><div class="name">${p.name}</div><div class="score">${scores[p.id] || 0}</div></div>`).join('');
});

socket.on('gameOver', ({ winner, scores, players, isDraw }) => {
  if (!currentRoom || currentRoom.gameType !== 'family') return;
  document.getElementById('specFamilyStatus').textContent = isDraw ? '🤝 Seri!' : `🎉 ${winner} MENANG!`;
  const sb = document.getElementById('specFamilyScoreboard');
  sb.innerHTML = players.map(p => `<div class="spec-player"><div class="name">${p.name}</div><div class="score">${scores[p.id] || 0}</div></div>`).join('');
});

// ==========================================
// HELPERS
// ==========================================
function renderAbcScoreboard(players, scores) {
  const sb = document.getElementById('specAbcScoreboard');
  sb.innerHTML = players.map(p => 
    `<div class="score-chip"><span class="chip-name">${p.name}</span><span class="chip-score">${scores[p.id] || 0}</span></div>`
  ).join('');
}
