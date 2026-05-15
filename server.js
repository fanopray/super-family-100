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

// API: Get all questions
app.get('/api/questions', (req, res) => {
  res.json(questions);
});

// API: Add new question
app.post('/api/questions', (req, res) => {
  const { question, answers } = req.body;
  if (!question || !answers || answers.length === 0) {
    return res.status(400).json({ error: 'Pertanyaan dan jawaban harus diisi!' });
  }

  const newQuestion = {
    id: questions.length > 0 ? Math.max(...questions.map(q => q.id)) + 1 : 1,
    question,
    answers
  };
  questions.push(newQuestion);

  // Save to file
  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'data', 'questions.json'),
    JSON.stringify(questions, null, 2),
    'utf-8'
  );

  res.json({ success: true, question: newQuestion });
});

// API: Delete question
app.delete('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Pertanyaan tidak ditemukan!' });
  }

  questions.splice(index, 1);

  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'data', 'questions.json'),
    JSON.stringify(questions, null, 2),
    'utf-8'
  );

  res.json({ success: true });
});

// API: Edit question
app.put('/api/questions/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const index = questions.findIndex(q => q.id === id);
  if (index === -1) {
    return res.status(404).json({ error: 'Pertanyaan tidak ditemukan!' });
  }

  const { question, answers } = req.body;
  if (!question || !answers || answers.length < 2) {
    return res.status(400).json({ error: 'Pertanyaan dan minimal 2 jawaban harus diisi!' });
  }

  questions[index] = { id, question, answers };

  const fs = require('fs');
  fs.writeFileSync(
    path.join(__dirname, 'data', 'questions.json'),
    JSON.stringify(questions, null, 2),
    'utf-8'
  );

  res.json({ success: true, question: questions[index] });
});

// Game rooms storage
const rooms = {};

