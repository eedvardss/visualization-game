import * as THREE from 'three';
import { Graphics } from './graphics.js';
import { TrackGenerator } from './track/TrackGenerator.js';
import { TrackEffects } from './track/TrackEffects.js';
import { NebulaBackground } from './track/NebulaBackground.js';
import { Car } from './car.js';
import { Network } from './network.js';
import { AudioPreprocessor } from './audio/AudioPreprocessor.js';
import { LobbyUI } from './ui/LobbyUI.js';
import { ReccoBeatsClient } from './audio/ReccoBeatsClient.js';
import { DEFAULT_SONG, SONG_LIBRARY } from './utils/songCatalog.js';
const FALLBACK_AUDIO_FEATURES = {
    danceability: 0.78,
    energy: 0.88,
    key: 5,
    loudness: -5.2,
    mode: 1,
    speechiness: 0.055,
    acousticness: 0.014,
    instrumentalness: 0.0000123,
    liveness: 0.36,
    valence: 0.62,
    tempo: 128.97,
    time_signature: 4
};

function normalizeAudioFeatures(raw) {
    if (!raw) return null;
    if (Array.isArray(raw.audio_features)) {
        return raw.audio_features[0];
    }
    if (raw.audio_features && typeof raw.audio_features === 'object') {
        return raw.audio_features;
    }
    if (Array.isArray(raw)) {
        return raw[0];
    }
    return raw;
}

