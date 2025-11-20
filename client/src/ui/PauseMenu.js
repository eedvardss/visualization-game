export class PauseMenu {
    constructor({ onResume, onMainMenu, onVolumeChange, onEffectsChange, onColorChange }) {
        this.onResume = onResume;
        this.onMainMenu = onMainMenu;
        this.onVolumeChange = onVolumeChange;
        this.onEffectsChange = onEffectsChange;
        this.onColorChange = onColorChange;
        this.isVisible = false;

        this.container = document.createElement('div');
        this.container.style.position = 'absolute';
        this.container.style.top = '0';
        this.container.style.left = '0';
        this.container.style.width = '100%';
        this.container.style.height = '100%';
        this.container.style.background = 'rgba(4, 6, 22, 0.86)';
        this.container.style.backdropFilter = 'blur(12px)';
        this.container.style.display = 'none';
        this.container.style.flexDirection = 'column';
        this.container.style.alignItems = 'center';
        this.container.style.justifyContent = 'center';
        this.container.style.zIndex = '25000';
        this.container.style.color = '#f6fbff';
        this.container.style.fontFamily = 'Arial, sans-serif';

        const panel = document.createElement('div');
        panel.style.background = 'rgba(12, 16, 40, 0.9)';
        panel.style.border = '1px solid rgba(255, 255, 255, 0.15)';
        panel.style.borderRadius = '24px';
        panel.style.padding = '40px 60px';
        panel.style.boxShadow = '0 25px 80px rgba(0,0,0,0.55)';
        panel.style.minWidth = '420px';
        panel.style.display = 'flex';
        panel.style.flexDirection = 'column';
        panel.style.gap = '25px';

        const title = document.createElement('h2');
        title.innerText = 'PAUSED';
        title.style.letterSpacing = '0.4em';
        title.style.textAlign = 'center';
        panel.appendChild(title);

        const resumeBtn = this.createButton('Resume');
        resumeBtn.onclick = () => this.resume();
        panel.appendChild(resumeBtn);

        const menuBtn = this.createButton('Main Menu');
        menuBtn.style.background = 'linear-gradient(120deg, #ff8a5c, #ff4d5a)';
        menuBtn.onclick = () => {
            if (this.onMainMenu) this.onMainMenu();
        };
        panel.appendChild(menuBtn);

        const settingsHeader = document.createElement('h3');
        settingsHeader.innerText = 'Settings';
        settingsHeader.style.marginTop = '10px';
        panel.appendChild(settingsHeader);

        const volumeRow = this.createSliderRow('Volume', 30, (value) => {
            const normalized = value / 100;
            if (this.onVolumeChange) this.onVolumeChange(normalized);
        });
        this.volumeSlider = volumeRow.slider;
        panel.appendChild(volumeRow.row);

        const effectsRow = this.createSliderRow('Effect Strength', 50, (value) => {
            const normalized = value / 50; // default 1 at 50
            if (this.onEffectsChange) this.onEffectsChange(normalized);
        });
        this.effectsSlider = effectsRow.slider;
        panel.appendChild(effectsRow.row);

        const colorRow = this.createSliderRow('Sky Color', 0, (value) => {
            if (this.onColorChange) this.onColorChange(value); // 0-360
        });
        colorRow.slider.max = '360';
        this.colorSlider = colorRow.slider;
        panel.appendChild(colorRow.row);

        this.container.appendChild(panel);
        document.body.appendChild(this.container);
    }

    createButton(label) {
        const btn = document.createElement('button');
        btn.innerText = label;
        btn.style.padding = '14px 28px';
        btn.style.borderRadius = '999px';
        btn.style.border = 'none';
        btn.style.fontSize = '18px';
        btn.style.fontWeight = 'bold';
        btn.style.cursor = 'pointer';
        btn.style.background = 'linear-gradient(120deg, #00f6ff, #00c3ff)';
        btn.style.color = '#04121c';
        btn.style.boxShadow = '0 12px 30px rgba(0, 246, 255, 0.35)';
        return btn;
    }

    createSliderRow(label, defaultValue, onInput) {
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = 'column';
        row.style.gap = '8px';

        const header = document.createElement('div');
        header.innerText = label;
        header.style.fontSize = '14px';
        header.style.opacity = '0.8';
        row.appendChild(header);

        const slider = document.createElement('input');
        slider.type = 'range';
        slider.min = '0';
        slider.max = '100';
        slider.value = defaultValue.toString();
        slider.oninput = () => onInput(parseFloat(slider.value));
        slider.style.width = '100%';
        slider.style.accentColor = '#00e0ff';
        slider.style.cursor = 'pointer';
        row.appendChild(slider);

        return { row, slider };
    }

    show() {
        this.isVisible = true;
        this.container.style.display = 'flex';
    }

    hide() {
        this.isVisible = false;
        this.container.style.display = 'none';
    }

    toggle() {
        if (this.isVisible) this.hide();
        else this.show();
    }

    resume() {
        this.hide();
        if (this.onResume) this.onResume();
    }

    isOpen() {
        return this.isVisible;
    }

    setVolume(value) {
        this.volumeSlider.value = (value * 100).toString();
    }

    setEffectStrength(value) {
        this.effectsSlider.value = (value * 50).toString();
    }
}

