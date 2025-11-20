export class PauseMenu {
    constructor({ onResume, onMainMenu, onVolumeChange, onEffectsChange, onColorChange }) {
        this.onResume = onResume;
        this.onMainMenu = onMainMenu;
        this.onVolumeChange = onVolumeChange;
        this.onEffectsChange = onEffectsChange;
        this.onColorChange = onColorChange;
        this.isVisible = false;

        // Default Settings
        this.defaults = {
            volume: 30,
            effects: 50,
            color: 0
        };

        // Load saved settings
        this.loadSettings();

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

        // VOLUME
        const volumeRow = this.createSliderRow('Volume', this.settings.volume, (value) => {
            this.settings.volume = value;
            this.saveSettings();
            const normalized = value / 100;
            if (this.onVolumeChange) this.onVolumeChange(normalized);
        });
        this.volumeSlider = volumeRow.slider;
        panel.appendChild(volumeRow.row);

        // EFFECTS
        const effectsRow = this.createSliderRow('Effect Strength', this.settings.effects, (value) => {
            this.settings.effects = value;
            this.saveSettings();
            const normalized = value / 50; // default 1 at 50
            if (this.onEffectsChange) this.onEffectsChange(normalized);
        });
        this.effectsSlider = effectsRow.slider;
        panel.appendChild(effectsRow.row);

        // SKY COLOR
        const colorRow = this.createSliderRow('Sky Color', this.settings.color, (value) => {
            this.settings.color = value;
            this.saveSettings();
            if (this.onColorChange) this.onColorChange(value); // 0-360
        });
        colorRow.slider.max = '360';
        this.colorSlider = colorRow.slider;
        panel.appendChild(colorRow.row);

        // RESET BUTTON
        const resetBtn = this.createButton('Reset Defaults');
        resetBtn.style.background = 'transparent';
        resetBtn.style.border = '1px solid rgba(255,255,255,0.3)';
        resetBtn.style.fontSize = '14px';
        resetBtn.style.padding = '8px 16px';
        resetBtn.style.marginTop = '10px';
        resetBtn.style.color = '#f6fbff'; // Force white text
        resetBtn.style.boxShadow = 'none'; // Remove default button shadow
        resetBtn.onmouseover = () => {
             resetBtn.style.background = 'rgba(255,255,255,0.1)';
        };
        resetBtn.onmouseout = () => {
             resetBtn.style.background = 'transparent';
        };
        resetBtn.onclick = () => this.resetDefaults();
        panel.appendChild(resetBtn);

        this.container.appendChild(panel);
        document.body.appendChild(this.container);

        // Apply initial settings
        this.applySettings();
    }

    loadSettings() {
        const stored = localStorage.getItem('recco_settings');
        if (stored) {
            this.settings = JSON.parse(stored);
        } else {
            this.settings = { ...this.defaults };
        }
    }

    saveSettings() {
        localStorage.setItem('recco_settings', JSON.stringify(this.settings));
    }

    resetDefaults() {
        this.settings = { ...this.defaults };
        this.saveSettings();
        
        // Update UI
        this.volumeSlider.value = this.settings.volume;
        this.effectsSlider.value = this.settings.effects;
        this.colorSlider.value = this.settings.color;

        // Apply callbacks
        this.applySettings();
    }

    applySettings() {
        // Volume
        if (this.onVolumeChange) this.onVolumeChange(this.settings.volume / 100);
        // Effects
        if (this.onEffectsChange) this.onEffectsChange(this.settings.effects / 50);
        // Color
        if (this.onColorChange) this.onColorChange(this.settings.color);
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

