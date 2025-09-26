const BACKEND_URL = 'https://imposter-game-server.onrender.com';
let gameState = {
    playerId: null,
    playerName: '',
    roomId: null,
    isHost: false,
    currentPhase: 'lobby',
    currentRound: 1,
    hasVoted: false,
    gameEnded: false,
    pollingInterval: null
};

// Utility Functions
function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(screen => {
        screen.classList.remove('active');
    });
    document.getElementById(screenId).classList.add('active');
}

function showError(message) {
    const errorDiv = document.getElementById('errorDisplay');
    if (errorDiv) {
        errorDiv.textContent = message;
        errorDiv.style.display = 'block';
        setTimeout(() => { errorDiv.style.display = 'none'; }, 5000);
    } else {
        console.error('Error:', message);
        alert(message); // Fallback if errorDisplay element doesn't exist
    }
}

function generatePlayerId() {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
}

// API Functions
async function apiCall(endpoint, method = 'GET', data = null) {
    try {
        const options = { 
            method, 
            headers: { 'Content-Type': 'application/json' },
            timeout: 10000 // 10 second timeout
        };
        if (data) options.body = JSON.stringify(data);
        
        const response = await fetch(`${BACKEND_URL}${endpoint}`, options);
        const result = await response.json();
        
        if (!response.ok) {
            throw new Error(result.error || `Server error: ${response.status}`);
        }
        return result;
    } catch (error) {
        console.error('API Error:', error);
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            showError('Connection failed. Check your internet connection.');
        } else {
            showError(error.message || 'Connection error. Please try again.');
        }
        throw error;
    }
}

// Polling for real-time updates
function startPolling() {
    if (gameState.pollingInterval) {
        clearInterval(gameState.pollingInterval);
    }

    gameState.pollingInterval = setInterval(async () => {
        if (gameState.roomId) {
            try {
                const result = await fetch(`${BACKEND_URL}/room/${gameState.roomId}`);
                if (result.ok) {
                    const data = await result.json();
                    updateUI(data.room);
                } else if (result.status === 404) {
                    showError('Room no longer exists');
                    leaveLobby();
                }
            } catch (error) {
                console.error('Polling error:', error);
                // Don't show error for polling failures, just log them
            }
        }
    }, 2000); // Poll every 2 seconds instead of 1 second
}

function stopPolling() {
    if (gameState.pollingInterval) {
        clearInterval(gameState.pollingInterval);
        gameState.pollingInterval = null;
    }
}

// Main UI Update Function
function updateUI(roomData) {
    if (!roomData) return;
    
    gameState.currentPhase = roomData.phase;
    gameState.currentRound = roomData.currentRound;

    // Update hasVoted state from server
    const currentPlayer = roomData.players.find(p => p.id === gameState.playerId);
    if (currentPlayer) {
        gameState.hasVoted = currentPlayer.hasVoted || false;
    }

    if (roomData.gameStarted) {
        if (!document.getElementById('game').classList.contains('active')) {
            showScreen('game');
        }
        updateGameUI(roomData);
    } else {
        if (!document.getElementById('lobby').classList.contains('active')) {
            showScreen('lobby');
        }
        updateLobbyUI(roomData);
    }
}

// Lobby Functions
function showJoinForm() {
    const joinForm = document.getElementById('joinForm');
    if (joinForm) {
        joinForm.style.display = joinForm.style.display === 'none' ? 'block' : 'none';
    }
}

async function createLobby() {
    const playerNameInput = document.getElementById('playerName');
    if (!playerNameInput) {
        showError('Player name input not found');
        return;
    }
    
    const playerName = playerNameInput.value.trim();
    if (!playerName) { 
        showError('Please enter your name'); 
        return; 
    }

    if (playerName.length > 20) {
        showError('Name must be 20 characters or less');
        return;
    }

    showScreen('loading');

    try {
        gameState.playerId = generatePlayerId();
        gameState.playerName = playerName;

        const result = await apiCall('/create-lobby', 'POST', { 
            playerId: gameState.playerId, 
            playerName 
        });
        
        gameState.roomId = result.roomId;
        gameState.isHost = true;
        
        const displayElement = document.getElementById('displayRoomId');
        if (displayElement) {
            displayElement.textContent = result.roomId;
        }
        
        showScreen('lobby');
        startPolling();
    } catch (error) { 
        showScreen('landing'); 
    }
}

