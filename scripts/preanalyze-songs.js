const fs = require('fs');
const path = require('path');

// Simple beat detection (Node.js compatible version)
function detectBeats(audioData, sampleRate) {
    const peaks = [];
    const interval = Math.floor(sampleRate / 60); // Check roughly every frame
    
    for (let i = 0; i < audioData.length; i += interval) {
        let max = 0;
        for (let j = 0; j < interval && i + j < audioData.length; j++) {
            const val = Math.abs(audioData[i + j]);
            if (val > max) max = val;
        }
        if (max > 0.8) {
            peaks.push({
                time: i / sampleRate,
                type: 'beat',
                intensity: max
            });
        }
    }
    return peaks;
}

function analyzeSpectral(audioData, sampleRate) {
    const windowSize = sampleRate * 1; // 1 second windows
    const energies = [];
    
    for (let i = 0; i < audioData.length; i += windowSize) {
        let sum = 0;
        for (let j = 0; j < windowSize && i + j < audioData.length; j++) {
            sum += audioData[i + j] * audioData[i + j];
        }
        energies.push({
            time: i / sampleRate,
            energy: Math.sqrt(sum / windowSize)
        });
    }
    
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

// Try to use audio-decode if available, otherwise use placeholder
let audioDecode = null;
async function loadAudioDecoder() {
    try {
        // audio-decode is an ES module, use dynamic import
        const audioDecodeModule = await import('audio-decode');
        audioDecode = audioDecodeModule.default || audioDecodeModule;
        
        if (typeof audioDecode !== 'function') {
            throw new Error('Could not find audio-decode function');
        }
        return true;
    } catch (e) {
        console.log('Note: audio-decode not working:', e.message);
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

