const express = require('express');
const cors = require('cors');
const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Game data storage
const rooms = new Map();

// Word pairs for the game (civilian word, imposter word)
const WORD_PAIRS = [
    { civilian: "Apple", imposter: "Orange" },
    { civilian: "Guitar", imposter: "Piano" },
    { civilian: "Ocean", imposter: "Lake" },
    { civilian: "Lion", imposter: "Tiger" },
    { civilian: "Coffee", imposter: "Tea" },
    { civilian: "Basketball", imposter: "Football" },
    { civilian: "Rose", imposter: "Tulip" },
    { civilian: "Pizza", imposter: "Burger" },
    { civilian: "Doctor", imposter: "Nurse" },
    { civilian: "Car", imposter: "Truck" },
    { civilian: "Movie", imposter: "Series" },
    { civilian: "Summer", imposter: "Spring" },
    { civilian: "Cat", imposter: "Dog" },
    { civilian: "Book", imposter: "Magazine" },
    { civilian: "Rain", imposter: "Snow" },
    { civilian: "Airplane", imposter: "Helicopter" },
    { civilian: "Cake", imposter: "Cookie" },
    { civilian: "Mountain", imposter: "Hill" },
    { civilian: "Shoes", imposter: "Socks" },
    { civilian: "Fire", imposter: "Ice" }
];

// Utility functions
function generateRoomId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
}

function getRandomWordPair() {
    return WORD_PAIRS[Math.floor(Math.random() * WORD_PAIRS.length)];
}

function selectRandomImposter(players) {
    const playerIds = players.map(p => p.id);
    return playerIds[Math.floor(Math.random() * playerIds.length)];
}

function createRoom(hostId, hostName) {
    const roomId = generateRoomId();
    const room = {
        id: roomId,
        players: [{
            id: hostId,
            name: hostName,
            isHost: true,
            word: null,
            clue: null,
            vote: null,
            isImposter: false
        }],
        gameStarted: false,
        currentRound: 1,
        maxRounds: 3,
        phase: 'lobby', // lobby, words, clues, voting, results, gameOver
        wordPair: null,
        imposterId: null,
        votes: {},
        gameEnded: false,
        winner: null,
        createdAt: Date.now()
    };
    
    rooms.set(roomId, room);
    return room;
}

function getRoom(roomId) {
    return rooms.get(roomId);
}

function addPlayerToRoom(roomId, playerId, playerName) {
    const room = getRoom(roomId);
    if (!room) return null;
    
    // Check if player already exists
    const existingPlayer = room.players.find(p => p.id === playerId);
    if (existingPlayer) return room;
    
    // Don't allow joining if game has started
    if (room.gameStarted && room.phase !== 'lobby') {
        throw new Error('Game already in progress');
    }
    
    room.players.push({
        id: playerId,
        name: playerName,
        isHost: false,
        word: null,
        clue: null,
        vote: null,
        isImposter: false
    });
    
    return room;
}

function removePlayerFromRoom(roomId, playerId) {
    const room = getRoom(roomId);
    if (!room) return null;
    
    room.players = room.players.filter(p => p.id !== playerId);
    
    // If host left, make another player host
    if (room.players.length > 0 && !room.players.find(p => p.isHost)) {
        room.players[0].isHost = true;
    }
    
    // Delete room if empty
    if (room.players.length === 0) {
        rooms.delete(roomId);
        return null;
    }
    
    return room;
}

function startGameInRoom(roomId) {
    const room = getRoom(roomId);
    if (!room || room.players.length < 3) {
        throw new Error('Need at least 3 players to start');
    }
    
    // Initialize game
    room.gameStarted = true;
    room.currentRound = 1;
    room.phase = 'words';
    room.gameEnded = false;
    room.winner = null;
    
    // Assign words and select imposter
    assignWordsAndImposter(room);
    
    // Start words phase timer
    setTimeout(() => {
        if (room.phase === 'words') {
            room.phase = 'clues';
        }
    }, 10000); // 10 seconds to see word
    
    return room;
}

function assignWordsAndImposter(room) {
    // Only assign words and imposter for round 1
    if (room.currentRound === 1 || !room.wordPair) {
        room.wordPair = getRandomWordPair();
        room.imposterId = selectRandomImposter(room.players);
        
        // Assign words to players
        room.players.forEach(player => {
            player.isImposter = player.id === room.imposterId;
            player.word = player.isImposter ? room.wordPair.imposter : room.wordPair.civilian;
            // Reset round-specific data
            player.clue = null;
            player.vote = null;
        });
    } else {
        // For rounds 2 and 3, just reset clues and votes
        room.players.forEach(player => {
            player.clue = null;
            player.vote = null;
        });
    }
    
    room.votes = {};
}

