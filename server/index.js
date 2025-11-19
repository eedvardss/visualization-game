const WebSocket = require('ws');

const wss = new WebSocket.Server({ port: 8081 });

const players = new Map();
let gameState = 'WAITING'; // WAITING, COUNTDOWN, PLAYING
let countdownTimer = null;
let musicStartTime = null;

wss.on('connection', (ws) => {
  const id = Math.random().toString(36).substr(2, 9);
  const color = Math.floor(Math.random() * 16777215);

  console.log(`Player connected: ${id}`);

  // Initialize player state
  players.set(id, {
    id,
    color,
    x: 0,
    y: 0,
    z: 0,
    rotation: 0,
    velocity: 0,
    ws: ws
  });

  // Send initial state
  ws.send(JSON.stringify({
    type: 'init',
    id,
    color,
    players: Array.from(players.values()).map(p => ({ ...p, ws: undefined })),
    gameState,
    musicStartTime
  }));

  broadcast({
    type: 'player_joined',
    player: { ...players.get(id), ws: undefined }
  }, ws);

  checkGameStart();

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'update') {
        const player = players.get(id);
        if (player) {
          Object.assign(player, {
            x: data.x, y: data.y, z: data.z,
            qx: data.qx, qy: data.qy, qz: data.qz, qw: data.qw,
            velocity: data.velocity
          });
        }
      }
    } catch (e) { console.error(e); }
  });

  ws.on('close', () => {
    console.log(`Player disconnected: ${id}`);
    players.delete(id);
    broadcast({ type: 'player_left', id });
    checkGameStop();
  });
});

function checkGameStart() {
  if (gameState === 'WAITING' && players.size >= 2) {
    startCountdown();
  }
}

function checkGameStop() {
  if (players.size < 2 && gameState !== 'WAITING') {
    console.log('Not enough players, resetting...');
    gameState = 'WAITING';
    musicStartTime = null;
    if (countdownTimer) clearTimeout(countdownTimer);

    broadcast({
      type: 'game_reset',
      message: 'Not enough players!'
    });
  }
}

function startCountdown() {
  if (gameState === 'COUNTDOWN') return; // Already counting
  gameState = 'COUNTDOWN';
  console.log('Starting countdown...');

  broadcast({
    type: 'countdown_start',
    duration: 3
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
    musicStartTime
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

setInterval(() => {
  const state = Array.from(players.values()).map(p => ({ ...p, ws: undefined }));
  const message = JSON.stringify({ type: 'state', players: state });
  wss.clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) client.send(message);
  });
}, 50);

console.log('WebSocket server running on port 8081');