async function joinLobby() {
    const playerNameInput = document.getElementById('playerName');
    const roomIdInput = document.getElementById('roomId');
    
    if (!playerNameInput || !roomIdInput) {
        showError('Required input fields not found');
        return;
    }
    
    const playerName = playerNameInput.value.trim();
    const roomId = roomIdInput.value.trim().toUpperCase();
    
    if (!playerName || !roomId) { 
        showError('Please enter both name and room ID'); 
        return; 
    }

    if (playerName.length > 20) {
        showError('Name must be 20 characters or less');
        return;
    }

    if (roomId.length !== 6) {
        showError('Room ID must be 6 characters');
        return;
    }

    showScreen('loading');
    
    try {
        gameState.playerId = generatePlayerId();
        gameState.playerName = playerName;
        gameState.roomId = roomId;

        await apiCall('/join-lobby', 'POST', { 
            playerId: gameState.playerId, 
            playerName, 
            roomId 
        });
        
        const displayElement = document.getElementById('displayRoomId');
        if (displayElement) {
            displayElement.textContent = roomId;
        }
        
        showScreen('lobby');
        startPolling();
    } catch (error) { 
        showScreen('landing'); 
    }
}

async function startGame() {
    if (!gameState.isHost) return;
    
    try { 
        await apiCall('/start-game', 'POST', { 
            roomId: gameState.roomId, 
            playerId: gameState.playerId 
        }); 
    } catch (error) {
        console.error('Failed to start game:', error);
    }
}

async function leaveLobby() {
    try {
        if (gameState.roomId && gameState.playerId) {
            await apiCall('/leave-lobby', 'POST', { 
                roomId: gameState.roomId, 
                playerId: gameState.playerId 
            });
        }
    } catch (error) {
        console.error('Error leaving lobby:', error);
    }

    // Reset game state
    gameState = {
        playerId: null, 
        playerName: '', 
        roomId: null,
        isHost: false, 
        currentPhase: 'lobby', 
        currentRound: 1,
        hasVoted: false, 
        gameEnded: false, 
        pollingInterval: null
    };

    // Clear form inputs
    const playerNameInput = document.getElementById('playerName');
    const roomIdInput = document.getElementById('roomId');
    const joinForm = document.getElementById('joinForm');
    
    if (playerNameInput) playerNameInput.value = '';
    if (roomIdInput) roomIdInput.value = '';
    if (joinForm) joinForm.style.display = 'none';
    
    showScreen('landing');
    stopPolling();
}

// Game Functions
async function submitClue() {
    const clueInput = document.getElementById('clueInput');
    if (!clueInput) {
        showError('Clue input not found');
        return;
    }
    
    const clue = clueInput.value.trim();
    if (!clue) { 
        showError('Please enter a clue'); 
        return; 
    }

    if (clue.length > 100) {
        showError('Clue must be 100 characters or less');
        return;
    }

    try {
        await apiCall('/submit-clue', 'POST', { 
            roomId: gameState.roomId, 
            playerId: gameState.playerId, 
            clue 
        });
        
        // Update UI
        clueInput.disabled = true;
        const submitBtn = document.getElementById('submitClueBtn');
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.textContent = 'Clue Submitted!';
        }
    } catch (error) {
        console.error('Failed to submit clue:', error);
    }
}

async function vote(targetPlayerId) {
    if (gameState.hasVoted) {
        showError('You have already voted');
        return;
    }
    
    try {
        await apiCall('/vote', 'POST', { 
            roomId: gameState.roomId, 
            playerId: gameState.playerId, 
            targetPlayerId 
        });
        
        gameState.hasVoted = true;
        updateVoteButtons(targetPlayerId);
    } catch (error) {
        console.error('Failed to vote:', error);
    }
}

