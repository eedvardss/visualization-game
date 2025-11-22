export class Network {
    constructor() {
        this.socket = null;
        this.id = null;
        this.color = null;
        this.players = new Map();
        this.songs = [];
        this.selectedSong = null;
        this.maxLaps = 3;

        // Callbacks
        this.onPlayerJoined = null;
        this.onPlayerLeft = null;
        this.onGameStateChange = null;
        this.onCountdown = null;
        this.onInit = null;
        this.onLobbyUpdate = null; // New
        this.onPrepareRace = null;
        this.onLapUpdate = null;
        this.onFinishTimer = null;
        this.onRaceOver = null;
    }

    connect() {
        this.socket = new WebSocket('ws://localhost:8081');

        this.socket.onopen = () => {
            console.log('Connected to server');
            const statusEl = document.getElementById('status');
            if (statusEl) statusEl.innerText = 'Connected';
        };

        this.socket.onmessage = (event) => {
            const data = JSON.parse(event.data);

            switch (data.type) {
                case 'init':
                    this.id = data.id;
                    this.songs = data.songs;
                    this.selectedSong = data.selectedSong;
                    this.maxLaps = data.maxLaps || this.maxLaps;
                    this.updatePlayers(data.players);

                    if (this.onGameStateChange) this.onGameStateChange(data.gameState, data.musicStartTime);
                    if (this.onInit) this.onInit(data);
                    break;

                case 'player_joined':
                    this.updatePlayers([data.player]);
                    break;

                case 'player_left':
                    this.players.delete(data.id);
                    if (this.onPlayerLeft) this.onPlayerLeft(data.id);
                    break;

                case 'lobby_update':
                    this.updatePlayers(data.players);
                    if (this.onLobbyUpdate) this.onLobbyUpdate(data.players, data.votes);
                    break;

                case 'prepare_race':
                    this.selectedSong = data.selectedSong;
                    this.maxLaps = data.maxLaps || this.maxLaps;
                    if (this.onPrepareRace) this.onPrepareRace(data);
                    break;

                case 'state':
                    this.updatePlayers(data.players);
                    break;

                case 'countdown_start':
                    this.selectedSong = data.selectedSong;
                    if (this.onCountdown) this.onCountdown(data.duration, data.selectedSong);
                    break;

                case 'game_start':
                    this.selectedSong = data.selectedSong;
                    this.maxLaps = data.maxLaps || this.maxLaps;
                    if (this.onGameStateChange) this.onGameStateChange('PLAYING', data.musicStartTime);
                    break;

                case 'lap_update':
                    if (data.player) {
                        this.updatePlayers([data.player]);
                        if (this.onLapUpdate) this.onLapUpdate(data.player);
                    }
                    break;

                case 'finish_timer':
                    if (this.onFinishTimer) this.onFinishTimer(data.endsAt, data.triggeredBy);
                    break;

                case 'race_over':
                    if (this.onRaceOver) this.onRaceOver(data.results, data.endsAt);
                    break;

                case 'game_reset':
                    if (this.onGameStateChange) this.onGameStateChange('WAITING', null);
                    alert(data.message);
                    break;
            }
        };
    }

    updatePlayers(playerList) {
        playerList.forEach(p => {
            if (p.id !== this.id) {
                const existing = this.players.get(p.id);
                if (existing) {
                    Object.assign(existing, p);
                } else {
                    this.players.set(p.id, p);
                    if (this.onPlayerJoined) this.onPlayerJoined(p);
                }
            } else {
                // Update self data in map (critical for spawnIndex sync)
                const existing = this.players.get(p.id);
                if (existing) {
                    Object.assign(existing, p);
                } else {
                    this.players.set(p.id, p);
                }
            }
        });
    }

    sendJoinLobby(username, model) {
        this.send({ type: 'join_lobby', username, model });
    }

    sendVote(song) {
        this.send({ type: 'vote_song', song });
    }

    sendReady(isReady) {
        this.send({ type: 'player_ready', isReady });
    }

    sendAssetsReady() {
        this.send({ type: 'assets_ready' });
    }

    sendLapUpdate(lap, lapTime, totalTime) {
        this.send({ type: 'lap_update', lap, lapTime, totalTime });
    }

    sendUpdate(state) {
        this.send({ type: 'update', ...state });
    }

    send(msg) {
        if (this.socket && this.socket.readyState === WebSocket.OPEN) {
            this.socket.send(JSON.stringify(msg));
        }
    }
}
