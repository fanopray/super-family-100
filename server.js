const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
let questions = require('./data/questions.json');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// ==========================================
// REST API
// ==========================================
app.get('/api/questions', (req, res) => {
  res.json(questions);
});

app.post('/api/questions', (req, res) => {
  const { question, answers } = req.body;
  if (!question || !answers || answers.length === 0) {
    return res.status(400).json({ error: 'Pertanyaan dan jawaban harus diisi!' });
  }
  const newQuestion = {
    id: questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1,
    question, answers
  };
  questions.push(newQuestion);
  saveQuestions();
  res.json({ success: true, question: newQuestion });
});

app.delete('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ error: 'Tidak ditemukan!' });
  questions.splice(index, 1);
  saveQuestions();
  res.json({ success: true });
});

app.put('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) return res.status(404).json({ error: 'Tidak ditemukan!' });
  const { question, answers } = req.body;
  if (!question || !answers || answers.length < 2) {
    return res.status(400).json({ error: 'Minimal 2 jawaban!' });
  }
  questions[index] = { id, question, answers };
  saveQuestions();
  res.json({ success: true, question: questions[index] });
});

function saveQuestions() {
  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'data', 'questions.json'),
    JSON.stringify(questions, null, 2), 'utf-8'
  );
}

// ==========================================
// MULTIPLAYER GAME LOGIC
// ==========================================
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
  return code;
}

