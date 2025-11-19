import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Car {
    constructor(scene, color, isLocal = false) {
        this.scene = scene;
        this.isLocal = isLocal;

        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);

        //-----------------------------------
        // LOAD MODEL
        //-----------------------------------
        const loader = new GLTFLoader();
        loader.load(
            '/assets/models/mercedes.glb',
            (gltf) => {
                const model = gltf.scene;
                model.scale.set(2, 2, 2);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.mesh.add(model);
                this.model = model;

                // Try to find wheels by name (optional)
                this.wheels = {
                    fl: model.getObjectByName('Wheel_FL'),
                    fr: model.getObjectByName('Wheel_FR'),
                    rl: model.getObjectByName('Wheel_RL'),
                    rr: model.getObjectByName('Wheel_RR'),
                };
                this.hasWheels =
                    this.wheels.fl && this.wheels.fr &&
                    this.wheels.rl && this.wheels.rr;
            },
            undefined,
            (err) => {
                console.error('Car model failed, using box:', err);
                const box = new THREE.Mesh(
                    new THREE.BoxGeometry(1.5, 0.5, 3),
                    new THREE.MeshStandardMaterial({ color })
                );
                this.mesh.add(box);
                this.model = box;
                this.hasWheels = false;
            }
        );

        //-----------------------------------
        // DRIVING STATE
        //-----------------------------------
        this.speed = 0;
        this.headingAngle = 0;   // full 360
        this.trackProgress = 0;
        this.lateralOffset = 0;

        //-----------------------------------
        // TUNING CONSTANTS
        //-----------------------------------
        this.BASE_MAX_SPEED = 95;
        this.MAX_SPEED = this.BASE_MAX_SPEED;
        this.ACCEL = 45;
        this.BRAKE = 55;
        this.DRAG = 0.97;

        this.STEER_RATE = 7.0;
        this.HEADING_FRICTION = 0.10;
        this.SIDEWAYS_FACTOR = 1.2;

        this.TRACK_WIDTH = 6.0;

        //-----------------------------------
        // DRIFT + NITRO
        //-----------------------------------
        this.keys = {
            w: false,
            s: false,
            a: false,
            d: false,
            space: false,
            shift: false,
        };
        if (isLocal) {
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
}

        this.driftMode = false;

        this.DRIFT_GRIP = 0.4;
        this.DRIFT_STEER_MULT = 2.0;
        this.DRIFT_SMOKE_MULT = 3.0;

        // Nitro
        this.NITRO_MAX_SPEED = 140;
        this.NITRO_ACCEL_MULT = 1.7;

        this.wasAccelerating = false; // for backfire

        //-----------------------------------
        // SMOKE PARTICLES (DRIFT)
        //-----------------------------------
        this.smokeParticles = [];
        const smokeGeo = new THREE.BufferGeometry();
        smokeGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.smokeMat = new THREE.PointsMaterial({
            size: 2.4,
            color: 0xaaaaaa,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
            sizeAttenuation: true,
        });
        this.smokeSystem = new THREE.Points(smokeGeo, this.smokeMat);
        this.scene.add(this.smokeSystem);

        //-----------------------------------
        // FLAME PARTICLES (BACKFIRE / NITRO)
        //-----------------------------------
        this.flameParticles = [];
        const flameGeo = new THREE.BufferGeometry();
        flameGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.flameMat = new THREE.PointsMaterial({
            size: 1.2,
            color: 0x33aaff,  // blue-ish nitro flames
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            sizeAttenuation: true,
        });
        this.flameSystem = new THREE.Points(flameGeo, this.flameMat);
        this.scene.add(this.flameSystem);

        //-----------------------------------
        // SPARK PARTICLES (EXHAUST / NITRO)
        //-----------------------------------
        this.sparkParticles = [];
        const sparkGeo = new THREE.BufferGeometry();
        sparkGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.sparkMat = new THREE.PointsMaterial({
            size: 0.6,
            color: 0xffdd88,
            transparent: true,
            opacity: 1.0,
            depthWrite: false,
            sizeAttenuation: true,
        });
        this.sparkSystem = new THREE.Points(sparkGeo, this.sparkMat);
        this.scene.add(this.sparkSystem);

        //-----------------------------------
        // SKIDMARK PARTICLES (ON ROAD)
        //-----------------------------------
        this.skidParticles = [];
        const skidGeo = new THREE.BufferGeometry();
        skidGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.skidMat = new THREE.PointsMaterial({
            size: 0.8,
            color: 0x111111,
            transparent: true,
            opacity: 0.7,
            depthWrite: true,
            sizeAttenuation: true,
        });
        this.skidSystem = new THREE.Points(skidGeo, this.skidMat);
        this.scene.add(this.skidSystem);

        //-----------------------------------
        // SPEED LINES (FAKE MOTION BLUR)
        //-----------------------------------
        this.speedLineParticles = [];
        const speedLineGeo = new THREE.BufferGeometry();
        speedLineGeo.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        this.speedLineMat = new THREE.PointsMaterial({
            size: 2.5,
            color: 0xffffff,
            transparent: true,
            opacity: 0.7,
            depthWrite: false,
            sizeAttenuation: true,
        });
        this.speedLineSystem = new THREE.Points(speedLineGeo, this.speedLineMat);
        this.scene.add(this.speedLineSystem);
    }

    onKey(e, pressed) {
        const k = e.key.toLowerCase();
        if (k === ' ') {
            this.keys.space = pressed;
        } else if (k === 'shift') {
            this.keys.shift = pressed;
        } else if (k in this.keys) {
            this.keys[k] = pressed;
        }
    }

    //-----------------------------------
    // MAIN UPDATE
    //-----------------------------------
    update(dt, { trackCurve, frames, canMove = true }) {
        if (!this.isLocal) return;
        if (!trackCurve || !frames) return;

        if (!this._trackLength) {
            this._trackLength = trackCurve.getLength();
        }

        const frameCount = frames.tangents.length;

        //-----------------------------------
        // DRIFT / NITRO STATE
        //-----------------------------------
        this.driftMode = this.keys.space;
        const nitroActive = this.keys.shift && this.speed > 10;

        // Nitro adjusts effective top speed and acceleration
        this.MAX_SPEED = nitroActive ? this.NITRO_MAX_SPEED : this.BASE_MAX_SPEED;

        //-----------------------------------
        // SPEED
        //-----------------------------------
        if (canMove) {
            if (this.keys.w) {
                const accelMult = nitroActive ? this.NITRO_ACCEL_MULT : 1.0;
                this.speed += this.ACCEL * accelMult * dt;
            }
            if (this.keys.s) this.speed -= this.BRAKE * dt;
        }

        this.speed *= this.DRAG;
        this.speed = THREE.MathUtils.clamp(this.speed, -this.MAX_SPEED, this.MAX_SPEED);

        //-----------------------------------
        // THROTTLE RELEASE → BACKFIRE FLAMES
        //-----------------------------------
        const acceleratingNow = this.keys.w;
        if (this.wasAccelerating && !acceleratingNow && this.speed > 25) {
            this.spawnBackfireFlames();
        }
        this.wasAccelerating = acceleratingNow;

        //-----------------------------------
        // STEERING
        //-----------------------------------
        const steerInput =
            (this.keys.a ? -1 : 0) +
            (this.keys.d ?  1 : 0);

        const speedFactor = THREE.MathUtils.clamp(Math.abs(this.speed) / this.MAX_SPEED, 0.1, 1.0);
        const steerMult = this.driftMode ? this.DRIFT_STEER_MULT : 1.0;

        this.headingAngle += steerInput * this.STEER_RATE * steerMult * speedFactor * dt;
        this.headingAngle = THREE.MathUtils.lerp(
            this.headingAngle,
            0,
            this.HEADING_FRICTION * dt
        );
        // no clamp → full 360 possible

        //-----------------------------------
        // SAMPLE TRACK FRAME
        //-----------------------------------
        const f = this.trackProgress * (frameCount - 1);
        const i = Math.floor(f);
        const t = f - i;
        const i2 = (i + 1) % frameCount;

        const tangent = frames.tangents[i].clone().lerp(frames.tangents[i2], t).normalize();
        const normal = frames.normals[i].clone().lerp(frames.normals[i2], t).normalize();
        const binormal = frames.binormals[i].clone().lerp(frames.binormals[i2], t).normalize();
        const upVector = binormal.clone().negate();

        //-----------------------------------
        // MOVEMENT IN TRACK SPACE
        //-----------------------------------
        const cosH = Math.cos(this.headingAngle);
        const sinH = Math.sin(this.headingAngle);

        const forwardDir = tangent.clone().multiplyScalar(cosH)
            .add(normal.clone().multiplyScalar(sinH))
            .normalize();

        const travel = this.speed * dt;

        const grip = this.driftMode ? this.DRIFT_GRIP : 1.0;

        const alongTrack = travel * cosH;
        const sideways = travel * sinH * this.SIDEWAYS_FACTOR * grip;

        this.trackProgress = (this.trackProgress + alongTrack / this._trackLength) % 1;
        if (this.trackProgress < 0) this.trackProgress += 1;

        this.lateralOffset += sideways;
        this.lateralOffset = THREE.MathUtils.clamp(
            this.lateralOffset,
            -this.TRACK_WIDTH,
            this.TRACK_WIDTH
        );

        //-----------------------------------
        // POSITION
        //-----------------------------------
        const centerPoint = trackCurve.getPointAt(this.trackProgress);
        const pos = centerPoint
            .clone()
            .add(normal.clone().multiplyScalar(this.lateralOffset))
            .add(upVector.clone().multiplyScalar(0.9));

        this.mesh.position.copy(pos);

        //-----------------------------------
        // ORIENTATION
        //-----------------------------------
        this.mesh.up.copy(upVector);
        this.mesh.lookAt(pos.clone().add(forwardDir));

        //-----------------------------------
        // WHEELS
        //-----------------------------------
        if (this.hasWheels) {
            const rot = this.speed * dt * 2.5;
            this.wheels.fl.rotation.x -= rot;
            this.wheels.fr.rotation.x -= rot;
            this.wheels.rl.rotation.x -= rot;
            this.wheels.rr.rotation.x -= rot;

            const wheelTurn = THREE.MathUtils.clamp(this.headingAngle, -0.5, 0.5);
            this.wheels.fl.rotation.y = wheelTurn;
            this.wheels.fr.rotation.y = wheelTurn;
        }

        //-----------------------------------
        // DRIFT SMOKE & SKIDMARKS
        //-----------------------------------
        const driftIntensity =
            Math.abs(sinH) *
            (Math.abs(this.speed) / this.MAX_SPEED) *
            (this.driftMode ? this.DRIFT_SMOKE_MULT : 1.0);

        if (driftIntensity > 0.25 && Math.abs(this.speed) > 10) {
            this.spawnDriftSmoke(pos, normal, upVector, driftIntensity);
            this.spawnSkidmarks(pos, normal, upVector, driftIntensity);
        }

        //-----------------------------------
        // NITRO FLAMES & SPARKS
        //-----------------------------------
        if (nitroActive && this.speed > 30) {
            this.spawnNitroFlamesAndSparks(pos, forwardDir, upVector);
        }

        //-----------------------------------
        // SPEED LINES (FAKE MOTION BLUR)
        //-----------------------------------
        const speedRatio = Math.abs(this.speed) / this.NITRO_MAX_SPEED;
        if (speedRatio > 0.4) {
            this.spawnSpeedLines(pos, forwardDir, upVector, speedRatio);
        }

        //-----------------------------------
        // UPDATE ALL PARTICLE SYSTEMS
        //-----------------------------------
        this.updateSmoke(dt);
        this.updateFlames(dt);
        this.updateSparks(dt);
        this.updateSkidmarks(dt);
        this.updateSpeedLines(dt);

        this.position = this.mesh.position;
    }

    //-----------------------------------
    // DRIFT SMOKE
    //-----------------------------------
    spawnDriftSmoke(carPos, normal, up, intensity) {
        // spawn around rear wheels
        const base = carPos.clone().add(up.clone().multiplyScalar(-0.3));

        const count = 4 + Math.floor(intensity * 6);
        for (let i = 0; i < count; i++) {
            const offsetSide = (Math.random() < 0.5 ? -1 : 1) * (0.9 + Math.random() * 0.4);
            const p = {
                pos: base.clone().add(normal.clone().multiplyScalar(offsetSide)),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.6,
                    0.4 + Math.random() * 0.3,
                    (Math.random() - 0.5) * 0.6
                ),
                life: 1.5,
            };
            if (this.smokeParticles.length > 500) this.smokeParticles.shift();
            this.smokeParticles.push(p);
        }
    }

    updateSmoke(dt) {
        const positions = [];

        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.life -= dt;
            if (p.life <= 0) {
                this.smokeParticles.splice(i, 1);
                continue;
            }

            p.pos.addScaledVector(p.vel, dt);
            p.vel.multiplyScalar(0.96);

            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }

        this.smokeSystem.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.smokeSystem.geometry.attributes.position.needsUpdate = true;
        this.smokeMat.opacity = 0.85;
    }

    //-----------------------------------
    // BACKFIRE FLAMES (ON THROTTLE RELEASE)
    //-----------------------------------
    spawnBackfireFlames() {
        const source = this.mesh.position.clone();
        for (let i = 0; i < 10; i++) {
            const p = {
                pos: source.clone().add(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    0.3 + Math.random() * 0.2,
                    -1.0 + Math.random() * 0.3
                )),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.6,
                    0.6 + Math.random() * 0.3,
                    -1.4 + Math.random() * 0.4
                ),
                life: 0.12,
            };
            if (this.flameParticles.length > 200) this.flameParticles.shift();
            this.flameParticles.push(p);
        }
    }

    //-----------------------------------
    // NITRO FLAMES + SPARKS
    //-----------------------------------
    spawnNitroFlamesAndSparks(carPos, forwardDir, up) {
        const backOffset = forwardDir.clone().multiplyScalar(-1.5);
        const base = carPos.clone()
            .add(backOffset)
            .add(up.clone().multiplyScalar(0.3));

        // blue flames
        for (let i = 0; i < 4; i++) {
            const p = {
                pos: base.clone().add(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    (Math.random() - 0.5) * 0.1,
                    (Math.random() - 0.5) * 0.3
                )),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.3,
                    0.4 + Math.random() * 0.3,
                    -1.2 + Math.random() * 0.3
                ),
                life: 0.15,
            };
            if (this.flameParticles.length > 200) this.flameParticles.shift();
            this.flameParticles.push(p);
        }

        // sparks
        for (let i = 0; i < 6; i++) {
            const p = {
                pos: base.clone().add(new THREE.Vector3(
                    (Math.random() - 0.5) * 0.4,
                    -0.1 + Math.random() * 0.2,
                    (Math.random() - 0.5) * 0.4
                )),
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 1.5,
                    1.5 + Math.random(),
                    (Math.random() - 0.5) * 1.5
                ),
                life: 0.25,
            };
            if (this.sparkParticles.length > 250) this.sparkParticles.shift();
            this.sparkParticles.push(p);
        }
    }

    updateFlames(dt) {
        const positions = [];

        for (let i = this.flameParticles.length - 1; i >= 0; i--) {
            const p = this.flameParticles[i];
            p.life -= dt * 3.0;
            if (p.life <= 0) {
                this.flameParticles.splice(i, 1);
                continue;
            }

            p.pos.addScaledVector(p.vel, dt);
            p.vel.multiplyScalar(0.9);

            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }

        this.flameSystem.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.flameSystem.geometry.attributes.position.needsUpdate = true;
        this.flameMat.opacity = 0.9;
    }

    updateSparks(dt) {
        const positions = [];

        for (let i = this.sparkParticles.length - 1; i >= 0; i--) {
            const p = this.sparkParticles[i];
            p.life -= dt * 3.0;
            if (p.life <= 0) {
                this.sparkParticles.splice(i, 1);
                continue;
            }

            p.pos.addScaledVector(p.vel, dt);
            p.vel.multiplyScalar(0.85);

            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }

        this.sparkSystem.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.sparkSystem.geometry.attributes.position.needsUpdate = true;
        this.sparkMat.opacity = 1.0;
    }

    //-----------------------------------
    // SKIDMARKS
    //-----------------------------------
    spawnSkidmarks(carPos, normal, up, intensity) {
        const base = carPos.clone().add(up.clone().multiplyScalar(-0.5));
        const count = 2 + Math.floor(intensity * 3);

        for (let i = 0; i < count; i++) {
            const sideOffset = (Math.random() < 0.5 ? -1 : 1) * (0.7 + Math.random() * 0.4);
            const p = {
                pos: base.clone().add(normal.clone().multiplyScalar(sideOffset)),
                vel: new THREE.Vector3(0, 0, 0),
                life: 3.0,
            };
            if (this.skidParticles.length > 400) this.skidParticles.shift();
            this.skidParticles.push(p);
        }
    }

    updateSkidmarks(dt) {
        const positions = [];

        for (let i = this.skidParticles.length - 1; i >= 0; i--) {
            const p = this.skidParticles[i];
            p.life -= dt * 0.4;
            if (p.life <= 0) {
                this.skidParticles.splice(i, 1);
                continue;
            }

            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }

        this.skidSystem.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.skidSystem.geometry.attributes.position.needsUpdate = true;
        this.skidMat.opacity = 0.6;
    }

    //-----------------------------------
    // SPEED LINES (FAKE MOTION BLUR)
    //-----------------------------------
    spawnSpeedLines(carPos, forwardDir, up, speedRatio) {
        const count = 4 + Math.floor(speedRatio * 10);
        const sideDir = new THREE.Vector3().crossVectors(up, forwardDir).normalize();

        for (let i = 0; i < count; i++) {
            const ringRadius = 4 + Math.random() * 3;
            const angle = Math.random() * Math.PI * 2;

            const radialOffset = sideDir
                .clone()
                .multiplyScalar(Math.cos(angle) * ringRadius)
                .add(up.clone().multiplyScalar(Math.sin(angle) * ringRadius * 0.3));

            const p = {
                pos: carPos.clone().add(radialOffset),
                vel: forwardDir.clone().multiplyScalar(-20 - speedRatio * 20), // streaks go opposite direction
                life: 0.3,
            };

            if (this.speedLineParticles.length > 300) this.speedLineParticles.shift();
            this.speedLineParticles.push(p);
        }
    }

    updateSpeedLines(dt) {
        const positions = [];

        for (let i = this.speedLineParticles.length - 1; i >= 0; i--) {
            const p = this.speedLineParticles[i];
            p.life -= dt * 3.0;
            if (p.life <= 0) {
                this.speedLineParticles.splice(i, 1);
                continue;
            }

            p.pos.addScaledVector(p.vel, dt);

            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }

        this.speedLineSystem.geometry.setAttribute(
            'position',
            new THREE.Float32BufferAttribute(positions, 3)
        );
        this.speedLineSystem.geometry.attributes.position.needsUpdate = true;
        this.speedLineMat.opacity = 0.7;
    }

    //-----------------------------------
    // REMOTE SYNC
    //-----------------------------------
    setTarget(x, y, z, qx, qy, qz, qw) {
        this.mesh.position.set(x, y, z);
        this.mesh.quaternion.set(qx, qy, qz, qw);
    }
}
