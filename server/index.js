const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

const players = new Map();
let gameState = 'WAITING'; // WAITING, PREPARING, COUNTDOWN, PLAYING, FINISHED
let countdownTimer = null;
let musicStartTime = null;
let selectedSong = 'Homecoming.mp3'; // Default

const MAX_LAPS = 3;
const FINISH_GRACE_MS = 10_000;
let finishDeadline = null;
let finishTimeout = null;

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
  // FIND FIRST AVAILABLE SPAWN INDEX
  const usedIndices = new Set();
  players.forEach(p => usedIndices.add(p.spawnIndex));
  let spawnIndex = 0;
  while (usedIndices.has(spawnIndex)) {
    spawnIndex++;
  }

  players.set(id, {
    id,
    username: `Racer_${id.substr(0, 4)}`,
    model: 'mercedes.glb',
    color: Math.floor(Math.random() * 16777215),
    isReady: false,
    assetsReady: false,
    spawnIndex, // Store spawn index
    vote: null,
    x: 0, y: 0, z: 0,
    qx: 0, qy: 0, qz: 0, qw: 1,
    velocity: 0,
    lap: 0,
    lapTimes: [],
    bestLap: null,
    totalTime: 0,
    finished: false,
    finishTime: null,
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
    songs: AVAILABLE_SONGS,
    maxLaps: MAX_LAPS
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
          // force re-confirmation of asset load after toggling ready
          player.assetsReady = false;
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

        case 'assets_ready':
          player.assetsReady = true;
          checkAssetsReady();
          break;

        case 'lap_update':
          if (gameState === 'PLAYING') {
            handleLapUpdate(player, data);
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
    assetsReady: p.assetsReady,
    spawnIndex: p.spawnIndex, // Send spawn index to clients
    vote: p.vote,
    x: p.x, y: p.y, z: p.z,
    qx: p.qx, qy: p.qy, qz: p.qz, qw: p.qw,
    velocity: p.velocity,
    lap: p.lap,
    lapTimes: p.lapTimes,
    bestLap: p.bestLap,
    totalTime: p.totalTime,
    finished: p.finished,
    finishTime: p.finishTime
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
    startPreparation();
  }
}

function checkGameStop() {
  if (players.size < 2 && gameState !== 'WAITING') {
    console.log('Not enough players, resetting...');
    gameState = 'WAITING';
    musicStartTime = null;
    if (countdownTimer) clearTimeout(countdownTimer);
    if (finishTimeout) clearTimeout(finishTimeout);
    finishTimeout = null;
    finishDeadline = null;

    // Reset ready status
    players.forEach(p => {
      p.isReady = false;
      p.assetsReady = false;
      p.lap = 0;
      p.lapTimes = [];
      p.bestLap = null;
      p.totalTime = 0;
      p.finished = false;
      p.finishTime = null;
    });

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

function startPreparation() {
  if (gameState !== 'WAITING') return;
  gameState = 'PREPARING';

  selectedSong = determineSong();
  finishDeadline = null;
  if (finishTimeout) clearTimeout(finishTimeout);
  finishTimeout = null;

  players.forEach(p => {
    p.assetsReady = false;
    p.lap = 0;
    p.lapTimes = [];
    p.bestLap = null;
    p.totalTime = 0;
    p.finished = false;
    p.finishTime = null;
  });

  broadcast({
    type: 'prepare_race',
    selectedSong,
    maxLaps: MAX_LAPS
  });
}

function checkAssetsReady() {
  if (gameState !== 'PREPARING') return;
  const everyoneReady = Array.from(players.values()).every(p => p.isReady && p.assetsReady);
  if (everyoneReady) {
    startCountdown();
  }
}

function startCountdown() {
  if (gameState === 'COUNTDOWN') return;
  gameState = 'COUNTDOWN';

  // if somehow preparing was skipped, pick song here
  if (!selectedSong) selectedSong = determineSong();
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

  finishDeadline = null;
  if (finishTimeout) clearTimeout(finishTimeout);
  finishTimeout = null;

  broadcast({
    type: 'game_start',
    musicStartTime,
    selectedSong,
    maxLaps: MAX_LAPS
  });
}

function handleLapUpdate(player, data) {
  const { lap, lapTime, totalTime } = data;
  if (typeof lap !== 'number' || lap <= player.lap) return;

  player.lap = lap;
  if (typeof lapTime === 'number') {
    player.lapTimes[lap - 1] = lapTime;
  }
  if (typeof totalTime === 'number') {
    player.totalTime = totalTime;
  }

  // compute best lap
  player.bestLap = player.lapTimes.reduce((best, t) => {
    if (typeof t !== 'number') return best;
    if (best === null || t < best) return t;
    return best;
  }, null);

  broadcast({
    type: 'lap_update',
    player: {
      id: player.id,
      lap: player.lap,
      lapTime,
      totalTime: player.totalTime,
      bestLap: player.bestLap,
      finished: player.finished
    }
  });

  if (player.lap >= MAX_LAPS && !player.finished) {
    player.finished = true;
    player.finishTime = Date.now();
    checkFinishConditions(player.id);
  }
}

function checkFinishConditions(triggeredBy) {
  const everyoneDone = Array.from(players.values()).every(p => p.finished || p.lap >= MAX_LAPS);
  if (everyoneDone) {
    endRace();
    return;
  }

  if (finishTimeout) return;
  finishDeadline = Date.now() + FINISH_GRACE_MS;
  finishTimeout = setTimeout(() => endRace(), FINISH_GRACE_MS);

  broadcast({
    type: 'finish_timer',
    endsAt: finishDeadline,
    triggeredBy
  });
}

function endRace() {
  if (gameState === 'FINISHED') return;
  gameState = 'FINISHED';
  if (countdownTimer) clearTimeout(countdownTimer);
  countdownTimer = null;

  const results = getPublicPlayerList().map(p => ({
    id: p.id,
    username: p.username,
    model: p.model,
    color: p.color,
    lap: p.lap,
    lapTimes: p.lapTimes,
    bestLap: p.bestLap,
    totalTime: p.totalTime,
    finished: p.finished
  }));

  broadcast({
    type: 'race_over',
    results,
    endsAt: finishDeadline
  });

  finishDeadline = null;
  if (finishTimeout) clearTimeout(finishTimeout);
  finishTimeout = null;

  // reset lobby state for next round
  gameState = 'WAITING';
  musicStartTime = null;
  players.forEach(p => {
    p.isReady = false;
    p.assetsReady = false;
  });
  broadcastLobbyUpdate();
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
