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

function getRandomQuestions(count = 3, usedIds = []) {
  // Filter out already used questions
  let available = questions.filter(q => !usedIds.includes(q.id));
  
  // If not enough available, reset (all questions have been used)
  if (available.length < count) {
    available = [...questions];
  }
  
  const shuffled = available.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function createRoom(hostPlayer) {
  let code = generateRoomCode();
  while (rooms[code]) code = generateRoomCode();

  const selectedQuestions = getRandomQuestions(3, []);

  rooms[code] = {
    code,
    players: [hostPlayer],
    state: 'waiting',
    currentRound: 0,
    totalRounds: 3,
    questions: selectedQuestions,
    usedQuestionIds: selectedQuestions.map(q => q.id),
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
    // Exact/partial match
    if (ans.includes(normalized) || normalized.includes(ans)) return i;
    // Abbreviation match
    if (matchAbbreviation(normalized, ans)) return i;
    // Fuzzy match
    if (fuzzyMatch(normalized, ans)) return i;
  }
  return null;
}

// Common abbreviations and alternate spellings
const abbreviations = {
  'hp': ['handphone', 'hp/handphone', 'hp', 'telepon', 'hape'],
  'handphone': ['hp', 'hp/handphone', 'hape'],
  'hape': ['hp', 'handphone', 'hp/handphone'],
  'tv': ['televisi', 'tv', 'tivi'],
  'televisi': ['tv', 'tivi'],
  'ac': ['air conditioner', 'ac', 'pendingin ruangan'],
  'motor': ['sepeda motor', 'motor'],
  'mobil': ['mobil', 'kendaraan'],
  'ig': ['instagram', 'ig'],
  'instagram': ['ig', 'instagram'],
  'wa': ['whatsapp', 'wa'],
  'whatsapp': ['wa', 'whatsapp'],
  'fb': ['facebook', 'fb'],
  'facebook': ['fb', 'facebook'],
  'yt': ['youtube', 'yt'],
  'youtube': ['yt', 'youtube'],
  'tt': ['tiktok', 'tt'],
  'tiktok': ['tt', 'tiktok'],
  'krl': ['kereta', 'krl', 'commuter line'],
  'ojol': ['ojek online', 'ojol'],
  'ojek online': ['ojol', 'ojek online'],
  'gojek': ['gojek', 'ojol', 'ojek online'],
  'grab': ['grab', 'ojol', 'ojek online'],
  'wfh': ['work from home', 'wfh', 'kerja dari rumah'],
  'pns': ['pegawai negeri', 'pns', 'pegawai negeri sipil'],
  'ktp': ['kartu tanda penduduk', 'ktp'],
  'sim': ['surat izin mengemudi', 'sim'],
  'atm': ['atm', 'kartu atm', 'kartu debit'],
  'sd': ['sekolah dasar', 'sd'],
  'smp': ['sekolah menengah pertama', 'smp'],
  'sma': ['sekolah menengah atas', 'sma'],
  'wifi': ['wifi', 'wi-fi', 'internet'],
  'mie': ['mie', 'mi', 'mie instan'],
  'mi': ['mie', 'mi', 'mie instan'],
  'nasi goreng': ['nasgor', 'nasi goreng'],
  'nasgor': ['nasi goreng', 'nasgor'],
  'indomie': ['indomie', 'mie instan', 'indomie goreng'],
};

function matchAbbreviation(input, target) {
  // Check if input is an abbreviation of target or vice versa
  const inputAbbrs = abbreviations[input] || [];
  const targetAbbrs = abbreviations[target] || [];
  
  // Input matches one of target's alternate forms
  if (targetAbbrs.includes(input)) return true;
  // Target matches one of input's alternate forms
  if (inputAbbrs.includes(target)) return true;
  
  // Check if any of input's forms match target (partial)
  for (const form of inputAbbrs) {
    if (target.includes(form) || form.includes(target)) return true;
  }
  // Check if any of target's forms match input (partial)
  for (const form of targetAbbrs) {
    if (input.includes(form) || form.includes(input)) return true;
  }
  
  return false;
}

function fuzzyMatch(input, target) {
  const normalize = (str) => {
    return str
      .replace(/[^a-z0-9\s]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  };

  const n1 = normalize(input);
  const n2 = normalize(target);

  if (n1 === n2) return true;
  if (n1.includes(n2) || n2.includes(n1)) return true;

  // Check similarity (Levenshtein)
  if (n1.length >= 3 && n2.length >= 3) {
    const maxLen = Math.max(n1.length, n2.length);
    const dist = levenshtein(n1, n2);
    const threshold = maxLen <= 5 ? 1 : 2;
    if (dist <= threshold) return true;
  }

  return false;
}

function levenshtein(a, b) {
  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
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

        // Kalau buzzer winner gagal jawab (null), lawan otomatis pilih
        if (room.buzzerWinnerAnswerIdx === null) {
          goToChoose(code, room.buzzerLoser);
        } else if (room.buzzerLoserAnswerIdx < room.buzzerWinnerAnswerIdx) {
          // Lawan jawab lebih tinggi
          goToChoose(code, room.buzzerLoser);
        } else {
          // Buzzer winner jawab lebih tinggi
          goToChoose(code, room.buzzerWinner);
        }
      }
    } else {
      // Salah
      io.to(code).emit('buzzerWrongAnswer', { playerId: socket.id, answer });

      if (room.faceOffPhase === 'first') {
        // Buzzer winner salah, giliran lawan
        room.buzzerWinnerAnswerIdx = null; // mark as failed
        room.faceOffPhase = 'second';
        room.currentTurn = room.buzzerLoser;
        io.to(code).emit('faceOffSwitch', {
          newPlayerId: room.buzzerLoser,
          newPlayerName: room.players.find(p => p.id === room.buzzerLoser).name
        });
        startFaceOffTimer(code);
      } else {
        // Lawan juga salah (buzzer winner sudah salah sebelumnya)
        // Buzzer winner tetap pilih karena menang buzzer
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
      isDraw: !winner,
      roomCode: code
    });
  }

  // Play Again in same room
  socket.on('playAgain', (code) => {
    const room = rooms[code];
    if (!room || room.state !== 'gameOver') return;

    // Track ready players
    if (!room.readyPlayers) room.readyPlayers = [];
    if (!room.readyPlayers.includes(socket.id)) {
      room.readyPlayers.push(socket.id);
    }

    io.to(code).emit('playerReady', {
      playerId: socket.id,
      playerName: room.players.find(p => p.id === socket.id).name,
      readyCount: room.readyPlayers.length
    });

    // Both players ready
    if (room.readyPlayers.length >= 2) {
      room.readyPlayers = [];
      room.scores[room.players[0].id] = 0;
      room.scores[room.players[1].id] = 0;
      
      // Get new questions that haven't been used yet
      const newQuestions = getRandomQuestions(3, room.usedQuestionIds);
      room.questions = newQuestions;
      // Track newly used questions
      newQuestions.forEach(q => {
        if (!room.usedQuestionIds.includes(q.id)) {
          room.usedQuestionIds.push(q.id);
        }
      });
      
      // If all questions have been used, reset tracking
      if (room.usedQuestionIds.length >= questions.length) {
        room.usedQuestionIds = newQuestions.map(q => q.id);
      }
      
      room.currentRound = 0;

      io.to(code).emit('gameRestart', { scores: room.scores });

      setTimeout(() => startRound(code), 2000);
    }
  });

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

