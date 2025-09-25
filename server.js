const express = require('express');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ====================
// CORS FIX for frontend
// ====================
app.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://aadeshghimire.free.nf"); // frontend domain
  res.header("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type");
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

app.use(express.json());

// ====================
// In-memory game storage
// ====================
let rooms = {}; // { roomId: { players: [], phase: 'lobby', currentRound: 1, gameStarted: false, imposterId: null, votes: {}, winner: null } }

// ====================
// Helper Functions
// ====================
function createRoom(playerId, playerName) {
  const roomId = Math.random().toString(36).substring(2, 8).toUpperCase();
  rooms[roomId] = {
    players: [{ id: playerId, name: playerName, isHost: true }],
    phase: 'lobby',
    currentRound: 1,
    gameStarted: false,
    imposterId: null,
    votes: {},
    winner: null
  };
  return roomId;
}

function joinRoom(roomId, playerId, playerName) {
  const room = rooms[roomId];
  if (!room) throw new Error('Room not found');
  room.players.push({ id: playerId, name: playerName, isHost: false });
}

// ====================
// Routes
// ====================

// Create lobby
app.post('/create-lobby', (req, res) => {
  const { playerId, playerName } = req.body;
  const roomId = createRoom(playerId, playerName);
  res.json({ roomId });
});

// Join lobby
app.post('/join-lobby', (req, res) => {
  const { playerId, playerName, roomId } = req.body;
  try {
    joinRoom(roomId, playerId, playerName);
    res.json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// Leave lobby
app.post('/leave-lobby', (req, res) => {
  const { playerId, roomId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });
  room.players = room.players.filter(p => p.id !== playerId);

  // If host left, assign new host
  if (!room.players.some(p => p.isHost) && room.players.length > 0) {
    room.players[0].isHost = true;
  }

  res.json({ success: true });
});

// Start game
app.post('/start-game', (req, res) => {
  const { roomId, playerId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });
  const host = room.players.find(p => p.id === playerId && p.isHost);
  if (!host) return res.status(400).json({ error: 'Only host can start the game' });

  room.gameStarted = true;
  room.phase = 'words';
  room.imposterId = room.players[Math.floor(Math.random() * room.players.length)].id;

  // Assign random words
  room.players.forEach(player => {
    player.word = 'apple'; // You can randomize word list if needed
    player.clue = '';
  });

  res.json({ success: true });
});

// Submit clue (no auto-advance)
app.post('/submit-clue', (req, res) => {
  const { roomId, playerId, clue } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });

  const player = room.players.find(p => p.id === playerId);
  if (!player) return res.status(400).json({ error: 'Player not found' });

  player.clue = clue;
  res.json({ success: true });
});

// Vote (no auto-advance)
app.post('/vote', (req, res) => {
  const { roomId, playerId, targetPlayerId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });

  room.votes[targetPlayerId] = (room.votes[targetPlayerId] || 0) + 1;
  res.json({ success: true });
});

// Advance phase manually (host only)
app.post('/advance-phase', (req, res) => {
  const { roomId, playerId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });

  const host = room.players.find(p => p.id === playerId && p.isHost);
  if (!host) return res.status(400).json({ error: 'Only host can advance phase' });

  switch (room.phase) {
    case 'words':
      room.phase = 'clues';
      break;
    case 'clues':
      room.phase = 'voting';
      break;
    case 'voting':
      // Tally votes
      const mostVoted = Object.entries(room.votes).sort((a, b) => b[1] - a[1])[0];
      if (mostVoted && mostVoted[0] === room.imposterId) {
        room.phase = 'gameOver';
        room.winner = 'civilians';
      } else if (room.currentRound < 3) {
        room.currentRound += 1;
        room.phase = 'words';
        room.votes = {};
        room.players.forEach(p => p.clue = '');
      } else {
        room.phase = 'gameOver';
        room.winner = 'imposter';
      }
      break;
    case 'results':
    case 'gameOver':
      break;
    default:
      room.phase = 'words';
      break;
  }

  res.json({ success: true });
});

// New game
app.post('/new-game', (req, res) => {
  const { roomId, playerId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });
  const host = room.players.find(p => p.id === playerId && p.isHost);
  if (!host) return res.status(400).json({ error: 'Only host can start new game' });

  room.phase = 'lobby';
  room.currentRound = 1;
  room.gameStarted = false;
  room.imposterId = null;
  room.votes = {};
  room.winner = null;
  room.players.forEach(p => {
    p.word = '';
    p.clue = '';
  });

  res.json({ success: true });
});

// Polling / get room state
app.get('/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(400).json({ error: 'Room not found' });

  res.json({ room });
});

// ====================
// Start server
// ====================
app.listen(PORT, () => {
  console.log(`🎮 Imposter Game Server running on port ${PORT}`);
});
