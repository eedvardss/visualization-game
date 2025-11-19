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
    // AUDIO FEATURE LOAD
    // ===========================
    const response = await fetch('/audio_features.json');
    const audioFeatures = await response.json();

    // ===========================
    // GRAPHICS + STARFIELD + FOG
    // ===========================
    const graphics = new Graphics();
    // Enable fog with a BRIGHT INDIGO color
    // Density 0.01: Lighter, more breathable, but still atmospheric.
    // Enable fog with a RICH PURPLE color to match nebula glow
    // Density 0.008: Stronger fog, but colored to blend with the sky (no black circle)
    graphics.scene.fog = new THREE.FogExp2(0x2d1b4e, 0.008);

    // ===========================
    // TRACK GENERATION
    // ===========================
    const trackGen = new TrackGenerator(graphics.scene);
    const trackData = trackGen.generate();
    const trackCurve = trackData.curve;
    const frenetFrames = trackData.frames;
    const trackMesh = trackGen.mesh;
    const trackEffects = new TrackEffects(trackGen.mesh);
    const nebula = new NebulaBackground(graphics.scene);

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

    async function loadMusic(songName) {
        try {
            // 1. Load for AudioContext (ArrayBuffer)
            const result = await audioPreprocessor.load(`/assets/music/${songName}`);
            const analysis = audioPreprocessor.analyze(result);
            audioBuffer = analysis.buffer;
            audioTimeline = analysis.timeline;
            console.log(`Audio ready: ${songName}`);

            // 2. Fetch as Blob for ReccoBeats API
            // (We need to fetch again or convert buffer, fetching is easier for now)
            fetch(`/assets/music/${songName}`)
        } catch (e) {
            console.error('Failed to load audio:', e);
        }
    }

    // ===========================
    // NETWORK & LOBBY
    // ===========================
    const network = new Network();
    let localCar = null;
    const remoteCars = new Map();
    let gameState = 'WAITING';

    const lobbyUI = new LobbyUI(network, (model) => {
        // Singleplayer start
        spawnLocalCar(model);
        gameState = 'PLAYING';
        loadMusic('Children.mp3').then(() => startMusic());
    });

    network.onInit = (data) => {
        // Handle init if needed
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
            if (network.selectedSong) {
                loadMusic(network.selectedSong).then(() => {
                    const delay = startTime - Date.now();
                    if (delay > 0) setTimeout(() => startMusic(), delay);
                    else startMusic(Math.abs(delay) / 1000);
                });
            }

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
                graphics.pulseIntensity = 0.6;
            } else {
                graphics.pulseIntensity = THREE.MathUtils.lerp(graphics.pulseIntensity || 0, 0, 0.05);
            }

            // Apply pulse to color
            const pulseColor = graphics.baseFogColor.clone().offsetHSL(0, 0, graphics.pulseIntensity * 0.15);
            graphics.scene.fog.color.copy(pulseColor);
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