async function newGame() {
    if (!gameState.isHost) return;
    
    try {
        await apiCall('/new-game', 'POST', { 
            roomId: gameState.roomId, 
            playerId: gameState.playerId 
        });
        
        // Reset local state
        gameState.currentPhase = 'lobby';
        gameState.currentRound = 1;
        gameState.hasVoted = false;
        gameState.gameEnded = false;
    } catch (error) {
        console.error('Failed to start new game:', error);
    }
}

// Manual Phase Advance
async function advancePhase() {
    if (!gameState.isHost || !gameState.roomId) {
        showError('Only the host can advance the phase');
        return;
    }

    try {
        await apiCall('/advance-phase', 'POST', { 
            roomId: gameState.roomId, 
            playerId: gameState.playerId 
        });
    } catch (error) {
        showError('Failed to advance phase.');
        console.error('Phase advance error:', error);
    }
}

// UI Update Functions
function updateLobbyUI(lobbyData) {
    const playersList = document.getElementById('playersList');
    const playerCount = document.getElementById('playerCount');
    const startGameBtn = document.getElementById('startGameBtn');
    const lobbyStatus = document.getElementById('lobbyStatus');

    if (playersList) {
        playersList.innerHTML = '';
        lobbyData.players.forEach(player => {
            const playerDiv = document.createElement('div');
            playerDiv.className = 'player-item';
            playerDiv.innerHTML = `${escapeHtml(player.name)} ${player.isHost ? '👑' : ''} ${player.id === gameState.playerId ? ' (You)' : ''}`;
            playersList.appendChild(playerDiv);
        });
    }

    if (playerCount) {
        playerCount.textContent = lobbyData.players.length;
    }

    if (startGameBtn) {
        if (gameState.isHost) {
            startGameBtn.style.display = 'inline-block';
            startGameBtn.disabled = lobbyData.players.length < 3;
            startGameBtn.textContent = lobbyData.players.length < 3 ? 
                `🚀 Need ${3 - lobbyData.players.length} More Players` : '🚀 Start Game';
        } else {
            startGameBtn.style.display = 'none';
        }
    }

    if (lobbyStatus) {
        if (lobbyData.players.length < 3) {
            lobbyStatus.textContent = `Need ${3 - lobbyData.players.length} more players to start`;
        } else {
            lobbyStatus.textContent = gameState.isHost ? 
                'Ready to start! Click the start button.' : 
                'Waiting for host to start the game...';
        }
    }
}

function updateGameUI(gameData) {
    const currentRoundEl = document.getElementById('currentRound');
    const gamePhaseEl = document.getElementById('gamePhase');
    const gamePlayersEl = document.getElementById('gamePlayers');
    
    if (currentRoundEl) currentRoundEl.textContent = gameData.currentRound;
    if (gamePhaseEl) gamePhaseEl.textContent = capitalizeFirst(gameData.phase);
    if (gamePlayersEl) gamePlayersEl.textContent = gameData.players.length;

    // Add host controls for phase advancement
    updateHostControls(gameData);

    switch (gameData.phase) {
        case 'words': 
            showWordPhase(gameData); 
            break;
        case 'clues': 
            showCluePhase(gameData); 
            break;
        case 'voting': 
            showVotingPhase(gameData); 
            break;
        case 'results': 
            showResultsPhase(gameData); 
            break;
        case 'gameOver': 
            showGameOverPhase(gameData); 
            break;
    }
}