async function init() {
    // ===========================
    // UI OVERLAY & LOBBY
    // ===========================
    const uiOverlay = document.createElement('div');
    uiOverlay.style.position = 'absolute';
    uiOverlay.style.top = '50%';
    uiOverlay.style.left = '50%';
    uiOverlay.style.transform = 'translate(-50%, -50%)';
    uiOverlay.style.fontSize = '120px';
    uiOverlay.style.color = 'white';
    uiOverlay.style.fontFamily = 'Arial, sans-serif';
    uiOverlay.style.fontWeight = '900';
    uiOverlay.style.pointerEvents = 'none';
    uiOverlay.style.textAlign = 'center';
    uiOverlay.style.zIndex = '9999';
    document.body.appendChild(uiOverlay);

    // ===========================
    // GRAPHICS + STARFIELD + FOG
    // ===========================
    let currentAudioFeatures = { ...FALLBACK_AUDIO_FEATURES };
    const graphics = new Graphics(currentAudioFeatures);

    // ===========================
    // TRACK GENERATION
    // ===========================
    const trackGen = new TrackGenerator(graphics.scene);
    const trackData = trackGen.generate();
    const trackCurve = trackData.curve;
    const frenetFrames = trackData.frames;
    const trackMesh = trackGen.mesh;
    const trackEffects = new TrackEffects(trackGen.mesh);
    const nebula = new NebulaBackground(graphics.scene, graphics.skyPalette);

    // ===========================
    // AUDIO PRE-PROCESSOR
    // ===========================
    const audioPreprocessor = new AudioPreprocessor();
    let audioBuffer = null;
    let audioTimeline = null;
    let audioSource = null;
    let audioAnalyser = null;
    let audioStartTime = 0;
    let lastAudioTime = 0;

    const reccoClient = new ReccoBeatsClient();

    function applyAudioFeatures(rawFeatures) {
        const normalized = normalizeAudioFeatures(rawFeatures);
        if (!normalized) return;

        currentAudioFeatures = {
            danceability: normalized.danceability ?? FALLBACK_AUDIO_FEATURES.danceability,
            energy: normalized.energy ?? FALLBACK_AUDIO_FEATURES.energy,
            valence: normalized.valence ?? FALLBACK_AUDIO_FEATURES.valence,
            acousticness: normalized.acousticness ?? FALLBACK_AUDIO_FEATURES.acousticness,
            tempo: normalized.tempo ?? FALLBACK_AUDIO_FEATURES.tempo,
            loudness: normalized.loudness ?? FALLBACK_AUDIO_FEATURES.loudness,
            liveness: normalized.liveness ?? FALLBACK_AUDIO_FEATURES.liveness,
            speechiness: normalized.speechiness ?? FALLBACK_AUDIO_FEATURES.speechiness,
            instrumentalness: normalized.instrumentalness ?? FALLBACK_AUDIO_FEATURES.instrumentalness,
            colorHint: normalized.colorHint
        };

        console.log('Applying audio features from ReccoBeats:', currentAudioFeatures);
        graphics.updateSkyPalette(currentAudioFeatures);
        if (nebula && graphics.skyPalette) {
            nebula.applyPalette(graphics.skyPalette);
        }
    }

    async function analyzeWithRecco(audioBlob, songName) {
        if (!audioBlob) return false;
        try {
            const result = await reccoClient.analyzeTrack(audioBlob);
            if (!result) {
                console.warn('ReccoBeats did not return features.');
                return false;
            }
            applyAudioFeatures(result);
            console.log(`ReccoBeats analysis complete for ${songName}`);
            return true;
        } catch (error) {
            console.error('Failed to analyze audio with ReccoBeats:', error);
            return false;
        }
    }

    async function loadMusic(songName) {
        try {
            // 1. Load for AudioContext (ArrayBuffer)
            const { audioBuffer: decodedBuffer, audioBlob } = await audioPreprocessor.load(`/assets/music/${songName}`);
            const analysis = audioPreprocessor.analyze(decodedBuffer);
            audioBuffer = analysis.buffer;
            audioTimeline = analysis.timeline;
            console.log(`Audio ready: ${songName}`);
            await ensureAudioFeatures(songName, audioBlob);
        } catch (e) {
            console.error('Failed to load audio:', e);
        }
    }

    async function ensureAudioFeatures(songName, audioBlob) {
        let applied = false;
        if (audioBlob) {
            applied = await analyzeWithRecco(audioBlob, songName);
        }
        if (!applied) {
            const fallback = SONG_LIBRARY[songName]?.fallbackFeatures;
            if (fallback) {
                console.warn(`Using catalog fallback features for ${songName}`);
                applyAudioFeatures(fallback);
                applied = true;
            }
        }
        if (!applied) {
            applyAudioFeatures(FALLBACK_AUDIO_FEATURES);
        }
    }

    // ===========================
    // NETWORK & LOBBY
    // ===========================
    const network = new Network();
    let localCar = null;
    const remoteCars = new Map();
    let gameState = 'WAITING';

    const lobbyUI = new LobbyUI(network, (model, songChoice) => {
        // Singleplayer start
        spawnLocalCar(model);
        gameState = 'PLAYING';
        const track = songChoice || DEFAULT_SONG;
        loadMusic(track).then(() => startMusic());
    });

    network.onInit = (data) => {
        lobbyUI.setSongs(data.songs);
    };

    network.onLobbyUpdate = (players, votes) => {
        lobbyUI.updateLobby(players, votes);
    };

    network.onPlayerJoined = (playerData) => {
        if (!remoteCars.has(playerData.id)) {
            const car = new Car(graphics.scene, playerData.color, false, playerData.model);
            remoteCars.set(playerData.id, car);
        }
    };

    network.onPlayerLeft = (id) => {
        const car = remoteCars.get(id);
        if (car) {
            graphics.scene.remove(car.mesh);
            remoteCars.delete(id);
        }
    };

    network.onGameStateChange = (state, startTime) => {
        gameState = state;

        if (state === 'WAITING') {
            uiOverlay.innerText = '';
            if (audioSource) {
                audioSource.stop();
                audioSource = null;
            }
            // Reset cars?
        } else if (state === 'PLAYING') {
            uiOverlay.innerText = 'GO!';
            setTimeout(() => uiOverlay.innerText = '', 1000);

            // Start Music Logic
            const songToPlay = network.selectedSong || DEFAULT_SONG;
            loadMusic(songToPlay).then(() => {
                const delay = startTime - Date.now();
                if (delay > 0) setTimeout(() => startMusic(), delay);
                else startMusic(Math.abs(delay) / 1000);
            });

            // Spawn local car if not already
            if (!localCar) spawnLocalCar(lobbyUI.selectedModel);
            lobbyUI.hide();
        }
    };

    network.onCountdown = (duration, song) => {
        let count = duration;
        uiOverlay.innerText = count;
        const interval = setInterval(() => {
            count--;
            if (count > 0) uiOverlay.innerText = count;
            else clearInterval(interval);
        }, 1000);

        // Preload song
        if (song) loadMusic(song);
    };

    network.connect();

    function spawnLocalCar(model) {
        if (localCar) return;
        localCar = new Car(graphics.scene, 0x00ff00, true, model);
        // Set start pos
        localCar.mesh.position.set(150, 10, 0); // Start on track roughly
    }

    function startMusic(offset = 0) {
        if (!audioBuffer) return;
        if (audioSource) try { audioSource.stop(); } catch (e) { }

        audioSource = audioPreprocessor.audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;

        // Create Analyser
        audioAnalyser = audioPreprocessor.audioContext.createAnalyser();
        audioAnalyser.fftSize = 256;

        audioSource.connect(audioAnalyser);
        audioAnalyser.connect(audioPreprocessor.audioContext.destination);

        audioSource.start(0, offset);
        audioStartTime = audioPreprocessor.audioContext.currentTime - offset;
        lastAudioTime = offset;
    }

    // ===========================
    // CAMERA INPUT
    // ===========================
    let isFreeLook = false;
    let camLat = 0, camLon = 0;

    window.addEventListener('mousedown', (e) => {
        if (e.button === 1) isFreeLook = true; // Middle mouse
    });
    window.addEventListener('mouseup', (e) => {
        if (e.button === 1) {
            isFreeLook = false;
            camLat = 0; camLon = 0;
        }
    });
    window.addEventListener('mousemove', (e) => {
        if (isFreeLook) {
            camLon -= e.movementX * 0.005;
            camLat -= e.movementY * 0.005;
            camLat = Math.max(-1, Math.min(1, camLat));
        }
    });

    // ===========================
    // GAME LOOP
    // ===========================
    const clock = new THREE.Clock();
    const dataArray = new Uint8Array(128); // Half of fftSize

    function animate() {
        requestAnimationFrame(animate);

        const dt = clock.getDelta();
        const time = clock.getElapsedTime();

        let currentAudioData = { timelineEvent: null, realtimeEnergy: 0 };

        // AUDIO ANALYSIS
        if (audioSource && audioTimeline && gameState === 'PLAYING') {
            const currentAudioTime = audioPreprocessor.audioContext.currentTime - audioStartTime;

            // 1. Get Realtime Energy
            if (audioAnalyser) {
                audioAnalyser.getByteFrequencyData(dataArray);
                let sum = 0;
                // Focus on bass frequencies (lower indices)
                for (let i = 0; i < 20; i++) {
                    sum += dataArray[i];
                }
                currentAudioData.realtimeEnergy = sum / 20 / 255; // Normalize 0-1
            }

            // 2. Check Timeline Events (Range Check)
            const events = audioTimeline.filter(e =>
                e.time > lastAudioTime && e.time <= currentAudioTime
            );

            if (events.length > 0) {
                const beat = events.find(e => e.type === 'beat');
                currentAudioData.timelineEvent = beat || events[events.length - 1];
            }

            lastAudioTime = currentAudioTime;
        }

        // ===========================
        // REAL-TIME REACTIVITY (SMOOTH)
        // ===========================
        if (graphics.baseFogDensity) {
            // 1. DYNAMIC FOG DENSITY
            const targetDensity = graphics.baseFogDensity + currentAudioData.realtimeEnergy * 0.005;
            graphics.scene.fog.density = THREE.MathUtils.lerp(graphics.scene.fog.density, targetDensity, 0.1);

            // 2. SMOOTH COLOR PULSE (Anti-Epilepsy)
            if (currentAudioData.timelineEvent && currentAudioData.timelineEvent.type === 'beat') {
                const current = graphics.pulseIntensity || 0;
                graphics.pulseIntensity = Math.min(0.16, current + 0.07);
            } else {
                graphics.pulseIntensity = THREE.MathUtils.lerp(graphics.pulseIntensity || 0, 0, 0.14);
            }

            // Apply pulse to color
            if (graphics.baseFogColor) {
                const pulseColor = graphics.baseFogColor.clone().offsetHSL(0, 0, graphics.pulseIntensity * 0.018);
                graphics.scene.fog.color.copy(pulseColor);
                graphics.scene.background.copy(graphics.scene.fog.color);
            }
        }

        // 3. CAMERA SHAKE
        let shake = new THREE.Vector3();
        if (currentAudioData.timelineEvent && currentAudioData.timelineEvent.type === 'beat') {
            shake.set(
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5,
                (Math.random() - 0.5) * 0.5
            );
        }

        trackEffects.update(time, currentAudioData);
        nebula.update(time, currentAudioData);

        // LOCAL CAR
        if (localCar) {
            localCar.update(dt, { trackCurve, frames: frenetFrames, canMove: true });

            // Camera Chase
            const carPos = localCar.mesh.position;
            const carQuat = localCar.mesh.quaternion;

            // Base offset
            const offset = new THREE.Vector3(0, 5, -10);
            offset.applyQuaternion(carQuat);

            // Apply free look rotation
            if (isFreeLook) {
                offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), camLon);
                offset.y += camLat * 5;
            }

            const idealPos = carPos.clone().add(offset).add(shake);
            const idealLook = carPos.clone().add(new THREE.Vector3(0, 2, 0));

            graphics.camera.position.lerp(idealPos, dt * 5.0);
            graphics.camera.lookAt(idealLook);

            // FOV Boost
            const targetFOV = (localCar.keys.shift && localCar.speed > 50) ? 90 : 75;
            graphics.camera.fov = THREE.MathUtils.lerp(graphics.camera.fov, targetFOV, dt * 2);
            graphics.camera.updateProjectionMatrix();

            // Network Sync
            network.sendUpdate({
                x: carPos.x, y: carPos.y, z: carPos.z,
                qx: carQuat.x, qy: carQuat.y, qz: carQuat.z, qw: carQuat.w,
                velocity: localCar.speed
            });
        }

        // REMOTE CARS
        remoteCars.forEach((car, id) => {
            const data = network.players.get(id);
            if (data) {
                car.setTarget(data.x, data.y, data.z, data.qx, data.qy, data.qz, data.qw);
                car.update(dt);
            }
        });

        graphics.render();
    }

    animate();
}

init();
