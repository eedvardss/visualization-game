import { DEFAULT_SONG, SONG_ORDER, getSongDisplayName } from '../utils/songCatalog.js';

const CAR_OPTIONS = [
    {
        model: 'mercedes.glb',
        label: 'Mercedes 190', // Shortened for cleaner UI
        image: '/assets/cars/mercedes-190.png'
    },
    {
        model: 'Volvo XC60.glb',
        label: 'Volvo XC60',
        image: '/assets/cars/volvo-xc60.png'
    }
];

export class LobbyUI {
    constructor(network, onStartSingleplayer) {
        this.network = network;
        this.onStartSingleplayer = onStartSingleplayer;

        this.state = {
            username: '',
            model: 'mercedes.glb',
            song: DEFAULT_SONG,
            isReady: false,
            songs: [...SONG_ORDER]
        };

        // DOM References
        this.dom = {};

        this._injectStyles();
        this._initDOM();
    }

    // --- 1. THE "SWISS MINIMALIST" STYLE SYSTEM ---
    _injectStyles() {
        const cssId = 'ccr-lobby-styles';
        if (document.getElementById(cssId)) return;

        const style = document.createElement('style');
        style.id = cssId;
        style.textContent = `
            @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;500;800&display=swap');

            :root {
                --glass-surface: rgba(255, 255, 255, 0.65);
                --glass-border: rgba(255, 255, 255, 0.4);
                --surface-hover: rgba(255, 255, 255, 0.8);
                --text-main: #111111;
                --text-sub: #666666;
                --accent: #111111; /* Solid Black for sleekness */
                --accent-hover: #333333;
                --radius-lg: 32px;
                --radius-sm: 12px;
                --shadow-soft: 0 20px 60px rgba(0,0,0,0.1);
            }

            /* Root: Transparent to show the 3D Map */
            #ccr-root {
                position: absolute; top: 0; left: 0; width: 100%; height: 100%;
                font-family: 'Inter', sans-serif;
                color: var(--text-main);
                display: flex; align-items: center; justify-content: center;
                z-index: 20000;
                /* Subtle vignette to focus eye on center, but keep map visible */
                background: radial-gradient(circle, rgba(0,0,0,0) 0%, rgba(0,0,0,0.3) 100%);
            }

            /* Main Frosted Card */
            .ccr-panel {
                position: relative;
                width: min(480px, 90%); /* Narrower, mobile-app feel */
                max-height: 90vh;
                overflow-y: auto;
                
                /* The "Apple Vision Pro" Glass Effect */
                background: var(--glass-surface);
                backdrop-filter: blur(40px) saturate(180%);
                -webkit-backdrop-filter: blur(40px) saturate(180%);
                border: 1px solid var(--glass-border);
                
                border-radius: var(--radius-lg);
                padding: 48px;
                box-shadow: var(--shadow-soft);
                display: flex; flex-direction: column; align-items: center;
                animation: driftUp 0.8s cubic-bezier(0.16, 1, 0.3, 1);
            }

            /* Typography */
            .ccr-title {
                font-size: 32px;
                font-weight: 800;
                letter-spacing: -0.05em;
                margin: 0 0 8px 0;
                text-align: center;
                color: var(--text-main);
            }

            .ccr-subtitle {
                font-size: 13px;
                font-weight: 500;
                color: var(--text-sub);
                text-transform: uppercase;
                letter-spacing: 0.1em;
                margin-bottom: 40px;
            }

            .ccr-label {
                font-size: 12px;
                font-weight: 600;
                color: var(--text-sub);
                margin-bottom: 12px;
                width: 100%; text-align: left;
                display: block;
            }

            /* Inputs */
            .ccr-input {
                background: rgba(255,255,255,0.5);
                border: none;
                border-radius: 16px;
                padding: 16px;
                width: 100%;
                font-family: 'Inter', sans-serif;
                font-size: 16px;
                font-weight: 500;
                color: var(--text-main);
                margin-bottom: 24px;
                transition: all 0.2s;
            }
            .ccr-input:focus {
                outline: none;
                background: #fff;
                box-shadow: 0 0 0 2px var(--text-main);
            }
            .ccr-input::placeholder { color: #999; }

            /* Car Selection - Minimal Horizontal Scroll */
            .ccr-grid { 
                display: grid; 
                grid-template-columns: 1fr 1fr; 
                gap: 16px; 
                width: 100%; 
                margin-bottom: 32px; 
            }
            
            .ccr-card {
                background: rgba(255,255,255,0.3);
                border-radius: 20px;
                padding: 12px;
                cursor: pointer;
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                border: 2px solid transparent;
                display: flex; flex-direction: column; align-items: center;
            }
            .ccr-card:hover { background: rgba(255,255,255,0.6); }
            
            .ccr-card.active {
                background: #fff;
                border-color: var(--text-main);
                transform: translateY(-4px);
                box-shadow: 0 10px 20px rgba(0,0,0,0.05);
            }
            
            .ccr-card img {
                width: 100%; height: 80px; object-fit: contain;
                margin-bottom: 8px;
                /* Slight drop shadow on the car image itself */
                filter: drop-shadow(0 10px 10px rgba(0,0,0,0.2));
            }
            
            .ccr-card span { font-size: 12px; font-weight: 600; }

            /* Select Dropdown */
            .ccr-select-wrap { position: relative; width: 100%; margin-bottom: 32px; }
            .ccr-select {
                width: 100%; padding: 16px;
                background: rgba(255,255,255,0.5);
                border: none; border-radius: 16px;
                font-family: 'Inter'; font-weight: 500; font-size: 15px;
                appearance: none; cursor: pointer;
            }
            .ccr-select-arrow {
                position: absolute; right: 16px; top: 50%; transform: translateY(-50%);
                pointer-events: none; font-size: 10px; color: var(--text-main);
            }

            /* Buttons - The "Pill" Style */
            .ccr-btn-group { display: flex; flex-direction: column; gap: 12px; width: 100%; }
            
            .ccr-btn {
                padding: 18px;
                border-radius: 99px; /* Pill shape */
                border: none;
                font-family: 'Inter', sans-serif;
                font-weight: 600;
                font-size: 15px;
                cursor: pointer;
                transition: transform 0.1s;
                width: 100%;
            }
            .ccr-btn:active { transform: scale(0.98); }

            .ccr-btn-primary {
                background: var(--text-main);
                color: #fff;
            }
            .ccr-btn-secondary {
                background: transparent;
                color: var(--text-main);
                border: 1px solid rgba(0,0,0,0.1);
            }
            .ccr-btn-secondary:hover { background: rgba(0,0,0,0.05); }

            /* Lobby List Styles */
            .ccr-list { width: 100%; margin-bottom: 24px; }
            .ccr-row {
                display: flex; justify-content: space-between; align-items: center;
                padding: 12px 0;
                border-bottom: 1px solid rgba(0,0,0,0.06);
                font-size: 14px;
            }
            .ccr-tag {
                font-size: 10px; font-weight: 700; 
                padding: 4px 8px; border-radius: 6px;
                background: #eee; color: #999;
            }
            .ccr-tag.ready { background: var(--text-main); color: #fff; }

            @keyframes driftUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
            
            /* Scrollbar cleanup */
            ::-webkit-scrollbar { width: 0px; background: transparent; }
        `;
        document.head.appendChild(style);
    }