function updateHostControls(gameData) {
    let hostControls = document.getElementById('hostControls');
    
    if (!hostControls) {
        hostControls = document.createElement('div');
        hostControls.id = 'hostControls';
        hostControls.style.marginTop = '20px';
        const gameScreen = document.getElementById('game');
        if (gameScreen) gameScreen.appendChild(hostControls);
    }
    
    if (gameState.isHost) {
        let phaseAdvanceBtn = document.getElementById('advancePhaseBtn');
        if (!phaseAdvanceBtn) {
            phaseAdvanceBtn = document.createElement('button');
            phaseAdvanceBtn.id = 'advancePhaseBtn';
            phaseAdvanceBtn.onclick = advancePhase;
            hostControls.appendChild(phaseAdvanceBtn);
        }
        
        const nextPhase = getNextPhase(gameData.phase);
        phaseAdvanceBtn.textContent = `Host: Advance to ${nextPhase}`;
        phaseAdvanceBtn.style.display = 'inline-block';
    } else {
        hostControls.style.display = 'none';
    }
}

function getNextPhase(currentPhase) {
    const phases = {
        'words': 'Clues',
        'clues': 'Voting', 
        'voting': 'Results',
        'results': 'Next Round',
        'gameOver': 'Game Over'
    };
    return phases[currentPhase] || 'Next Phase';
}

// Word Phase
function showWordPhase(gameData) {
    const sections = {
        word: document.getElementById('wordSection'),
        clue: document.getElementById('clueSection'),
        voting: document.getElementById('votingSection'),
        results: document.getElementById('resultsSection'),
        gameOver: document.getElementById('gameOverSection')
    };

    if (sections.word) sections.word.style.display = 'block';
    if (sections.clue) sections.clue.style.display = 'block';
    if (sections.voting) sections.voting.style.display = 'none';
    if (sections.results) sections.results.style.display = 'none';
    if (sections.gameOver) sections.gameOver.style.display = 'none';

    const playerData = gameData.players.find(p => p.id === gameState.playerId);
    const playerWordEl = document.getElementById('playerWord');
    
    if (playerData && playerData.word && playerWordEl) {
        playerWordEl.textContent = playerData.word.toUpperCase();
    }
    
    // Reset clue input for new round
    const clueInput = document.getElementById('clueInput');
    const submitBtn = document.getElementById('submitClueBtn');
    
    if (clueInput && submitBtn) {
        clueInput.disabled = false;
        clueInput.value = '';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Submit Clue';
    }
}

// Clue Phase
function showCluePhase(gameData) {
    const sections = {
        word: document.getElementById('wordSection'),
        clue: document.getElementById('clueSection'),
        voting: document.getElementById('votingSection'),
        results: document.getElementById('resultsSection'),
        gameOver: document.getElementById('gameOverSection')
    };

    if (sections.word) sections.word.style.display = 'block';
    if (sections.clue) sections.clue.style.display = 'block';
    if (sections.voting) sections.voting.style.display = 'none';
    if (sections.results) sections.results.style.display = 'none';
    if (sections.gameOver) sections.gameOver.style.display = 'none';

    const submitBtn = document.getElementById('submitClueBtn');
    const clueInput = document.getElementById('clueInput');

    const playerData = gameData.players.find(p => p.id === gameState.playerId);
    if (playerData && submitBtn && clueInput) {
        if (!playerData.clue) { 
            submitBtn.disabled = false; 
            submitBtn.textContent = 'Submit Clue'; 
            clueInput.disabled = false; 
            clueInput.value = ''; 
        } else { 
            submitBtn.disabled = true; 
            submitBtn.textContent = 'Clue Submitted!'; 
            clueInput.disabled = true; 
            clueInput.value = playerData.clue; 
        }
    }

    const cluesList = document.getElementById('cluesList');
    if (cluesList) {
        cluesList.innerHTML = '';
        const playersWithClues = gameData.players.filter(player => player.clue);
        
        if (playersWithClues.length === 0) {
            cluesList.innerHTML = '<p style="text-align: center; color: #666;">Waiting for players to submit clues...</p>';
        } else {
            playersWithClues.forEach(player => {
                const clueDiv = document.createElement('div');
                clueDiv.className = 'clue-item';
                clueDiv.innerHTML = `<div class="clue-author">${escapeHtml(player.name)}</div><div>"${escapeHtml(player.clue)}"</div>`;
                cluesList.appendChild(clueDiv);
            });
        }
    }
}

