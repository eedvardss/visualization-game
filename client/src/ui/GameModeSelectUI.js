export class GameModeSelectUI {
    constructor(onSelect) {
        this.onSelect = onSelect;
        this.container = null;
    }

    show() {
        if (this.container) return;

        this.container = document.createElement('div');
        Object.assign(this.container.style, {
            position: 'absolute',
            top: '0',
            left: '0',
            width: '100%',
            height: '100%',
            backgroundColor: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: '10000',
            fontFamily: '"Segoe UI", Roboto, Helvetica, Arial, sans-serif',
            color: 'white',
            backdropFilter: 'blur(10px)'
        });

        const title = document.createElement('h1');
        title.innerText = 'SELECT GAME MODE';
        Object.assign(title.style, {
            fontSize: '48px',
            marginBottom: '60px',
            letterSpacing: '4px',
            textShadow: '0 0 20px rgba(255, 255, 255, 0.5)',
            fontWeight: '800'
        });
        this.container.appendChild(title);

        const optionsContainer = document.createElement('div');
        Object.assign(optionsContainer.style, {
            display: 'flex',
            gap: '40px'
        });

        this.createOption(optionsContainer, 'RACETRACK', 'Classic high-speed racing on a generated track.', 'racetrack', 'linear-gradient(135deg, #ff0055, #ff00aa)');
        this.createOption(optionsContainer, 'GLOBE COLLECTOR', 'Drive on a tiny planet and collect coins.', 'globe', 'linear-gradient(135deg, #00aaff, #00ffaa)');

        this.container.appendChild(optionsContainer);
        document.body.appendChild(this.container);
    }

    createOption(parent, titleText, descText, modeId, background) {
        const card = document.createElement('div');
        Object.assign(card.style, {
            width: '300px',
            height: '400px',
            background: background,
            borderRadius: '20px',
            padding: '30px',
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'transform 0.2s, box-shadow 0.2s',
            boxShadow: '0 10px 30px rgba(0,0,0,0.5)',
            textAlign: 'center'
        });

        const title = document.createElement('h2');
        title.innerText = titleText;
        Object.assign(title.style, {
            fontSize: '28px',
            marginBottom: '20px',
            fontWeight: 'bold',
            textTransform: 'uppercase'
        });

        const desc = document.createElement('p');
        desc.innerText = descText;
        Object.assign(desc.style, {
            fontSize: '16px',
            lineHeight: '1.5',
            opacity: '0.9'
        });

        card.appendChild(title);
        card.appendChild(desc);

        card.onmouseenter = () => {
            card.style.transform = 'scale(1.05) translateY(-10px)';
            card.style.boxShadow = '0 20px 40px rgba(0,0,0,0.6)';
        };
        card.onmouseleave = () => {
            card.style.transform = 'scale(1.0)';
            card.style.boxShadow = '0 10px 30px rgba(0,0,0,0.5)';
        };

        card.onclick = () => {
            this.hide();
            if (this.onSelect) this.onSelect(modeId);
        };

        parent.appendChild(card);
    }

    hide() {
        if (this.container) {
            document.body.removeChild(this.container);
            this.container = null;
        }
    }
}
