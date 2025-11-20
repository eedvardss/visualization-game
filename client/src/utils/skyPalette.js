import * as THREE from 'three';

function clampFeature(value, fallback = 0.5) {
    if (value === undefined || Number.isNaN(value)) return fallback;
    return THREE.MathUtils.clamp(value, 0, 1);
}

const FAMILY_PRESETS = {
    neon_green: {
        hue: 112 / 360,
        satRange: [0.55, 0.72],
        lightRange: [0.12, 0.2],
        fogLightRange: [0.09, 0.18],
        accentLightRange: [0.18, 0.26],
        accentShift: 0.38,
        glowShift: 0.07,
        density: { base: 0.0038, energy: 0.003 }
    },
    magenta: {
        hue: 318 / 360,
        satRange: [0.58, 0.78],
        lightRange: [0.15, 0.25],
        fogLightRange: [0.12, 0.22],
        accentLightRange: [0.2, 0.3],
        accentShift: 0.36,
        glowShift: 0.05,
        density: { base: 0.0038, energy: 0.0026 }
    },
    violet: {
        hue: 272 / 360,
        satRange: [0.5, 0.7],
        lightRange: [0.13, 0.23],
        fogLightRange: [0.11, 0.21],
        accentLightRange: [0.18, 0.28],
        accentShift: 0.4,
        glowShift: 0.08,
        density: { base: 0.0035, energy: 0.002 }
    },
    cyan: {
        hue: 192 / 360,
        satRange: [0.52, 0.72],
        lightRange: [0.14, 0.24],
        fogLightRange: [0.1, 0.2],
        accentLightRange: [0.18, 0.26],
        accentShift: 0.42,
        glowShift: 0.06,
        density: { base: 0.0036, energy: 0.0021 }
    },
    deep_red: {
        hue: 356 / 360,
        satRange: [0.45, 0.65],
        lightRange: [0.07, 0.15],
        fogLightRange: [0.07, 0.16],
        accentLightRange: [0.15, 0.22],
        accentShift: 0.35,
        glowShift: 0.04,
        density: { base: 0.0024, energy: 0.0012 }
    },
    golden_yellow: {
        hue: 46 / 360,
        satRange: [0.5, 0.7],
        lightRange: [0.13, 0.24],
        fogLightRange: [0.1, 0.2],
        accentLightRange: [0.2, 0.3],
        accentShift: 0.38,
        glowShift: 0.06,
        density: { base: 0.0029, energy: 0.0015 }
    },
    warm_orange: {
        hue: 28 / 360,
        satRange: [0.48, 0.66],
        lightRange: [0.13, 0.23],
        fogLightRange: [0.09, 0.2],
        accentLightRange: [0.18, 0.27],
        accentShift: 0.4,
        glowShift: 0.07,
        density: { base: 0.003, energy: 0.0017 }
    },
    misty_purple: {
        hue: 278 / 360,
        satRange: [0.42, 0.6],
        lightRange: [0.11, 0.2],
        fogLightRange: [0.09, 0.18],
        accentLightRange: [0.16, 0.25],
        accentShift: 0.35,
        glowShift: 0.05,
        density: { base: 0.0028, energy: 0.0011 }
    },
    synthetic_default: {
        hue: 305 / 360,
        satRange: [0.55, 0.75],
        lightRange: [0.15, 0.25],
        fogLightRange: [0.11, 0.21],
        accentLightRange: [0.19, 0.28],
        accentShift: 0.4,
        glowShift: 0.07,
        density: { base: 0.0037, energy: 0.002 }
    },
    organic_default: {
        hue: 32 / 360,
        satRange: [0.4, 0.6],
        lightRange: [0.1, 0.2],
        fogLightRange: [0.08, 0.17],
        accentLightRange: [0.16, 0.24],
        accentShift: 0.38,
        glowShift: 0.06,
        density: { base: 0.0027, energy: 0.0013 }
    }
};

function normalizeHint(hint) {
    if (!hint) return null;
    return hint.toLowerCase().replace(/\s+/g, '_');
}

