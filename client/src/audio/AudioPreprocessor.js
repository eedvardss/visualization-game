import { BeatDetector } from './BeatDetector.js';

export class AudioPreprocessor {
    constructor() {
        this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    }

    async load(url) {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);
        return audioBuffer;
    }

    analyze(audioBuffer) {
        console.log('Starting audio analysis...');

        // 1. Detect Beats (High amplitude peaks)
        const beats = BeatDetector.detect(audioBuffer);

        // 2. Detect Sections/Drops (Energy shifts)
        const spectral = BeatDetector.analyzeSpectral(audioBuffer);

        // Combine into a timeline
        const timeline = [...beats, ...spectral.events].sort((a, b) => a.time - b.time);

        console.log(`Analysis complete. Found ${timeline.length} events.`);

        return {
            buffer: audioBuffer,
            timeline: timeline,
            energyProfile: spectral.energies
        };
    }
}
