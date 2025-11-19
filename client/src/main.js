import * as THREE from 'three';
import { Graphics } from './graphics.js';
import { TrackGenerator } from './track/TrackGenerator.js';
import { TrackEffects } from './track/TrackEffects.js';
import { Car } from './car.js';
import { Network } from './network.js';
import { AudioPreprocessor } from './audio/AudioPreprocessor.js';

async function init() {
    // ===========================
    // UI OVERLAY
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
    // DEBUG UI
    // ===========================
    const debugUI = document.createElement('div');
    debugUI.style.position = 'absolute';
    debugUI.style.top = '10px';
    debugUI.style.left = '10px';
    debugUI.style.color = 'lime';
    debugUI.style.fontFamily = 'monospace';
    debugUI.style.fontSize = '14px';
    debugUI.style.zIndex = '10000';
    document.body.appendChild(debugUI);

    // ===========================
    // AUDIO FEATURE LOAD
    // ===========================
    const response = await fetch('/audio_features.json');
    const audioFeatures = await response.json();

    // ===========================
    // GRAPHICS + STARFIELD + FOG
    // ===========================
    const graphics = new Graphics();
    graphics.setupFog(audioFeatures.valence);

    // ===========================
    // TRACK GENERATION
    // ===========================
    const trackGen = new TrackGenerator(graphics.scene);
    const trackData = trackGen.generate();
    const trackCurve = trackData.curve;
    const frenetFrames = trackData.frames;
    const trackEffects = new TrackEffects(trackGen.mesh);

    // ===========================
    // AUDIO PRE-PROCESSOR
    // ===========================
    const audioPreprocessor = new AudioPreprocessor();
    let audioBuffer = null;
    let audioTimeline = null;
    let audioSource = null;
    let audioStartTime = 0;

    try {
        const result = await audioPreprocessor.load('/assets/music/Children.mp3');
        const analysis = audioPreprocessor.analyze(result);

        audioBuffer = analysis.buffer;
        audioTimeline = analysis.timeline;

        console.log('Audio ready');
    } catch (e) {
        console.error('Failed to load audio:', e);
    }

    // ===========================
    // NETWORK
    // ===========================
    const network = new Network();

    let localCar = null;
    const remoteCars = new Map();
    let gameState = 'WAITING';

    // ===========================
    // COUNTDOWN SOUNDS
    // ===========================
    function playBeep(freq = 440, duration = 0.1) {
        const osc = audioPreprocessor.audioContext.createOscillator();
        const gain = audioPreprocessor.audioContext.createGain();
        osc.connect(gain);
        gain.connect(audioPreprocessor.audioContext.destination);
        osc.frequency.value = freq;
        osc.start();
        gain.gain.exponentialRampToValueAtTime(0.00001, audioPreprocessor.audioContext.currentTime + duration);
        osc.stop(audioPreprocessor.audioContext.currentTime + duration);
    }

    // ===========================
    // NETWORK CALLBACKS
    // ===========================
    network.onPlayerJoined = (playerData) => {
        const car = new Car(graphics.scene, playerData.color, false);
        remoteCars.set(playerData.id, car);
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
            uiOverlay.innerText = 'WAITING FOR PLAYERS...';
            uiOverlay.style.fontSize = '48px';
            if (audioSource) {
                audioSource.stop();
                audioSource = null;
            }
        } else if (state === 'PLAYING') {
            uiOverlay.innerText = 'GO!';
            uiOverlay.style.fontSize = '150px';
            playBeep(880, 0.3);
            setTimeout(() => uiOverlay.innerText = '', 1000);

            const delay = startTime - Date.now();
            if (delay > 0) setTimeout(() => startMusic(), delay);
            else startMusic(Math.abs(delay) / 1000);
        }
    };

    // ===========================
    // COUNTDOWN
    // ===========================
    network.onCountdown = (duration) => {
        let count = duration;
        uiOverlay.innerText = count;

        const interval = setInterval(() => {
            count--;
            if (count > 0) {
                uiOverlay.innerText = count;
            } else {
                clearInterval(interval);
            }
        }, 1000);
    };

    // ===========================
    // CONNECT TO SERVER
    // ===========================
    network.connect();

    // ===========================
    // LOCAL CAR SPAWN (WITH SERVER)
    // ===========================
    const checkInit = setInterval(() => {
        if (network.id) {
            clearInterval(checkInit);
            localCar = new Car(graphics.scene, network.color, true);
            localCar.trackProgress = Math.random() * 0.05;

            network.players.forEach(p => {
                if (!remoteCars.has(p.id)) {
                    remoteCars.set(p.id, new Car(graphics.scene, p.color, false));
                }
            });
        }
    }, 100);

    // ===========================
    // OFFLINE FALLBACK CAR SPAWN
    // ===========================
    setTimeout(() => {
        if (!localCar) {
            console.warn("OFFLINE MODE: No server detected, spawning local car.");
            localCar = new Car(graphics.scene, 0xff0000, true);
            localCar.trackProgress = 0.01;
            gameState = "PLAYING";        // allow movement
            uiOverlay.innerText = "";     // remove WAITING text
        }
    }, 2000);

    // ===========================
    // MUSIC SYNC
    // ===========================
    function startMusic(offset = 0) {
        if (!audioBuffer) return;

        if (audioSource) try { audioSource.stop(); } catch (e) { }

        audioSource = audioPreprocessor.audioContext.createBufferSource();
        audioSource.buffer = audioBuffer;
        audioSource.connect(audioPreprocessor.audioContext.destination);
        audioSource.start(0, offset);

        audioStartTime = audioPreprocessor.audioContext.currentTime - offset;
    }

    // ===========================
    // GAME LOOP
    // ===========================
    const clock = new THREE.Clock();

    function animate() {
        requestAnimationFrame(animate);

        const dt = clock.getDelta();
        const time = clock.getElapsedTime();

        debugUI.innerHTML = `
        State: ${gameState}<br>
        Players: ${remoteCars.size + (localCar ? 1 : 0)}<br>
        Speed: ${localCar ? localCar.speed.toFixed(1) : 0}<br>
        Progress: ${localCar ? localCar.trackProgress.toFixed(3) : 0}
        `;

        let currentAudioData = { timelineEvent: null, realtimeEnergy: 0 };

        if (audioSource && audioTimeline && gameState === 'PLAYING') {
            const t = audioPreprocessor.audioContext.currentTime - audioStartTime;
            const hit = audioTimeline.find(e => Math.abs(e.time - t) < 0.1);
            if (hit) currentAudioData.timelineEvent = hit;
        }

        trackEffects.update(time, currentAudioData);

        // ===========================
        // LOCAL CAR UPDATE
        // ===========================
        if (localCar) {
            // DEBUG FIX: allow movement even without gameState === PLAYING
            const canMove = true;

            localCar.update(dt, { trackCurve, frames: frenetFrames, canMove });

            // CAMERA CHASE
            const idealOffset = new THREE.Vector3(0, 5, -10)
                .applyQuaternion(localCar.mesh.quaternion)
                .add(localCar.mesh.position);

            const idealLookat = new THREE.Vector3(0, 2, 10)
                .applyQuaternion(localCar.mesh.quaternion)
                .add(localCar.mesh.position);

            graphics.camera.position.lerp(idealOffset, dt * 3.0);
            graphics.camera.lookAt(idealLookat);

            // NETWORK SYNC
            network.sendUpdate({
                x: localCar.mesh.position.x,
                y: localCar.mesh.position.y,
                z: localCar.mesh.position.z,
                qx: localCar.mesh.quaternion.x,
                qy: localCar.mesh.quaternion.y,
                qz: localCar.mesh.quaternion.z,
                qw: localCar.mesh.quaternion.w,
                velocity: localCar.speed
            });
        }

        // ===========================
        // REMOTE CARS
        // ===========================
        remoteCars.forEach((car, id) => {
            const data = network.players.get(id);
            if (!data) return;

            car.setTarget(
                data.targetX || data.x,
                data.targetY || data.y,
                data.targetZ || data.z,
                data.qx,
                data.qy,
                data.qz,
                data.qw
            );

            car.update(dt, { trackCurve, frames: frenetFrames });
        });

        graphics.render();
    }

    animate();
}

init();
