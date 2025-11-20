const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

const players = new Map();
let gameState = 'WAITING'; // WAITING, COUNTDOWN, PLAYING
let countdownTimer = null;
let musicStartTime = null;
let selectedSong = 'Homecoming.mp3'; // Default

// Song options available
const AVAILABLE_SONGS = [
  'Homecoming.mp3',
  'Children.mp3',
  'killing_me_softly.mp3',
  'like_a_prayer.mp3',
  'move_your_body.mp3'
];

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);

  console.log(`Player connected: ${id}`);

  // Initialize player state
  players.set(id, {
    id,
    username: `Racer_${id.substr(0, 4)}`,
    model: 'mercedes.glb',
    color: Math.floor(Math.random() * 16777215),
    isReady: false,
    vote: null,
    x: 0, y: 0, z: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    velocity: 0,
    ws: ws
  });

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    id,
    players: getPublicPlayerList(),
    gameState,
    musicStartTime,
    selectedSong,
    songs: AVAILABLE_SONGS
  }));

  broadcastLobbyUpdate();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      const player = players.get(id);
      if (!player) return;

      switch (data.type) {
        case 'join_lobby':
          player.username = data.username || player.username;
          player.model = data.model || player.model;
          // Reset ready status on re-join/update
          player.isReady = false;
          broadcastLobbyUpdate();
          break;

        case 'vote_song':
          if (AVAILABLE_SONGS.includes(data.song)) {
            player.vote = data.song;
            broadcastLobbyUpdate();
          }
          break;

        case 'player_ready':
          player.isReady = data.isReady;
          broadcastLobbyUpdate();
          checkGameStart();
          break;

        case 'update':
          if (gameState === 'PLAYING') {
            Object.assign(player, {
              x: data.x, y: data.y, z: data.z,
              qx: data.qx, qy: data.qy, qz: data.qz, qw: data.qw,
              velocity: data.velocity
            });
          }
          break;
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${id}`);
    players.delete(id);
    broadcast({ type: 'player_left', id });
    broadcastLobbyUpdate();
    checkGameStop();
  });
});

function getPublicPlayerList() {
  return Array.from(players.values()).map(p => ({
    id: p.id,
    username: p.username,
    model: p.model,
    color: p.color,
    isReady: p.isReady,
    vote: p.vote,
    x: p.x, y: p.y, z: p.z,
    qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
    velocity: p.velocity
  }));
}

function broadcastLobbyUpdate() {
  const playerList = getPublicPlayerList();

  // Calculate votes
  const votes = {};
  AVAILABLE_SONGS.forEach(s => votes[s] = 0);
  playerList.forEach(p => {
    if (p.vote && votes[p.vote] !== undefined) votes[p.vote]++;
  });

  broadcast({
    type: 'lobby_update',
    players: playerList,
    votes
  });
}

function checkGameStart() {
  if (gameState !== 'WAITING') return;
  if (players.size < 2) return;

  const allReady = Array.from(players.values()).every(p => p.isReady);

  if (allReady) {
    startCountdown();
  }
}

function checkGameStop() {
  if (players.size < 2 && gameState !== 'WAITING') {
    console.log('Not enough players, resetting...');
    gameState = 'WAITING';
    musicStartTime = null;
    if (countdownTimer) clearTimeout(countdownTimer);

    // Reset ready status
    players.forEach(p => p.isReady = false);

    broadcast({
      type: 'game_reset',
      message: 'Not enough players!'
    });
    broadcastLobbyUpdate();
  }
}

function determineSong() {
  const votes = {};
  AVAILABLE_SONGS.forEach(s => votes[s] = 0);
  players.forEach(p => {
    if (p.vote && votes[p.vote] !== undefined) votes[p.vote]++;
  });

  let winner = AVAILABLE_SONGS[0];
  let maxVotes = -1;

  for (const [song, count] of Object.entries(votes)) {
    if (count > maxVotes) {
      maxVotes = count;
      winner = song;
    }
  }
  return winner;
}

function startCountdown() {
  if (gameState === 'COUNTDOWN') return;
  gameState = 'COUNTDOWN';

  selectedSong = determineSong();
  console.log(`Starting countdown... Selected song: ${selectedSong}`);

  broadcast({
    type: 'countdown_start',
    duration: 3,
    selectedSong
  });

  countdownTimer = setTimeout(() => {
    startGame();
  }, 3000);
}

function startGame() {
  gameState = 'PLAYING';
  musicStartTime = Date.now() + 1000;
  console.log('Game started!');

  broadcast({
    type: 'game_start',
    musicStartTime,
    selectedSong
  });
}

function broadcast(data, excludeWs) {
  const message = JSON.stringify(data);
  wss.clients.forEach((client) => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// High frequency position updates
setInterval(() => {
  if (gameState === 'PLAYING') {
    const state = getPublicPlayerList();
    const message = JSON.stringify({ type: 'state', players: state });
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) client.send(message);
    });
  }
}, 50);

console.log('WebSocket server running on port 8081');
