export class BeatDetector {
    static detect(buffer, threshold = 1.5) {
        const data = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        const peaks = [];
        const interval = sampleRate / 60; // Check roughly every frame

        // Simple peak detection
        for (let i = 0; i < data.length; i += interval) {
            let max = 0;
            for (let j = 0; j < interval && i + j < data.length; j++) {
                const val = Math.abs(data[i + j]);
                if (val > max) max = val;
            }
            if (max > 0.8) { // High amplitude
                peaks.push({
                    time: i / sampleRate,
                    type: 'beat',
                    intensity: max
                });
            }
        }
        return peaks;
    }

    static analyzeSpectral(buffer) {
        // This would be more complex in a real scenario, using FFT on chunks.
        // For this demo, we'll simulate "sections" based on energy changes.
        const data = buffer.getChannelData(0);
        const sampleRate = buffer.sampleRate;
        const windowSize = sampleRate * 1; // 1 second windows
        const energies = [];

        for (let i = 0; i < data.length; i += windowSize) {
            let sum = 0;
            for (let j = 0; j < windowSize && i + j < data.length; j++) {
                sum += data[i + j] * data[i + j];
            }
            energies.push({
                time: i / sampleRate,
                energy: Math.sqrt(sum / windowSize)
            });
        }

        // Detect drops/sections
        const events = [];
        for (let i = 1; i < energies.length; i++) {
            const diff = energies[i].energy - energies[i - 1].energy;
            if (diff > 0.2) {
                events.push({
                    time: energies[i].time,
                    type: 'drop',
                    intensity: diff
                });
            } else if (Math.abs(diff) > 0.1) {
                events.push({
                    time: energies[i].time,
                    type: 'section',
                    intensity: Math.abs(diff)
                });
            }
        }

        return { energies, events };
    }
}
