export class LobbyUI {
    constructor(network, onStartSingleplayer) {
        this.network = network;
        this.onStartSingleplayer = onStartSingleplayer;

        this.container = null;
        this.usernameInput = null;
        this.modelSelect = null;
        this.joinBtn = null;
        this.singleplayerBtn = null;
        this.lobbyPanel = null;
        this.playerList = null;
        this.voteList = null;
        this.readyBtn = null;

        this.selectedModel = 'mercedes.glb';
        this.isReady = false;

        this.init();
    }

    init() {
        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.background = 'rgba(0,0,0,0.85)';
        this.container.style.color = 'white';
        this.container.style.display = 'flex';
        this.container.style.flexDirection = 'column';
        this.container.style.alignItems = 'center';
        this.container.style.justifyContent = 'center';
        this.container.style.zIndex = '20000';
        this.container.style.fontFamily = 'Arial, sans-serif';
        document.body.appendChild(this.container);

        // LOGIN SCREEN
        this.loginPanel = document.createElement('div');
        this.loginPanel.style.textAlign = 'center';
        this.container.appendChild(this.loginPanel);

        const title = document.createElement('h1');
        title.innerText = 'MUSIC DRIFT ARENA';
        title.style.fontSize = '60px';
        title.style.marginBottom = '40px';
        title.style.textShadow = '0 0 20px #00ffff';
        this.loginPanel.appendChild(title);

        this.usernameInput = document.createElement('input');
        this.usernameInput.placeholder = 'Enter Username';
        this.usernameInput.style.padding = '10px';
        this.usernameInput.style.fontSize = '20px';
        this.usernameInput.style.marginBottom = '20px';
        this.usernameInput.style.display = 'block';
        this.usernameInput.style.margin = '0 auto 20px auto';
        this.loginPanel.appendChild(this.usernameInput);

        // Car Selection
        const carTitle = document.createElement('h3');
        carTitle.innerText = 'Select Car';
        this.loginPanel.appendChild(carTitle);

        const carContainer = document.createElement('div');
        carContainer.style.display = 'flex';
        carContainer.style.gap = '20px';
        carContainer.style.justifyContent = 'center';
        carContainer.style.marginBottom = '30px';
        this.loginPanel.appendChild(carContainer);

        ['mercedes.glb', 'Volvo XC60.glb'].forEach(model => {
            const btn = document.createElement('div');
            btn.innerText = model.replace('.glb', '');
            btn.style.padding = '15px';
            btn.style.border = '2px solid #444';
            btn.style.cursor = 'pointer';
            btn.style.borderRadius = '8px';
            btn.onclick = () => {
                this.selectedModel = model;
                Array.from(carContainer.children).forEach(c => c.style.borderColor = '#444');
                btn.style.borderColor = '#00ffff';
            };
            if (model === this.selectedModel) btn.style.borderColor = '#00ffff';
            carContainer.appendChild(btn);
        });

        // Buttons
        this.joinBtn = document.createElement('button');
        this.joinBtn.innerText = 'JOIN LOBBY';
        this.joinBtn.style.padding = '15px 40px';
        this.joinBtn.style.fontSize = '24px';
        this.joinBtn.style.background = '#00ffff';
        this.joinBtn.style.border = 'none';
        this.joinBtn.style.cursor = 'pointer';
        this.joinBtn.style.marginRight = '20px';
        this.joinBtn.onclick = () => this.joinLobby();
        this.loginPanel.appendChild(this.joinBtn);

        this.singleplayerBtn = document.createElement('button');
        this.singleplayerBtn.innerText = 'SINGLEPLAYER';
        this.singleplayerBtn.style.padding = '15px 40px';
        this.singleplayerBtn.style.fontSize = '24px';
        this.singleplayerBtn.style.background = '#ff00ff';
        this.singleplayerBtn.style.border = 'none';
        this.singleplayerBtn.style.cursor = 'pointer';
        this.singleplayerBtn.onclick = () => {
            this.hide();
            this.onStartSingleplayer(this.selectedModel);
        };
        this.loginPanel.appendChild(this.singleplayerBtn);

        // LOBBY SCREEN (Hidden initially)
        this.lobbyPanel = document.createElement('div');
        this.lobbyPanel.style.display = 'none';
        this.lobbyPanel.style.width = '800px';
        this.lobbyPanel.style.textAlign = 'center';
        this.container.appendChild(this.lobbyPanel);

        const lobbyTitle = document.createElement('h2');
        lobbyTitle.innerText = 'LOBBY';
        this.lobbyPanel.appendChild(lobbyTitle);

        const contentRow = document.createElement('div');
        contentRow.style.display = 'flex';
        contentRow.style.justifyContent = 'space-between';
        contentRow.style.marginTop = '30px';
        this.lobbyPanel.appendChild(contentRow);

        // Player List
        const leftCol = document.createElement('div');
        leftCol.style.width = '45%';
        leftCol.innerHTML = '<h3>Players</h3>';
        this.playerList = document.createElement('div');
        this.playerList.style.textAlign = 'left';
        leftCol.appendChild(this.playerList);
        contentRow.appendChild(leftCol);

        // Song Voting
        const rightCol = document.createElement('div');
        rightCol.style.width = '45%';
        rightCol.innerHTML = '<h3>Vote Song</h3>';
        this.voteList = document.createElement('div');
        rightCol.appendChild(this.voteList);
        contentRow.appendChild(rightCol);

        this.readyBtn = document.createElement('button');
        this.readyBtn.innerText = 'NOT READY';
        this.readyBtn.style.marginTop = '40px';
        this.readyBtn.style.padding = '20px 50px';
        this.readyBtn.style.fontSize = '28px';
        this.readyBtn.style.background = '#555';
        this.readyBtn.style.color = 'white';
        this.readyBtn.style.border = 'none';
        this.readyBtn.style.cursor = 'pointer';
        this.readyBtn.onclick = () => this.toggleReady();
        this.lobbyPanel.appendChild(this.readyBtn);
    }