function getRandomQuestions(count = 3) {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function createRoom(hostPlayer) {
  let code = generateRoomCode();
  while (rooms[code]) code = generateRoomCode();

  rooms[code] = {
    code,
    players: [hostPlayer],
    state: 'waiting',
    currentRound: 0,
    totalRounds: 3,
    questions: getRandomQuestions(3),
    revealedAnswers: [],
    scores: {},
    strikes: 0,
    currentTurn: null,
    buzzerWinner: null,
    buzzerLoser: null,
    buzzerWinnerAnswerIdx: null,
    buzzerLoserAnswerIdx: null,
    faceOffPhase: 'first',
    activePlayer: null,
    passivePlayer: null,
    roundScorePool: 0,
    timer: null
  };
  rooms[code].scores[hostPlayer.id] = 0;
  return rooms[code];
}

function getMultiplier(round) {
  return round + 1; // Babak 1=1x, 2=2x, 3=3x
}

function clearTimer(room) {
  if (room.timer) { clearTimeout(room.timer); room.timer = null; }
}

function matchAnswer(question, answer, revealedAnswers) {
  const normalized = answer.toLowerCase().trim();
  for (let i = 0; i < question.answers.length; i++) {
    if (revealedAnswers.includes(i)) continue;
    const ans = question.answers[i].text.toLowerCase();
    if (ans.includes(normalized) || normalized.includes(ans)) return i;
  }
  return null;
}

io.on('connection', (socket) => {
  console.log(`Connected: ${socket.id}`);

  socket.on('createRoom', (playerName) => {
    const player = { id: socket.id, name: playerName };
    const room = createRoom(player);
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code, player });
  });

  socket.on('joinRoom', ({ code, playerName }) => {
    const room = rooms[code];
    if (!room) return socket.emit('error', 'Room tidak ditemukan!');
    if (room.players.length >= 2) return socket.emit('error', 'Room sudah penuh!');
    if (room.state !== 'waiting') return socket.emit('error', 'Game sudah dimulai!');

    const player = { id: socket.id, name: playerName };
    room.players.push(player);
    room.scores[player.id] = 0;
    socket.join(code);
    socket.emit('roomJoined', { code, player, opponent: room.players[0] });
    socket.to(code).emit('opponentJoined', player);
    setTimeout(() => startGame(code), 2000);
  });

  function startGame(code) {
    const room = rooms[code];
    if (!room || room.players.length < 2) return;
    room.currentRound = 0;
    startRound(code);
  }

  // ==========================================
  // START ROUND
  // ==========================================
  function startRound(code) {
    const room = rooms[code];
    if (room.currentRound >= room.totalRounds) { endGame(code); return; }

    room.state = 'buzzer';
    room.revealedAnswers = [];
    room.strikes = 0;
    room.buzzerWinner = null;
    room.buzzerLoser = null;
    room.buzzerWinnerAnswerIdx = null;
    room.buzzerLoserAnswerIdx = null;
    room.faceOffPhase = 'first';
    room.activePlayer = null;
    room.passivePlayer = null;
    room.roundScorePool = 0;
    clearTimer(room);

    const question = room.questions[room.currentRound];
    const multiplier = getMultiplier(room.currentRound);

    io.to(code).emit('newRound', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      question: question.question,
      answerCount: question.answers.length,
      scores: room.scores,
      multiplier
    });

    setTimeout(() => {
      if (room.state === 'buzzer') io.to(code).emit('buzzerReady');
    }, 2500);
  }

  // ==========================================
  // BUZZER - Rebutan tekan tombol
  // ==========================================
  socket.on('buzzer', (code) => {
    const room = rooms[code];
    if (!room || room.state !== 'buzzer' || room.buzzerWinner) return;

    room.buzzerWinner = socket.id;
    room.buzzerLoser = room.players.find(p => p.id !== socket.id).id;
    room.state = 'faceOff';
    room.currentTurn = socket.id;
    room.faceOffPhase = 'first';

    io.to(code).emit('buzzerWon', {
      winnerId: socket.id,
      winnerName: room.players.find(p => p.id === socket.id).name
    });

    // 15 detik untuk jawab
    startFaceOffTimer(code);
  });

  function startFaceOffTimer(code) {
    const room = rooms[code];
    clearTimer(room);
    io.to(code).emit('startTimer', { duration: 15, phase: 'faceOff' });
    room.timer = setTimeout(() => faceOffTimeout(code), 15000);
  }

  function faceOffTimeout(code) {
    const room = rooms[code];
    if (!room || room.state !== 'faceOff') return;

    io.to(code).emit('buzzerWrongAnswer', {
      playerId: room.currentTurn,
      answer: '(waktu habis)'
    });

    if (room.faceOffPhase === 'first') {
      // Buzzer winner gagal, giliran lawan
      room.faceOffPhase = 'second';
      room.currentTurn = room.buzzerLoser;
      io.to(code).emit('faceOffSwitch', {
        newPlayerId: room.buzzerLoser,
        newPlayerName: room.players.find(p => p.id === room.buzzerLoser).name
      });
      startFaceOffTimer(code);
    } else {
      // Kedua gagal, buzzer winner pilih main/lempar
      clearTimer(room);
      goToChoose(code, room.buzzerWinner);
    }
  }

  // ==========================================
  // FACE-OFF ANSWER
  // ==========================================
  socket.on('faceOffAnswer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room || room.state !== 'faceOff' || room.currentTurn !== socket.id) return;
    clearTimer(room);

    const question = room.questions[room.currentRound];
    const matched = matchAnswer(question, answer, room.revealedAnswers);

    if (matched !== null) {
      // Benar!
      room.revealedAnswers.push(matched);
      room.roundScorePool += question.answers[matched].score;

      io.to(code).emit('correctAnswer', {
        index: matched,
        text: question.answers[matched].text,
        score: question.answers[matched].score,
        revealedAnswers: room.revealedAnswers,
        roundScore: room.roundScorePool,
        playerId: socket.id
      });

      if (room.faceOffPhase === 'first') {
        room.buzzerWinnerAnswerIdx = matched;

        if (matched === 0) {
          // Jawaban #1! Langsung pilih main/lempar
          goToChoose(code, socket.id);
        } else {
          // Bukan #1, giliran lawan
          room.faceOffPhase = 'second';
          room.currentTurn = room.buzzerLoser;
          io.to(code).emit('faceOffSwitch', {
            newPlayerId: room.buzzerLoser,
            newPlayerName: room.players.find(p => p.id === room.buzzerLoser).name
          });
          startFaceOffTimer(code);
        }
      } else {
        // Lawan jawab (fase kedua)
        room.buzzerLoserAnswerIdx = matched;

        // Bandingkan: index lebih kecil = jawaban lebih tinggi
        if (room.buzzerLoserAnswerIdx < room.buzzerWinnerAnswerIdx) {
          goToChoose(code, room.buzzerLoser);
        } else {
          goToChoose(code, room.buzzerWinner);
        }
      }
    } else {
      // Salah
      io.to(code).emit('buzzerWrongAnswer', { playerId: socket.id, answer });

      if (room.faceOffPhase === 'first') {
        room.faceOffPhase = 'second';
        room.currentTurn = room.buzzerLoser;
        io.to(code).emit('faceOffSwitch', {
          newPlayerId: room.buzzerLoser,
          newPlayerName: room.players.find(p => p.id === room.buzzerLoser).name
        });
        startFaceOffTimer(code);
      } else {
        // Kedua salah, buzzer winner pilih
        goToChoose(code, room.buzzerWinner);
      }
    }
  });

  // ==========================================
  // CHOOSE MAIN / LEMPAR
  // ==========================================
  function goToChoose(code, chooserId) {
    const room = rooms[code];
    clearTimer(room);
    room.state = 'chooseTurn';
    room.currentTurn = chooserId;

    io.to(code).emit('chooseMainLempar', {
      chooserId,
      chooserName: room.players.find(p => p.id === chooserId).name
    });
  }

  socket.on('chooseMainOrLempar', ({ code, choice }) => {
    const room = rooms[code];
    if (!room || room.state !== 'chooseTurn' || room.currentTurn !== socket.id) return;

    const other = room.players.find(p => p.id !== socket.id);

    if (choice === 'main') {
      room.activePlayer = socket.id;
      room.passivePlayer = other.id;
    } else {
      room.activePlayer = other.id;
      room.passivePlayer = socket.id;
    }

    room.state = 'playing';
    room.currentTurn = room.activePlayer;
    room.strikes = 0;

    const activeName = room.players.find(p => p.id === room.activePlayer).name;

    io.to(code).emit('playPhaseStart', {
      activePlayerId: room.activePlayer,
      activePlayerName: activeName
    });

    startPlayTimer(code);
  });

  // ==========================================
  // PLAYING PHASE - 30 detik, 3 strike
  // ==========================================
  function startPlayTimer(code) {
    const room = rooms[code];
    clearTimer(room);
    io.to(code).emit('startTimer', { duration: 30, phase: 'playing' });
    room.timer = setTimeout(() => playTimeout(code), 30000);
  }

  function playTimeout(code) {
    const room = rooms[code];
    if (!room || room.state !== 'playing') return;

    room.strikes++;
    io.to(code).emit('wrongAnswer', {
      strikes: room.strikes,
      playerId: room.currentTurn,
      answer: '(waktu habis)'
    });

    if (room.strikes >= 3) {
      goToSteal(code);
    } else {
      startPlayTimer(code);
    }
  }

  socket.on('submitAnswer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room) return;
    if (room.state !== 'playing' && room.state !== 'steal') return;
    if (room.currentTurn !== socket.id) return;

    const question = room.questions[room.currentRound];
    const matched = matchAnswer(question, answer, room.revealedAnswers);

    if (room.state === 'steal') {
      clearTimer(room);
      if (matched !== null) {
        // Steal berhasil!
        room.revealedAnswers.push(matched);
        room.roundScorePool += question.answers[matched].score;
        io.to(code).emit('correctAnswer', {
          index: matched, text: question.answers[matched].text,
          score: question.answers[matched].score,
          revealedAnswers: room.revealedAnswers,
          roundScore: room.roundScorePool, playerId: socket.id
        });
        finishRound(code, room.passivePlayer); // steal player = passivePlayer
      } else {
        // Steal gagal
        io.to(code).emit('wrongAnswer', { strikes: 1, playerId: socket.id, answer });
        io.to(code).emit('stealFailed', {
          activePlayerName: room.players.find(p => p.id === room.activePlayer).name
        });
        finishRound(code, room.activePlayer);
      }
      return;
    }

    // Normal playing phase
    if (matched !== null) {
      room.revealedAnswers.push(matched);
      room.roundScorePool += question.answers[matched].score;

      io.to(code).emit('correctAnswer', {
        index: matched, text: question.answers[matched].text,
        score: question.answers[matched].score,
        revealedAnswers: room.revealedAnswers,
        roundScore: room.roundScorePool, playerId: socket.id
      });

      // Semua terbuka?
      if (room.revealedAnswers.length === question.answers.length) {
        clearTimer(room);
        finishRound(code, room.activePlayer);
      } else {
        startPlayTimer(code); // Reset timer
      }
    } else {
      room.strikes++;
      io.to(code).emit('wrongAnswer', { strikes: room.strikes, playerId: socket.id, answer });

      if (room.strikes >= 3) {
        clearTimer(room);
        goToSteal(code);
      } else {
        startPlayTimer(code); // Reset timer
      }
    }
  });

  // ==========================================
  // STEAL PHASE
  // ==========================================
  function goToSteal(code) {
    const room = rooms[code];
    room.state = 'steal';
    room.currentTurn = room.passivePlayer;

    const stealName = room.players.find(p => p.id === room.passivePlayer).name;
    io.to(code).emit('stealPhase', {
      stealPlayerId: room.passivePlayer,
      stealPlayerName: stealName
    });

    clearTimer(room);
    io.to(code).emit('startTimer', { duration: 15, phase: 'steal' });
    room.timer = setTimeout(() => {
      // Steal timeout = gagal
      io.to(code).emit('stealFailed', {
        activePlayerName: room.players.find(p => p.id === room.activePlayer).name
      });
      finishRound(code, room.activePlayer);
    }, 15000);
  }

  // ==========================================
  // FINISH ROUND
  // ==========================================
  function finishRound(code, winnerId) {
    const room = rooms[code];
    if (!room) return;
    clearTimer(room);

    const multiplier = getMultiplier(room.currentRound);
    const finalScore = room.roundScorePool * multiplier;
    room.scores[winnerId] += finalScore;

    const winnerName = room.players.find(p => p.id === winnerId).name;
    const question = room.questions[room.currentRound];

    io.to(code).emit('roundComplete', {
      winnerId, winnerName,
      roundScore: room.roundScorePool,
      multiplier, finalScore,
      scores: room.scores,
      allAnswers: question.answers
    });

    room.currentRound++;
    setTimeout(() => startRound(code), 4000);
  }

  // ==========================================
  // END GAME
  // ==========================================
  function endGame(code) {
    const room = rooms[code];
    if (!room) return;
    clearTimer(room);
    room.state = 'gameOver';

    const p1 = room.players[0], p2 = room.players[1];
    const s1 = room.scores[p1.id], s2 = room.scores[p2.id];
    let winner = null;
    if (s1 > s2) winner = p1;
    else if (s2 > s1) winner = p2;

    io.to(code).emit('gameOver', {
      winner: winner ? winner.name : null,
      winnerId: winner ? winner.id : null,
      scores: room.scores, players: room.players,
      isDraw: !winner
    });
  }

  socket.on('disconnect', () => {
    for (const code in rooms) {
      const room = rooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        clearTimer(room);
        io.to(code).emit('playerDisconnected', { name: room.players[idx].name });
        delete rooms[code];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Super Family 100 running on port ${PORT}`);
});