function submitClueInRoom(roomId, playerId, clue) {
    const room = getRoom(roomId);
    if (!room || room.phase !== 'clues') return null;
    
    const player = room.players.find(p => p.id === playerId);
    if (!player) return null;
    
    player.clue = clue;
    
    // Check if all players have submitted clues
    const allCluesSubmitted = room.players.every(p => p.clue);
    if (allCluesSubmitted) {
        room.phase = 'voting';
    }
    
    return room;
}

function submitVoteInRoom(roomId, playerId, targetPlayerId) {
    const room = getRoom(roomId);
    if (!room || room.phase !== 'voting') return null;
    
    const player = room.players.find(p => p.id === playerId);
    if (!player) return null;
    
    player.vote = targetPlayerId;
    
    // Count votes
    if (!room.votes[targetPlayerId]) {
        room.votes[targetPlayerId] = 0;
    }
    room.votes[targetPlayerId]++;
    
    // Check if all players have voted
    const allVotesSubmitted = room.players.every(p => p.vote);
    if (allVotesSubmitted) {
        processVotingResults(room);
    }
    
    return room;
}

function processVotingResults(room) {
    room.phase = 'results';
    
    // Find most voted player
    let maxVotes = 0;
    let mostVotedPlayer = null;
    
    for (const [playerId, voteCount] of Object.entries(room.votes)) {
        if (voteCount > maxVotes) {
            maxVotes = voteCount;
            mostVotedPlayer = playerId;
        }
    }
    
    // Check if imposter was caught
    const imposterCaught = mostVotedPlayer === room.imposterId;
    
    if (imposterCaught) {
        // Civilians win
        room.phase = 'gameOver';
        room.gameEnded = true;
        room.winner = 'civilians';
    } else {
        // Move to next round or imposter wins
        if (room.currentRound >= room.maxRounds) {
            room.phase = 'gameOver';
            room.gameEnded = true;
            room.winner = 'imposter';
        } else {
            // Prepare for next round
            setTimeout(() => {
                room.currentRound++;
                room.phase = 'words';
                room.votes = {};
                assignWordsAndImposter(room);
                
                // Start next round words phase timer
                setTimeout(() => {
                    if (room.phase === 'words') {
                        room.phase = 'clues';
                    }
                }, 10000);
            }, 5000); // 5 seconds to show results
        }
    }
}

function resetGameInRoom(roomId) {
    const room = getRoom(roomId);
    if (!room) return null;
    
    // Reset game state
    room.gameStarted = false;
    room.currentRound = 1;
    room.phase = 'lobby';
    room.wordPair = null;
    room.imposterId = null;
    room.votes = {};
    room.gameEnded = false;
    room.winner = null;
    
    // Reset player data
    room.players.forEach(player => {
        player.word = null;
        player.clue = null;
        player.vote = null;
        player.isImposter = false;
    });
    
    return room;
}

// Routes
app.get('/health', (req, res) => {
    res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

app.post('/create-lobby', (req, res) => {
    try {
        const { playerId, playerName } = req.body;
        
        if (!playerId || !playerName) {
            return res.status(400).json({ error: 'Player ID and name are required' });
        }
        
        const room = createRoom(playerId, playerName);
        
        res.json({
            success: true,
            roomId: room.id,
            room: {
                id: room.id,
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isHost: p.isHost
                })),
                gameStarted: room.gameStarted,
                phase: room.phase
            }
        });
    } catch (error) {
        console.error('Create lobby error:', error);
        res.status(500).json({ error: 'Failed to create lobby' });
    }
});

