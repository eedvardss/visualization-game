export class Network {
    constructor() {
        this.socket = null;
        this.id = null;
        this.color = null;
        this.players = new Map();

        // Callbacks
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onGameStateChange = null; // New
        this.onCountdown = null; // New
        this.onInit = null;
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:8081');

        this.socket.onopen = () => {
            console.log('Connected to server');
            document.getElementById('status').innerText = 'Connected';
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'init':
                    this.id = data.id;
                    this.color = data.color;
                    data.players.forEach(p => {
                        if (p.id !== this.id) {
                            this.players.set(p.id, p);
                            if (this.onPlayerJoined) this.onPlayerJoined(p);
                        }
                    });
                    if (this.onGameStateChange) this.onGameStateChange(data.gameState, data.musicStartTime);
                    if (this.onInit) this.onInit();
                    break;

                case 'player_joined':
                    if (data.player.id !== this.id) {
                        this.players.set(data.player.id, data.player);
                        if (this.onPlayerJoined) this.onPlayerJoined(data.player);
                    }
                    break;

                case 'player_left':
                    this.players.delete(data.id);
                    if (this.onPlayerLeft) this.onPlayerLeft(data.id);
                    break;

                case 'state':
                    data.players.forEach(p => {
                        if (p.id !== this.id) {
                            const existing = this.players.get(p.id);
                            if (existing) {
                                existing.x = p.x;
                                existing.y = p.y;
                                existing.z = p.z;
                                existing.targetX = p.x;
                                existing.targetY = p.y;
                                existing.targetZ = p.z;
                                existing.qx = p.qx;
                                existing.qy = p.qy;
                                existing.qz = p.qz;
                                existing.qw = p.qw;
                                existing.velocity = p.velocity;
                            }
                        }
                    });
                    break;

                case 'countdown_start':
                    if (this.onCountdown) this.onCountdown(data.duration);
                    break;

                case 'game_start':
                    if (this.onGameStateChange) this.onGameStateChange('PLAYING', data.musicStartTime);
                    break;

                case 'game_reset':
                    if (this.onGameStateChange) this.onGameStateChange('WAITING', null);
                    alert(data.message);
                    break;
            }
        };
    }

    sendUpdate(state) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify({
                type: 'update',
                ...state
            }));
        }
    }
}