// Voting Phase
function showVotingPhase(gameData) {
    const sections = {
        word: document.getElementById('wordSection'),
        clue: document.getElementById('clueSection'),
        voting: document.getElementById('votingSection'),
        results: document.getElementById('resultsSection'),
        gameOver: document.getElementById('gameOverSection')
    };

    if (sections.word) sections.word.style.display = 'block';
    if (sections.clue) sections.clue.style.display = 'block';
    if (sections.voting) sections.voting.style.display = 'block';
    if (sections.results) sections.results.style.display = 'none';
    if (sections.gameOver) sections.gameOver.style.display = 'none';

    // Disable clue submission
    const submitBtn = document.getElementById('submitClueBtn');
    const clueInput = document.getElementById('clueInput');
    if (submitBtn) submitBtn.disabled = true;
    if (clueInput) clueInput.disabled = true;

    const voteButtons = document.getElementById('voteButtons');
    if (voteButtons) {
        voteButtons.innerHTML = '';
        
        gameData.players.forEach(player => {
            if (player.id !== gameState.playerId) {
                const button = document.createElement('button');
                button.className = 'vote-btn';
                button.textContent = escapeHtml(player.name);
                button.disabled = gameState.hasVoted;
                
                if (gameState.hasVoted) {
                    button.classList.add('disabled');
                } else {
                    button.onclick = () => vote(player.id);
                }
                
                voteButtons.appendChild(button);
            }
        });
        
        if (gameState.hasVoted) {
            const statusDiv = document.createElement('div');
            statusDiv.style.textAlign = 'center';
            statusDiv.style.marginTop = '10px';
            statusDiv.style.color = '#666';
            statusDiv.textContent = 'You have voted. Waiting for other players...';
            voteButtons.appendChild(statusDiv);
        }
    }
}

// Results Phase
function showResultsPhase(gameData) {
    const sections = {
        word: document.getElementById('wordSection'),
        clue: document.getElementById('clueSection'),
        voting: document.getElementById('votingSection'),
        results: document.getElementById('resultsSection'),
        gameOver: document.getElementById('gameOverSection')
    };

    if (sections.word) sections.word.style.display = 'block';
    if (sections.clue) sections.clue.style.display = 'block';
    if (sections.voting) sections.voting.style.display = 'none';
    if (sections.results) sections.results.style.display = 'block';
    if (sections.gameOver) sections.gameOver.style.display = 'none';

    const voteResults = document.getElementById('voteResults');
    const roundResult = document.getElementById('roundResult');
    
    if (voteResults) {
        voteResults.innerHTML = '';

        if (Object.keys(gameData.votes).length === 0) {
            voteResults.innerHTML = '<p style="text-align: center; color: #666;">No votes were cast.</p>';
        } else {
            Object.entries(gameData.votes).forEach(([playerId, count]) => {
                const player = gameData.players.find(p => p.id === playerId);
                if (player) {
                    const resultDiv = document.createElement('div');
                    resultDiv.className = 'vote-result';
                    resultDiv.textContent = `${escapeHtml(player.name)}: ${count} vote(s)`;
                    voteResults.appendChild(resultDiv);
                }
            });
        }
    }

    if (roundResult) {
        let mostVotedPlayer = null;
        let maxVotes = 0;
        Object.entries(gameData.votes).forEach(([playerId, count]) => {
            if (count > maxVotes) { 
                maxVotes = count; 
                mostVotedPlayer = gameData.players.find(p => p.id === playerId); 
            }
        });

        const imposterPlayer = gameData.players.find(p => p.id === gameData.imposterId);
        const imposterCaught = mostVotedPlayer && mostVotedPlayer.id === gameData.imposterId;

        let resultText = '';
        if (maxVotes === 0) {
            resultText = '😐 No one was voted out';
        } else if (imposterCaught) {
            resultText = `🎉 Imposter FOUND! ${escapeHtml(mostVotedPlayer.name)} was the imposter!`;
        } else {
            resultText = `😈 Imposter NOT found. ${escapeHtml(mostVotedPlayer.name)} was innocent.`;
        }
        
        if (gameData.currentRound < 3 && !imposterCaught) {
            resultText += `<br>Moving to Round ${gameData.currentRound + 1}...`;
        }

        roundResult.innerHTML = `<div class="round-result ${imposterCaught ? 'imposter-caught' : 'imposter-not-caught'}">
            ${resultText}
        </div>`;
    }
}