// ==========================================
// ABC 5 DASAR GAME
// ==========================================
const abcWords = require('./data/abc-words.json');
const abcRooms = {};

function genAbcCode() {
  const c = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) code += c[Math.floor(Math.random() * c.length)];
  return code;
}

function numberToLetter(num) {
  // 1=A, 2=B, ... 26=Z, 27=A, etc.
  return String.fromCharCode(65 + ((num - 1) % 26));
}

function validateAbcAnswer(word, letter, category) {
  const normalized = word.toLowerCase().trim();
  if (!normalized.startsWith(letter.toLowerCase())) return false;
  
  // Check against database
  const categoryWords = abcWords[category];
  if (!categoryWords) return false;
  const validWords = categoryWords[letter.toLowerCase()] || [];
  
  // For artis: must be exact/full name match only
  if (category === 'artis') {
    for (const w of validWords) {
      const wLower = w.toLowerCase();
      if (wLower === normalized) return true;
    }
    return false;
  }
  
  // For other categories: allow partial match
  for (const w of validWords) {
    const wLower = w.toLowerCase();
    if (wLower === normalized) return true;
    if (normalized.length >= 3 && (wLower.startsWith(normalized) || normalized.startsWith(wLower))) return true;
  }
  
  return false;
}

io.on('connection', (socket) => {
  // ABC: Create room → langsung ke lobby
  socket.on('abc:create', (playerName) => {
    let code = genAbcCode();
    while (abcRooms[code]) code = genAbcCode();
    
    const player = { id: socket.id, name: playerName };
    abcRooms[code] = {
      code,
      players: [player],
      hostId: socket.id,
      state: 'lobby',
      scores: { [socket.id]: 0 },
      category: 'negara',
      letterMethod: 'random',
      currentRound: 0,
      totalRounds: 5,
      currentLetter: '',
      currentCategory: '',
      usedAnswers: [],
      usedLetters: [],
      timer: null
    };
    
    socket.join(code);
    socket.emit('abc:roomCreated', { code });
    io.to(code).emit('abc:lobbyUpdate', {
      code, players: abcRooms[code].players, category: abcRooms[code].category,
      letterMethod: abcRooms[code].letterMethod, hostId: socket.id
    });
  });

  // ABC: Join room
  socket.on('abc:join', ({ code, name }) => {
    const room = abcRooms[code];
    if (!room) return socket.emit('error', 'Room tidak ditemukan!');
    if (room.players.length >= 5) return socket.emit('error', 'Room penuh (max 5)!');
    if (room.state !== 'lobby') return socket.emit('error', 'Game sudah dimulai!');

    const player = { id: socket.id, name };
    room.players.push(player);
    room.scores[socket.id] = 0;
    socket.join(code);
    socket.emit('abc:joined', { code });
    io.to(code).emit('abc:lobbyUpdate', {
      code, players: room.players, category: room.category,
      letterMethod: room.letterMethod, hostId: room.hostId
    });
  });

  // ABC: Start game (host only, settings from client)
  socket.on('abc:startGame', ({ code, category, letterMethod }) => {
    const room = abcRooms[code];
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 1) return socket.emit('error', 'Minimal 1 pemain!');

    room.category = category;
    room.letterMethod = letterMethod;
    room.currentRound = 0;
    room.usedLetters = [];
    room.players.forEach(p => room.scores[p.id] = 0);

    io.to(code).emit('abc:gameStart');

    if (letterMethod === 'number') {
      io.to(code).emit('abc:requestNumber', { round: 1 });
    } else {
      startAbcRound(code);
    }
  });

  // ABC: Submit number for letter - collect from all players then sum
  socket.on('abc:submitNumber', ({ code, number }) => {
    const room = abcRooms[code];
    if (!room) return;
    
    if (!room.numberInputs) room.numberInputs = {};
    room.numberInputs[socket.id] = number;
    
    // Notify others this player has submitted
    const submitted = Object.keys(room.numberInputs).length;
    const total = room.players.length;
    
    socket.emit('abc:numberSubmitted');
    io.to(code).emit('abc:numberProgress', { submitted, total });
    
    // All players submitted?
    if (submitted >= total) {
      // Sum all numbers
      const sum = Object.values(room.numberInputs).reduce((a, b) => a + b, 0);
      const letter = numberToLetter(sum);
      room.numberInputs = {}; // Reset for next round
      
      io.to(code).emit('abc:numberResult', { sum, letter });
      
      setTimeout(() => {
        startAbcRoundWithLetter(code, letter);
      }, 2000);
    }
  });

  function startAbcRound(code) {
    const room = abcRooms[code];
    if (!room) return;
    if (room.currentRound >= room.totalRounds) { endAbcGame(code); return; }

    // Pick random letter (avoid used ones if possible)
    const allLetters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');
    let available = allLetters.filter(l => !room.usedLetters.includes(l));
    if (available.length === 0) available = allLetters;
    const letter = available[Math.floor(Math.random() * available.length)];
    room.usedLetters.push(letter);
    
    startAbcRoundWithLetter(code, letter);
  }

  function startAbcRoundWithLetter(code, letter) {
    const room = abcRooms[code];
    if (!room) return;
    if (room.currentRound >= room.totalRounds) { endAbcGame(code); return; }

    room.currentLetter = letter;
    room.currentCategory = room.category; // Same category all rounds
    room.usedAnswers = [];
    room.state = 'playing';

    io.to(code).emit('abc:newRound', {
      round: room.currentRound + 1,
      totalRounds: room.totalRounds,
      category: room.currentCategory,
      letter: letter,
      players: room.players,
      scores: room.scores
    });

    // Start 60 second timer
    io.to(code).emit('abc:timerStart', { duration: 60 });
    
    if (room.timer) clearTimeout(room.timer);
    room.timer = setTimeout(() => {
      room.state = 'roundEnd';
      io.to(code).emit('abc:roundEnd', { players: room.players, scores: room.scores });
      room.currentRound++;
      
      // Next round after 3 seconds
      setTimeout(() => {
        if (room.letterMethod === 'number' && room.currentRound < room.totalRounds) {
          io.to(code).emit('abc:requestNumber', { round: room.currentRound + 1 });
        } else {
          startAbcRound(code);
        }
      }, 3000);
    }, 60000);
  }

  // ABC: Answer
  socket.on('abc:answer', ({ code, word }) => {
    const room = abcRooms[code];
    if (!room || room.state !== 'playing') return;
    
    const player = room.players.find(p => p.id === socket.id);
    if (!player) return;

    let normalized = word.toLowerCase().trim();
    const letter = room.currentLetter.toLowerCase();
    
    // For artis category: use full name, don't split
    // For other categories: if multi-word like "burung elang" and letter is E, extract "elang"
    if (room.currentCategory !== 'artis' && normalized.includes(' ')) {
      const words = normalized.split(' ');
      const matchingWord = words.find(w => w.startsWith(letter));
      if (matchingWord) {
        normalized = matchingWord;
      }
    }
    
    // Check not duplicate
    const isDuplicate = room.usedAnswers.some(used => {
      if (room.currentCategory === 'artis') {
        // For artis: exact match only
        return used === normalized;
      }
      // For other categories: check if the core word is already used
      return used === normalized || 
             used.includes(normalized) || 
             normalized.includes(used);
    });
    
    if (isDuplicate) {
      io.to(code).emit('abc:answerResult', {
        playerName: player.name, word, valid: false, playerId: socket.id,
        reason: 'Sudah disebut!'
      });
      return;
    }

    // Validate against database
    const valid = validateAbcAnswer(normalized, letter, room.currentCategory);
    
    if (valid) {
      room.usedAnswers.push(normalized);
      room.scores[socket.id] = (room.scores[socket.id] || 0) + 1;
    }

    io.to(code).emit('abc:answerResult', {
      playerName: player.name, word: normalized, valid, playerId: socket.id
    });

    if (valid) {
      io.to(code).emit('abc:scoreUpdate', { players: room.players, scores: room.scores });
    }
  });

  // ABC: Play again
  socket.on('abc:playAgain', (code) => {
    const room = abcRooms[code];
    if (!room) return;
    room.state = 'lobby';
    room.currentRound = 0;
    room.players.forEach(p => room.scores[p.id] = 0);
    io.to(code).emit('abc:restart');
    io.to(code).emit('abc:lobbyUpdate', {
      code, players: room.players, category: room.category,
      letterMethod: room.letterMethod, hostId: room.hostId
    });
  });

  function endAbcGame(code) {
    const room = abcRooms[code];
    if (!room) return;
    if (room.timer) { clearTimeout(room.timer); room.timer = null; }
    room.state = 'gameOver';

    // Ranking
    const ranking = room.players
      .map(p => ({ id: p.id, name: p.name, score: room.scores[p.id] || 0 }))
      .sort((a, b) => b.score - a.score);

    io.to(code).emit('abc:gameOver', { players: room.players, scores: room.scores, ranking });
  }

  // ABC: Disconnect
  socket.on('disconnect', () => {
    for (const code in abcRooms) {
      const room = abcRooms[code];
      const idx = room.players.findIndex(p => p.id === socket.id);
      if (idx !== -1) {
        const name = room.players[idx].name;
        room.players.splice(idx, 1);
        if (room.players.length === 0) {
          if (room.timer) clearTimeout(room.timer);
          delete abcRooms[code];
        } else {
          io.to(code).emit('abc:playerDisconnected', { name });
          io.to(code).emit('abc:playerList', room.players);
        }
        break;
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Game Server running on port ${PORT}`);
});