app.post('/join-lobby', (req, res) => {
    try {
        const { playerId, playerName, roomId } = req.body;
        
        if (!playerId || !playerName || !roomId) {
            return res.status(400).json({ error: 'Player ID, name, and room ID are required' });
        }
        
        const room = addPlayerToRoom(roomId, playerId, playerName);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        res.json({
            success: true,
            room: {
                id: room.id,
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isHost: p.isHost
                })),
                gameStarted: room.gameStarted,
                phase: room.phase
            }
        });
    } catch (error) {
        console.error('Join lobby error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/leave-lobby', (req, res) => {
    try {
        const { playerId, roomId } = req.body;
        
        if (!playerId || !roomId) {
            return res.status(400).json({ error: 'Player ID and room ID are required' });
        }
        
        removePlayerFromRoom(roomId, playerId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('Leave lobby error:', error);
        res.status(500).json({ error: 'Failed to leave lobby' });
    }
});

app.post('/start-game', (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        
        if (!roomId || !playerId) {
            return res.status(400).json({ error: 'Room ID and player ID are required' });
        }
        
        const room = getRoom(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const player = room.players.find(p => p.id === playerId);
        if (!player || !player.isHost) {
            return res.status(403).json({ error: 'Only host can start the game' });
        }
        
        const updatedRoom = startGameInRoom(roomId);
        
        res.json({
            success: true,
            room: {
                id: updatedRoom.id,
                players: updatedRoom.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isHost: p.isHost,
                    word: p.word,
                    clue: p.clue,
                    vote: p.vote
                })),
                gameStarted: updatedRoom.gameStarted,
                phase: updatedRoom.phase,
                currentRound: updatedRoom.currentRound,
                maxRounds: updatedRoom.maxRounds
            }
        });
    } catch (error) {
        console.error('Start game error:', error);
        res.status(400).json({ error: error.message });
    }
});

app.post('/submit-clue', (req, res) => {
    try {
        const { roomId, playerId, clue } = req.body;
        
        if (!roomId || !playerId || !clue) {
            return res.status(400).json({ error: 'Room ID, player ID, and clue are required' });
        }
        
        const room = submitClueInRoom(roomId, playerId, clue);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found or invalid phase' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Submit clue error:', error);
        res.status(500).json({ error: 'Failed to submit clue' });
    }
});

app.post('/vote', (req, res) => {
    try {
        const { roomId, playerId, targetPlayerId } = req.body;
        
        if (!roomId || !playerId || !targetPlayerId) {
            return res.status(400).json({ error: 'Room ID, player ID, and target player ID are required' });
        }
        
        const room = submitVoteInRoom(roomId, playerId, targetPlayerId);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found or invalid phase' });
        }
        
        res.json({ success: true });
    } catch (error) {
        console.error('Vote error:', error);
        res.status(500).json({ error: 'Failed to submit vote' });
    }
});

app.post('/new-game', (req, res) => {
    try {
        const { roomId, playerId } = req.body;
        
        if (!roomId || !playerId) {
            return res.status(400).json({ error: 'Room ID and player ID are required' });
        }
        
        const room = getRoom(roomId);
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        const player = room.players.find(p => p.id === playerId);
        if (!player || !player.isHost) {
            return res.status(403).json({ error: 'Only host can start a new game' });
        }
        
        const updatedRoom = resetGameInRoom(roomId);
        
        res.json({ success: true });
    } catch (error) {
        console.error('New game error:', error);
        res.status(500).json({ error: 'Failed to start new game' });
    }
});

app.get('/room/:roomId', (req, res) => {
    try {
        const { roomId } = req.params;
        const room = getRoom(roomId);
        
        if (!room) {
            return res.status(404).json({ error: 'Room not found' });
        }
        
        res.json({
            success: true,
            room: {
                id: room.id,
                players: room.players.map(p => ({
                    id: p.id,
                    name: p.name,
                    isHost: p.isHost,
                    word: p.word,
                    clue: p.clue,
                    vote: p.vote
                })),
                gameStarted: room.gameStarted,
                phase: room.phase,
                currentRound: room.currentRound,
                maxRounds: room.maxRounds,
                votes: room.votes,
                gameEnded: room.gameEnded,
                winner: room.winner,
                imposterId: room.imposterId
            }
        });
    } catch (error) {
        console.error('Get room error:', error);
        res.status(500).json({ error: 'Failed to get room data' });
    }
});

// Clean up old rooms periodically
setInterval(() => {
    const now = Date.now();
    const maxAge = 24 * 60 * 60 * 1000; // 24 hours
    
    for (const [roomId, room] of rooms.entries()) {
        if (now - room.createdAt > maxAge) {
            rooms.delete(roomId);
            console.log(`Cleaned up old room: ${roomId}`);
        }
    }
}, 60 * 60 * 1000); // Run every hour

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Imposter game server running on port ${PORT}`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});

module.exports = app;