// server.js
const express = require('express');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;

// ✅ Correct CORS setup
app.use(cors({
  origin: "https://aadeshghimire.free.nf", // allow only your frontend
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

// ✅ Handle preflight requests
app.options('*', cors({
  origin: "https://aadeshghimire.free.nf",
  methods: ["GET", "POST", "OPTIONS"],
  allowedHeaders: ["Content-Type"],
}));

app.use(express.json());

// In-memory game storage
let rooms = {};

// Utility: generate 4-letter room code
function generateRoomCode() {
  const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  let code = "";
  for (let i = 0; i < 4; i++) {
    code += letters.charAt(Math.floor(Math.random() * letters.length));
  }
  return code;
}

// Create Lobby
app.post('/create-lobby', (req, res) => {
  const { playerId, playerName } = req.body;
  const roomId = generateRoomCode();

  rooms[roomId] = {
    id: roomId,
    hostId: playerId,
    players: [{ id: playerId, name: playerName, isHost: true }],
    gameStarted: false,
    phase: 'lobby',
    currentRound: 1,
    imposterId: null,
    votes: {},
    winner: null
  };

  res.json({ roomId });
});

// Join Lobby
app.post('/join-lobby', (req, res) => {
  const { playerId, playerName, roomId } = req.body;
  const room = rooms[roomId];

  if (!room) return res.status(404).json({ error: "Room not found" });

  room.players.push({ id: playerId, name: playerName, isHost: false });
  res.json({ success: true });
});

// Leave Lobby
app.post('/leave-lobby', (req, res) => {
  const { playerId, roomId } = req.body;
  const room = rooms[roomId];

  if (room) {
    room.players = room.players.filter(p => p.id !== playerId);
    if (room.players.length === 0) {
      delete rooms[roomId]; // delete empty room
    }
  }
  res.json({ success: true });
});

// Start Game
app.post('/start-game', (req, res) => {
  const { roomId } = req.body;
  const room = rooms[roomId];

  if (!room) return res.status(404).json({ error: "Room not found" });

  // Pick imposter randomly
  const imposter = room.players[Math.floor(Math.random() * room.players.length)];
  room.imposterId = imposter.id;

  // Assign words
  const wordPairs = [
    ["CAT", "DOG"],
    ["APPLE", "ORANGE"],
    ["CAR", "BIKE"]
  ];
  const chosenPair = wordPairs[Math.floor(Math.random() * wordPairs.length)];
  const [civilianWord, imposterWord] = chosenPair;

  room.players.forEach(player => {
    player.word = player.id === room.imposterId ? imposterWord : civilianWord;
    player.clue = null;
  });

  room.phase = "words";
  room.gameStarted = true;
  res.json({ success: true });
});

// Submit Clue
app.post('/submit-clue', (req, res) => {
  const { roomId, playerId, clue } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });

  const player = room.players.find(p => p.id === playerId);
  if (player) {
    player.clue = clue; // save clue
  }
  res.json({ success: true });
});

// Submit Vote
app.post('/vote', (req, res) => {
  const { roomId, playerId, targetPlayerId } = req.body;
  const room = rooms[roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });

  room.votes[targetPlayerId] = (room.votes[targetPlayerId] || 0) + 1;
  res.json({ success: true });
});

// New Game
app.post('/new-game', (req, res) => {
  const { roomId } = req.body;
  const room = rooms[roomId];

  if (room) {
    room.phase = 'lobby';
    room.currentRound = 1;
    room.votes = {};
    room.winner = null;
    room.imposterId = null;
    room.players.forEach(p => {
      p.word = null;
      p.clue = null;
    });
    room.gameStarted = false;
  }

  res.json({ success: true });
});

// Get Room State
app.get('/room/:roomId', (req, res) => {
  const room = rooms[req.params.roomId];
  if (!room) return res.status(404).json({ error: "Room not found" });
  res.json({ room });
});

// Start Server
app.listen(PORT, () => {
  console.log(`🎭 Imposter Game server running on port ${PORT}`);
});