    _el(tag, className, content = '', attributes = {}) {
        const el = document.createElement(tag);
        if (className) el.className = className;
        if (content instanceof HTMLElement) el.appendChild(content);
        else el.innerHTML = content;
        Object.entries(attributes).forEach(([k, v]) => {
            if (k.startsWith('on')) el[k] = v;
            else el.setAttribute(k, v);
        });
        return el;
    }

    _initDOM() {
        this.dom.root = this._el('div', '', '', { id: 'ccr-root' });
        const panel = this._el('div', 'ccr-panel');
        
        // Minimal Header
        panel.appendChild(this._el('h1', 'ccr-title', 'CHIPI CHAPA<br>RACING'));
        panel.appendChild(this._el('div', 'ccr-subtitle', 'Select your machine'));

        // --- LOGIN VIEW ---
        this.dom.loginView = this._el('div', '', '', { style: 'width: 100%;' });
        
        // Username
        this.dom.loginView.appendChild(this._el('span', 'ccr-label', 'Driver Name'));
        this.dom.usernameInput = this._el('input', 'ccr-input', '', { placeholder: 'Enter name', maxlength: 12 });
        this.dom.usernameInput.addEventListener('input', (e) => this.state.username = e.target.value);
        this.dom.loginView.appendChild(this.dom.usernameInput);

        // Car Grid
        this.dom.carGrid = this._el('div', 'ccr-grid');
        this._renderCarOptions();
        this.dom.loginView.appendChild(this.dom.carGrid);

        // Song Select
        this.dom.loginView.appendChild(this._el('span', 'ccr-label', 'Starting Track'));
        const selectWrap = this._el('div', 'ccr-select-wrap');
        this.dom.songSelect = this._el('select', 'ccr-select');
        this.dom.songSelect.addEventListener('change', (e) => this.state.song = e.target.value);
        this._renderSongOptions();
        selectWrap.appendChild(this.dom.songSelect);
        selectWrap.appendChild(this._el('div', 'ccr-select-arrow', '▼'));
        this.dom.loginView.appendChild(selectWrap);

        // Buttons
        const btnGroup = this._el('div', 'ccr-btn-group');
        btnGroup.appendChild(this._el('button', 'ccr-btn ccr-btn-primary', 'Join Lobby', { onclick: () => this.joinLobby() }));
        btnGroup.appendChild(this._el('button', 'ccr-btn ccr-btn-secondary', 'Singleplayer', { onclick: () => this.startSinglePlayer() }));
        this.dom.loginView.appendChild(btnGroup);
        
        panel.appendChild(this.dom.loginView);

        // --- LOBBY VIEW (Hidden) ---
        this.dom.lobbyView = this._el('div', '', '', { style: 'width: 100%; display: none;' });
        
        // Player List Section
        this.dom.lobbyView.appendChild(this._el('span', 'ccr-label', 'Drivers Connected'));
        this.dom.playerList = this._el('div', 'ccr-list');
        this.dom.lobbyView.appendChild(this.dom.playerList);

        // Vote Section
        this.dom.lobbyView.appendChild(this._el('span', 'ccr-label', 'Track Voting'));
        this.dom.voteList = this._el('div', 'ccr-list');
        this.dom.lobbyView.appendChild(this.dom.voteList);

        // Ready Button
        this.dom.readyBtn = this._el('button', 'ccr-btn ccr-btn-primary', 'Mark Ready', { 
            style: 'margin-top: 20px;',
            onclick: () => this.toggleReady() 
        });
        this.dom.lobbyView.appendChild(this.dom.readyBtn);

        panel.appendChild(this.dom.lobbyView);
        this.dom.root.appendChild(panel);
        document.body.appendChild(this.dom.root);
    }