function detectColorFamily(params, hint) {
    const normalizedHint = normalizeHint(hint);
    if (normalizedHint && FAMILY_PRESETS[normalizedHint]) return normalizedHint;

    const { acousticness, energy, tempoNorm, valence, danceability, instrumentalness } = params;

    if (acousticness < 0.45) {
        if (energy > 0.75 && tempoNorm > 0.6) return 'neon_green';
        if (valence > 0.45 && danceability > 0.45) return 'magenta';
        if (valence < 0.25) return 'violet';
        return 'cyan';
    }

    if (instrumentalness > 0.6 && valence < 0.25) return 'misty_purple';
    if (energy < 0.18 && valence < 0.25) return 'deep_red';
    if (energy < 0.4) return 'golden_yellow';
    return 'warm_orange';
}

export function generateSkyPalette(features = {}) {
    const valence = clampFeature(features.valence);
    const energy = clampFeature(features.energy);
    const danceability = clampFeature(features.danceability);
    const acousticness = clampFeature(features.acousticness);
    const instrumentalness = clampFeature(features.instrumentalness);

    const tempoBpm = typeof features.tempo === 'number' ? features.tempo : 120;
    const loudnessDb = typeof features.loudness === 'number' ? features.loudness : -12;

    const tempoNorm = THREE.MathUtils.clamp((tempoBpm - 60) / 120, 0, 1);
    const loudnessNorm = THREE.MathUtils.clamp((loudnessDb + 60) / 55, 0, 1);

    const family = detectColorFamily(
        { acousticness, energy, tempoNorm, valence, danceability, instrumentalness },
        features.colorHint
    ) || (acousticness < 0.5 ? 'synthetic_default' : 'organic_default');

    const preset =
        FAMILY_PRESETS[family] ||
        (acousticness < 0.5 ? FAMILY_PRESETS.synthetic_default : FAMILY_PRESETS.organic_default);

    const temperatureShift = THREE.MathUtils.lerp(-0.035, 0.035, valence);
    const tempoSatMult = THREE.MathUtils.lerp(0.85, 1.08, tempoNorm);
    const lightDriver = acousticness < 0.5 ? energy : loudnessNorm;

    const hue = (preset.hue + temperatureShift + 1) % 1;
    const saturation = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(preset.satRange[0], preset.satRange[1], Math.max(lightDriver, tempoNorm)) *
            tempoSatMult,
        preset.satRange[0],
        preset.satRange[1] + 0.05
    );

    const lightness = THREE.MathUtils.clamp(
        THREE.MathUtils.lerp(preset.lightRange[0], preset.lightRange[1], lightDriver),
        preset.lightRange[0],
        preset.lightRange[1]
    );

    const density =
        preset.density.base +
        preset.density.energy * (acousticness < 0.5 ? energy : THREE.MathUtils.clamp(1 - loudnessNorm, 0, 1));

    const base = new THREE.Color().setHSL(hue, saturation, lightness);

    const accentHue = (hue + (preset.accentShift ?? 0.48)) % 1;
    const accent = new THREE.Color().setHSL(
        accentHue,
        Math.min(1, saturation * 0.85),
        THREE.MathUtils.clamp(
            lightness + 0.08,
            (preset.accentLightRange ? preset.accentLightRange[0] : lightness + 0.04),
            (preset.accentLightRange ? preset.accentLightRange[1] : lightness + 0.12)
        )
    );

    const glowHue = (hue + (preset.glowShift ?? 0.08)) % 1;
    const glow = new THREE.Color().setHSL(
        glowHue,
        THREE.MathUtils.clamp(saturation * 1.05, 0.4, 1),
        THREE.MathUtils.clamp(0.28 + energy * 0.32 + (1 - acousticness) * 0.08, 0.28, 0.7)
    );

    const fog = base.clone().lerp(accent, acousticness < 0.5 ? 0.2 : 0.12);
    const fogHSL = { h: 0, s: 0, l: 0 };
    fog.getHSL(fogHSL);
    fogHSL.l = THREE.MathUtils.clamp(
        fogHSL.l,
        preset.fogLightRange[0],
        preset.fogLightRange[1]
    );
    fog.setHSL(fogHSL.h, fogHSL.s, fogHSL.l);

    return {
        base,
        accent,
        glow,
        fog,
        features: {
            valence,
            energy,
            danceability,
            acousticness,
            instrumentalness,
            fogDensity: density,
            tempoNorm,
            loudnessNorm,
            colorFamily: family
        }
    };
}