function generateRoomCode() {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

function getRandomQuestions(count = 5) {
  const shuffled = [...questions].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function createRoom(hostPlayer) {
  let code = generateRoomCode();
  while (rooms[code]) {
    code = generateRoomCode();
  }

  rooms[code] = {
    code,
    players: [hostPlayer],
    state: 'waiting', // waiting, buzzer, answering, roundEnd, gameOver
    currentRound: 0,
    totalRounds: 5,
    questions: getRandomQuestions(5),
    revealedAnswers: [],
    scores: {},
    strikes: 0,
    maxStrikes: 3,
    currentTurn: null, // player id yang lagi giliran
    buzzerWinner: null,
    roundScorePool: 0
  };

  rooms[code].scores[hostPlayer.id] = 0;
  return rooms[code];
}

io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  // Buat room baru
  socket.on('createRoom', (playerName) => {
    const player = { id: socket.id, name: playerName };
    const room = createRoom(player);
    socket.join(room.code);
    socket.emit('roomCreated', { code: room.code, player });
    console.log(`Room ${room.code} created by ${playerName}`);
  });

  // Join room
  socket.on('joinRoom', ({ code, playerName }) => {
    const room = rooms[code];
    if (!room) {
      socket.emit('error', 'Room tidak ditemukan!');
      return;
    }
    if (room.players.length >= 2) {
      socket.emit('error', 'Room sudah penuh!');
      return;
    }
    if (room.state !== 'waiting') {
      socket.emit('error', 'Game sudah dimulai!');
      return;
    }

    const player = { id: socket.id, name: playerName };
    room.players.push(player);
    room.scores[player.id] = 0;
    socket.join(code);

    socket.emit('roomJoined', { code, player, opponent: room.players[0] });
    socket.to(code).emit('opponentJoined', player);

    // Auto start game ketika 2 pemain sudah join
    setTimeout(() => startGame(code), 2000);
  });

  // Start game
  function startGame(code) {
    const room = rooms[code];
    if (!room || room.players.length < 2) return;

    room.state = 'buzzer';
    room.currentRound = 0;
    startRound(code);
  }

  function startRound(code) {
    const room = rooms[code];
    if (room.currentRound >= room.totalRounds) {
      endGame(code);
      return;
    }

    room.state = 'buzzer';
    room.revealedAnswers = [];
    room.strikes = 0;
    room.buzzerWinner = null;
    room.currentTurn = null;
    room.roundScorePool = 0;

    const question = room.questions[room.currentRound];
    io.to(code).emit('newRound', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      question: question.question,
      answerCount: question.answers.length,
      scores: room.scores
    });

    // Buzzer phase
    setTimeout(() => {
      io.to(code).emit('buzzerReady');
    }, 2000);
  }

  // Buzzer ditekan
  socket.on('buzzer', (code) => {
    const room = rooms[code];
    if (!room || room.state !== 'buzzer') return;
    if (room.buzzerWinner) return; // sudah ada yang pencet

    room.buzzerWinner = socket.id;
    room.currentTurn = socket.id;
    room.state = 'answering';

    io.to(code).emit('buzzerWon', {
      winnerId: socket.id,
      winnerName: room.players.find(p => p.id === socket.id).name
    });
  });

  // Submit jawaban
  socket.on('submitAnswer', ({ code, answer }) => {
    const room = rooms[code];
    if (!room || room.state !== 'answering') return;
    if (room.currentTurn !== socket.id) return;

    const question = room.questions[room.currentRound];
    const normalizedAnswer = answer.toLowerCase().trim();

    // Cek apakah jawaban cocok
    let matched = null;
    for (let i = 0; i < question.answers.length; i++) {
      if (room.revealedAnswers.includes(i)) continue;
      const ans = question.answers[i].text.toLowerCase();
      if (ans.includes(normalizedAnswer) || normalizedAnswer.includes(ans)) {
        matched = i;
        break;
      }
    }

    if (matched !== null) {
      // Jawaban benar
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

      // Cek apakah semua jawaban sudah terbuka
      if (room.revealedAnswers.length === question.answers.length) {
        // Semua jawaban terbuka, skor masuk ke pemain yang lagi giliran
        room.scores[room.currentTurn] += room.roundScorePool;
        io.to(code).emit('roundComplete', {
          winnerId: room.currentTurn,
          winnerName: room.players.find(p => p.id === room.currentTurn).name,
          roundScore: room.roundScorePool,
          scores: room.scores
        });
        room.currentRound++;
        setTimeout(() => startRound(code), 3000);
      }
    } else {
      // Jawaban salah - strike
      room.strikes++;
      io.to(code).emit('wrongAnswer', {
        strikes: room.strikes,
        playerId: socket.id,
        answer: answer
      });

      if (room.strikes >= room.maxStrikes) {
        // 3 strike - giliran pindah ke lawan atau ronde selesai
        const otherPlayer = room.players.find(p => p.id !== room.currentTurn);

        if (room.currentTurn === room.buzzerWinner) {
          // Pindah ke lawan, lawan dapat 1 kesempatan
          room.currentTurn = otherPlayer.id;
          room.strikes = 0;
          room.maxStrikes = 1; // lawan cuma dapat 1 kesempatan

          io.to(code).emit('turnSwitch', {
            newPlayerId: otherPlayer.id,
            newPlayerName: otherPlayer.name,
            message: 'Giliran pindah! Kamu punya 1 kesempatan untuk steal!'
          });
        } else {
          // Lawan juga gagal, skor masuk ke buzzer winner
          room.scores[room.buzzerWinner] += room.roundScorePool;
          io.to(code).emit('roundComplete', {
            winnerId: room.buzzerWinner,
            winnerName: room.players.find(p => p.id === room.buzzerWinner).name,
            roundScore: room.roundScorePool,
            scores: room.scores
          });
          room.currentRound++;
          room.maxStrikes = 3;
          setTimeout(() => startRound(code), 3000);
        }
      }
    }
  });

  // Pass giliran
  socket.on('pass', (code) => {
    const room = rooms[code];
    if (!room || room.state !== 'answering') return;
    if (room.currentTurn !== socket.id) return;

    // Skor masuk ke pemain yang pass
    room.scores[room.currentTurn] += room.roundScorePool;
    io.to(code).emit('roundComplete', {
      winnerId: room.currentTurn,
      winnerName: room.players.find(p => p.id === room.currentTurn).name,
      roundScore: room.roundScorePool,
      scores: room.scores,
      allAnswers: room.questions[room.currentRound].answers
    });
    room.currentRound++;
    room.maxStrikes = 3;
    setTimeout(() => startRound(code), 3000);
  });

  function endGame(code) {
    const room = rooms[code];
    if (!room) return;

    room.state = 'gameOver';
    const player1 = room.players[0];
    const player2 = room.players[1];
    const score1 = room.scores[player1.id];
    const score2 = room.scores[player2.id];

    let winner = null;
    if (score1 > score2) winner = player1;
    else if (score2 > score1) winner = player2;

    io.to(code).emit('gameOver', {
      winner: winner ? winner.name : null,
      winnerId: winner ? winner.id : null,
      scores: room.scores,
      players: room.players,
      isDraw: !winner
    });
  }

  // Disconnect
  socket.on('disconnect', () => {
    console.log(`Player disconnected: ${socket.id}`);
    // Cari room yang ada player ini
    for (const code in rooms) {
      const room = rooms[code];
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        io.to(code).emit('playerDisconnected', {
          name: room.players[playerIndex].name
        });
        delete rooms[code];
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Super Family 100 server running on port ${PORT}`);
});