    _renderCarOptions() {
        this.dom.carGrid.innerHTML = '';
        CAR_OPTIONS.forEach(opt => {
            const isActive = this.state.model === opt.model;
            const card = this._el('div', `ccr-card ${isActive ? 'active' : ''}`);
            
            const img = this._el('img', '', '', { src: opt.image });
            const label = this._el('span', '', opt.label);

            card.onclick = () => {
                this.state.model = opt.model;
                this._renderCarOptions();
            };

            card.appendChild(img);
            card.appendChild(label);
            this.dom.carGrid.appendChild(card);
        });
    }

    _renderSongOptions() {
        this.dom.songSelect.innerHTML = '';
        this.state.songs.forEach(song => {
            const option = this._el('option', '', getSongDisplayName(song), { value: song });
            this.dom.songSelect.appendChild(option);
        });
        this.dom.songSelect.value = this.state.song;
    }

    joinLobby() {
        const name = this.state.username || `Driver ${Math.floor(Math.random()*99)}`;
        this.network.sendJoinLobby(name, this.state.model);
        
        this.dom.loginView.style.display = 'none';
        this.dom.lobbyView.style.display = 'block';
    }

    startSinglePlayer() {
        this.dom.root.style.opacity = '0';
        this.dom.root.style.transition = 'opacity 0.4s ease';
        setTimeout(() => {
            this.dom.root.style.display = 'none';
            this.onStartSingleplayer(this.state.model, this.state.song);
        }, 400);
    }

    toggleReady() {
        this.state.isReady = !this.state.isReady;
        const btn = this.dom.readyBtn;
        
        if (this.state.isReady) {
            btn.innerText = 'Ready';
            btn.style.background = '#ddd';
            btn.style.color = '#999';
        } else {
            btn.innerText = 'Mark Ready';
            btn.style.background = 'var(--text-main)';
            btn.style.color = '#fff';
        }
        
        this.network.sendReady(this.state.isReady);
    }

    updateLobby(players, votes) {
        // Update Players
        this.dom.playerList.innerHTML = '';
        players.forEach(p => {
            const row = this._el('div', 'ccr-row');
            row.innerHTML = `
                <span>${p.username}</span>
                <span class="ccr-tag ${p.isReady ? 'ready' : ''}">${p.isReady ? 'READY' : 'WAITING'}</span>
            `;
            this.dom.playerList.appendChild(row);
        });

        // Update Votes
        this.dom.voteList.innerHTML = '';
        (this.network.songs || this.state.songs).forEach(song => {
            const count = votes ? votes[song] || 0 : 0;
            const row = this._el('div', 'ccr-row');
            
            // Simple clickable row for voting
            row.style.cursor = 'pointer';
            row.onclick = () => this.network.sendVote(song);
            
            row.innerHTML = `
                <div style="display:flex; align-items:center; gap:10px;">
                    <button style="background:none; border:none; cursor:pointer; font-size:14px;">▶</button>
                    <span>${getSongDisplayName(song)}</span>
                </div>
                <span style="font-weight:bold;">${count > 0 ? count : ''}</span>
            `;
            
            // Bind audio preview to the play button specifically
            const playBtn = row.querySelector('button');
            playBtn.onclick = (e) => {
                e.stopPropagation();
                this.previewAudio(song);
            };

            if (count > 0) row.style.fontWeight = 'bold';
            
            this.dom.voteList.appendChild(row);
        });
    }

    previewAudio(song) {
        if (this.currentAudio) this.currentAudio.pause();
        this.currentAudio = new Audio(`/assets/music/${song}`);
        this.currentAudio.volume = 0.4;
        this.currentAudio.play().catch(() => {});
        setTimeout(() => { if(this.currentAudio) this.currentAudio.pause(); }, 5000);
    }

    setSongs(songs) {
        if (songs && songs.length) this.state.songs = songs;
        this._renderSongOptions();
    }

    hide() {
        this.dom.root.style.display = 'none';
    }
}