    joinLobby() {
        const username = this.usernameInput.value || 'Racer';
        this.network.sendJoinLobby(username, this.selectedModel);
        this.loginPanel.style.display = 'none';
        this.lobbyPanel.style.display = 'block';
    }

    toggleReady() {
        this.isReady = !this.isReady;
        this.readyBtn.innerText = this.isReady ? 'READY!' : 'NOT READY';
        this.readyBtn.style.background = this.isReady ? '#00ff00' : '#555';
        this.network.sendReady(this.isReady);
    }

    updateLobby(players, votes) {
        // Update Player List
        this.playerList.innerHTML = '';
        players.forEach(p => {
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.borderBottom = '1px solid #333';
            div.style.color = p.isReady ? '#00ff00' : '#aaa';
            div.innerText = `${p.username} (${p.isReady ? 'READY' : 'WAITING'})`;
            this.playerList.appendChild(div);
        });

        // Update Vote List
        this.voteList.innerHTML = '';
        this.network.songs.forEach(song => {
            const count = votes ? votes[song] || 0 : 0;
            const div = document.createElement('div');
            div.style.padding = '10px';
            div.style.display = 'flex';
            div.style.justifyContent = 'space-between';
            div.style.alignItems = 'center';

            const name = document.createElement('span');
            name.innerText = song;

            const btn = document.createElement('button');
            btn.innerText = `Vote (${count})`;
            btn.onclick = () => this.network.sendVote(song);

            // Preview Audio
            const previewBtn = document.createElement('button');
            previewBtn.innerText = '▶';
            previewBtn.style.marginLeft = '10px';
            previewBtn.onclick = () => {
                const audio = new Audio(`/assets/music/${song}`);
                audio.volume = 0.5;
                audio.play();
                setTimeout(() => audio.pause(), 5000);
            };

            div.appendChild(name);
            const btnGroup = document.createElement('div');
            btnGroup.appendChild(btn);
            btnGroup.appendChild(previewBtn);
            div.appendChild(btnGroup);

            this.voteList.appendChild(div);
        });
    }

    hide() {
        this.container.style.display = 'none';
    }
}