// Game Over Phase
function showGameOverPhase(gameData) {
    const sections = {
        word: document.getElementById('wordSection'),
        clue: document.getElementById('clueSection'),
        voting: document.getElementById('votingSection'),
        results: document.getElementById('resultsSection'),
        gameOver: document.getElementById('gameOverSection')
    };

    if (sections.word) sections.word.style.display = 'block';
    if (sections.clue) sections.clue.style.display = 'block';
    if (sections.voting) sections.voting.style.display = 'none';
    if (sections.results) sections.results.style.display = 'block';
    if (sections.gameOver) sections.gameOver.style.display = 'block';

    // Show final results
    showResultsPhase(gameData);

    const gameWinner = document.getElementById('gameWinner');
    const newGameBtn = document.getElementById('newGameBtn');
    const imposterPlayer = gameData.players.find(p => p.id === gameData.imposterId);

    if (gameWinner) {
        if (gameData.winner === 'civilians') {
            gameWinner.className = 'winner-announcement';
            gameWinner.innerHTML = `🏆 CIVILIANS WIN! 🏆<br>The imposter ${imposterPlayer ? escapeHtml(imposterPlayer.name) : 'Unknown'} was caught!`;
        } else {
            gameWinner.className = 'winner-announcement imposter-wins';
            gameWinner.innerHTML = `😈 IMPOSTER WINS! 😈<br>${imposterPlayer ? escapeHtml(imposterPlayer.name) : 'The imposter'} survived all 3 rounds!`;
        }
    }

    if (newGameBtn) {
        if (gameState.isHost) {
            newGameBtn.style.display = 'inline-block';
        } else {
            newGameBtn.style.display = 'none';
        }
    }

    gameState.gameEnded = true;
}

function updateVoteButtons(votedPlayerId) {
    const buttons = document.querySelectorAll('.vote-btn');
    buttons.forEach(button => {
        button.disabled = true;
        const buttonText = button.textContent;
        
        // Find which player this button is for
        const targetPlayer = gameState.roomData?.players?.find(p => 
            p.id !== gameState.playerId && buttonText.includes(p.name)
        );
        
        if (targetPlayer && targetPlayer.id === votedPlayerId) {
            button.classList.add('voted');
            button.textContent += ' ✓';
        }
    });
}

function capitalizeFirst(str) {
    if (!str) return '';
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Browser navigation
window.addEventListener('beforeunload', () => { 
    if (gameState.roomId) leaveLobby(); 
});

// Enter key handling
document.addEventListener('DOMContentLoaded', () => {
    const playerNameInput = document.getElementById('playerName');
    const roomIdInput = document.getElementById('roomId');
    const clueInput = document.getElementById('clueInput');
    
    if (playerNameInput) {
        playerNameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') { 
                const joinForm = document.getElementById('joinForm');
                if (!joinForm || joinForm.style.display === 'none') {
                    createLobby(); 
                }
            }
        });
    }
    
    if (roomIdInput) {
        roomIdInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') joinLobby(); 
        });
    }
    
    if (clueInput) {
        clueInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter') submitClue(); 
        });
    }
});

// Add error handling for missing DOM elements
function safeGetElement(id) {
    const element = document.getElementById(id);
    if (!element) {
        console.warn(`Element with id '${id}' not found`);
    }
    return element;
}

console.log('🎭 Imposter Game Client Loaded');
console.log('Backend URL:', BACKEND_URL);