const fs = require('fs');
const path = require('path');

// Simple beat detection (Node.js compatible version)
function detectBeats(audioData, sampleRate) {
    const peaks = [];
    const interval = Math.floor(sampleRate / 60); // Check roughly every frame
    
    // First pass: find max volume to normalize
    let globalMax = 0;
    let sum = 0;
    // Sample every 100th point for speed in stats calculation
    for (let i = 0; i < audioData.length; i += 100) {
        const val = Math.abs(audioData[i]);
        if (val > globalMax) globalMax = val;
        sum += val;
    }
    const globalAvg = sum / (audioData.length / 100);
    
    // Dynamic threshold: beats are usually significant peaks relative to the song's range
    // Using 60% of max volume as a baseline for a "beat"
    // But ensuring it's at least above average noise
    const threshold = Math.max(globalMax * 0.5, globalAvg * 2);

    console.log(`  Stats: Max=${globalMax.toFixed(3)}, Avg=${globalAvg.toFixed(3)}, Threshold=${threshold.toFixed(3)}`);

    let lastBeatTime = -1;
    const minBeatInterval = 0.1; // 100ms refractory period to prevent multiple triggers for same beat

    for (let i = 0; i < audioData.length; i += interval) {
        let max = 0;
        for (let j = 0; j < interval && i + j < audioData.length; j++) {
            const val = Math.abs(audioData[i + j]);
            if (val > max) max = val;
        }
        
        const currentTime = i / sampleRate;
        if (max > threshold) {
            // Only add beat if enough time has passed since last one
            if (lastBeatTime === -1 || (currentTime - lastBeatTime) > minBeatInterval) {
                peaks.push({
                    time: currentTime,
                    type: 'beat',
                    // Normalize intensity 0-1 based on song's max volume
                    intensity: Math.min(1.0, max / globalMax) 
                });
                lastBeatTime = currentTime;
            } else {
                // If we are within the refractory period, check if this peak is higher than the stored one
                // If so, update the previous beat's intensity and time (centering the beat on the highest peak)
                const lastBeat = peaks[peaks.length - 1];
                if (max > (lastBeat.intensity * globalMax)) {
                    lastBeat.intensity = Math.min(1.0, max / globalMax);
                    lastBeat.time = currentTime;
                    lastBeatTime = currentTime; // Extend refractory period from new peak
                }
            }
        }
    }
    return peaks;
}

function analyzeSpectral(audioData, sampleRate) {
    // Use smaller windows for better resolution (0.1s instead of 1s)
    const windowSize = Math.floor(sampleRate * 0.1); 
    const energies = [];
    
    // Calculate global max for normalization
    let globalMax = 0;
    for (let i = 0; i < audioData.length; i += 100) {
        const val = Math.abs(audioData[i]);
        if (val > globalMax) globalMax = val;
    }
    
    for (let i = 0; i < audioData.length; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize && i + j < audioData.length; j++) {
            sum += audioData[i + j] * audioData[i + j];
        }
        const rms = Math.sqrt(sum / windowSize);
        energies.push({
            time: i / sampleRate,
            energy: Math.min(1.0, rms / (globalMax || 1)) // Normalize
        });
    }
    
    // Smooth the energies to reduce jitter
    // Simple moving average
    const smoothedEnergies = energies.map((e, i, arr) => {
        const prev = arr[i-1] ? arr[i-1].energy : e.energy;
        const next = arr[i+1] ? arr[i+1].energy : e.energy;
        return {
            time: e.time,
            energy: (prev + e.energy + next) / 3
        };
    });
    
    const events = [];
    for (let i = 1; i < smoothedEnergies.length; i++) {
        const diff = smoothedEnergies[i].energy - smoothedEnergies[i - 1].energy;
        // Lower thresholds for changes since we are using smoothed, normalized values
        if (diff > 0.15) {
            events.push({
                time: smoothedEnergies[i].time,
                type: 'drop',
                intensity: Math.min(1.0, diff * 2) // Amplify the drop intensity slightly
            });
        } else if (Math.abs(diff) > 0.08) {
            events.push({
                time: smoothedEnergies[i].time,
                type: 'section',
                intensity: Math.min(1.0, Math.abs(diff) * 2)
            });
        }
    }
    
    return { energies: smoothedEnergies, events };
}

// Try to use audio-decode if available, otherwise use placeholder
let audioDecode = null;
async function loadAudioDecoder() {
    try {
        // audio-decode is an ES module, use dynamic import
        console.log('Attempting to import audio-decode...');
        const audioDecodeModule = await import('audio-decode');
        console.log('Import successful, type:', typeof audioDecodeModule);
        audioDecode = audioDecodeModule.default || audioDecodeModule;
        console.log('audioDecode type:', typeof audioDecode);
        
        if (typeof audioDecode !== 'function') {
            throw new Error(`Could not find audio-decode function (got ${typeof audioDecode})`);
        }
        return true;
    } catch (e) {
        console.log('Note: audio-decode not working:', e.message);
        console.log('Stack:', e.stack);
        console.log('For now, creating placeholder files that can be replaced later.\n');
        audioDecode = null;
        return false;
    }
}

const songs = [
    'Homecoming.mp3',
    'Children.mp3',
    'killing_me_softly.mp3',
    'like_a_prayer.mp3',
    'move_your_body.mp3'
];

const musicDir = path.join(__dirname, '../client/public/assets/music');
const outputDir = path.join(__dirname, '../client/public/assets/music/analysis');

// Create output directory if it doesn't exist
if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
}

async function analyzeSong(songName) {
    const songPath = path.join(musicDir, songName);
    
    if (!fs.existsSync(songPath)) {
        console.log(`⚠️  File not found: ${songPath}`);
        return null;
    }
    
    if (audioDecode) {
        try {
            console.log(`Analyzing ${songName}...`);
            const audioBuffer = await audioDecode(fs.readFileSync(songPath));
            const channelData = audioBuffer.getChannelData(0);
            const sampleRate = audioBuffer.sampleRate;
            
            const beats = detectBeats(channelData, sampleRate);
            const spectral = analyzeSpectral(channelData, sampleRate);
            const timeline = [...beats, ...spectral.events].sort((a, b) => a.time - b.time);
            
            return {
                timeline,
                energyProfile: spectral.energies,
                metadata: {
                    analyzedAt: new Date().toISOString(),
                    sampleRate,
                    duration: audioBuffer.duration
                }
            };
        } catch (error) {
            console.error(`Error analyzing ${songName}:`, error.message);
            return null;
        }
    } else {
        // Placeholder
        return {
            timeline: [],
            energyProfile: [],
            metadata: {
                analyzedAt: new Date().toISOString(),
                note: 'Placeholder - install audio-decode and re-run for real analysis'
            }
        };
    }
}

async function main() {
    console.log('Pre-analyzing songs...\n');
    
    await loadAudioDecoder();

    for (const song of songs) {
        const songBase = song.replace('.mp3', '');
        const outputPath = path.join(outputDir, `${songBase}.json`);
        
        const analysis = await analyzeSong(song);
        if (analysis) {
            fs.writeFileSync(outputPath, JSON.stringify(analysis, null, 2));
            console.log(`✓ Created: ${outputPath} (${analysis.timeline.length} events)`);
        }
    }
    
    console.log('\n✅ Done!');
    if (!audioDecode) {
        console.log('\nTo enable real analysis:');
        console.log('1. npm install audio-decode');
        console.log('2. Re-run this script');
    }
}

main().catch(console.error);

