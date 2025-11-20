import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class Car {
    constructor(scene, color, isLocal = false, modelName = 'mercedes.glb', name = 'Player') {
        this.scene = scene;
        this.isLocal = isLocal;
        this.name = name;

        this.mesh = new THREE.Group();
        this.scene.add(this.mesh);

        this.addNameTag(name);

        //-----------------------------------
        // LOAD MODEL
        //-----------------------------------
        const loader = new GLTFLoader();
        loader.load(
            `/assets/models/${modelName}`,
            (gltf) => {
                const model = gltf.scene;
                
                // Adjust scale based on model
                if (modelName.toLowerCase().includes('volvo')) {
                    model.scale.set(1.7, 1.7, 1.7);
                } else {
                    model.scale.set(2, 2, 2);
                }

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                this.mesh.add(model);

                // SMART WHEEL DETECTION
                const potentialWheels = [];
                model.traverse((child) => {
                    if (child.isMesh && (child.name.toLowerCase().includes('wheel') || child.name.toLowerCase().includes('tire'))) {
                        potentialWheels.push(child);
                    }
                });

                if (potentialWheels.length >= 4) {
                    // Sort by Z
                    potentialWheels.sort((a, b) => a.getWorldPosition(new THREE.Vector3()).z - b.getWorldPosition(new THREE.Vector3()).z);

                    const front = potentialWheels.slice(0, 2); // Fronts are usually lower Z (negative)
                    const rear = potentialWheels.slice(2, 4);  // Rears are higher Z

                    // Sort Left/Right by X
                    front.sort((a, b) => b.getWorldPosition(new THREE.Vector3()).x - a.getWorldPosition(new THREE.Vector3()).x);
                    rear.sort((a, b) => b.getWorldPosition(new THREE.Vector3()).x - a.getWorldPosition(new THREE.Vector3()).x);

                    this.wheels = {
                        fl: front[0], // Left is usually +X
                        fr: front[1], // Right is usually -X
                        rl: rear[0],
                        rr: rear[1]
                    };
                    this.hasWheels = true;
                    console.log('Wheels found and assigned:', this.wheels);
                } else {
                    console.warn('Could not auto-detect wheels. Found:', potentialWheels.map(w => w.name));
                    this.hasWheels = false;
                }
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

        this.TRACK_WIDTH = 7.0; // Increased to allow 3-wide grid spawning (road width is 15)

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
        
        // SWITCHING TO SPRITES FOR SMOKE
        const smokeTexture = this.createSmokeTexture();
        this.smokeMat = new THREE.PointsMaterial({
            size: 4.0,
            map: smokeTexture,
            transparent: true,
            opacity: 0.3, // Lower opacity for less bright look
            depthWrite: false,
            sizeAttenuation: true,
            vertexColors: false,
            blending: THREE.NormalBlending,
            color: 0xbbbbbb // Slightly darker grey base
        });
        this.smokeSystem = new THREE.Points(smokeGeo, this.smokeMat);
        this.smokeSystem.frustumCulled = false;
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
        this.flameSystem.frustumCulled = false;
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
        this.sparkSystem.frustumCulled = false;
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
        this.skidSystem.frustumCulled = false;
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
        this.speedLineSystem.frustumCulled = false;
        this.scene.add(this.speedLineSystem);
    }

    createSmokeTexture() {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        
        const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
        gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)'); // Reduced from 1.0
        gradient.addColorStop(0.4, 'rgba(200, 200, 200, 0.4)'); // Darker and more transparent
        gradient.addColorStop(1, 'rgba(100, 100, 100, 0)');
        
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, 64, 64);
        
        const texture = new THREE.CanvasTexture(canvas);
        return texture;
    }

    addNameTag(name) {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 256;
        canvas.height = 64;

        ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.font = 'bold 32px Arial';
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name, 128, 32);

        const texture = new THREE.CanvasTexture(canvas);
        const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
        const sprite = new THREE.Sprite(spriteMaterial);

        sprite.position.y = 2.5;
        sprite.scale.set(2, 0.5, 1);

        this.mesh.add(sprite);
    }

    onKey(event, pressed) {
        const key = event.key.toLowerCase();
        if (this.keys.hasOwnProperty(key)) {
            this.keys[key] = pressed;
        }
        if (key === ' ') this.keys.space = pressed;
    }

    update(dt, context = {}) {
        const { trackCurve, frames, canMove = true } = context;

        if (!this.isLocal) {
            this.updateRemote(dt);
            return;
        }
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
            (this.keys.d ? 1 : 0);

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
            .add(upVector.clone().multiplyScalar(0.35)); // Fix: Lowered from 0.9 to 0.35

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
        // spawn around rear wheels with offset
        const base = carPos.clone().add(up.clone().multiplyScalar(-0.4));

        const count = 2 + Math.floor(intensity * 3); // Fewer but larger particles
        for (let i = 0; i < count; i++) {
            const offsetSide = (Math.random() < 0.5 ? -1 : 1) * (0.8 + Math.random() * 0.3);
            const pos = base.clone().add(normal.clone().multiplyScalar(offsetSide));
            
            // Randomize position slightly
            pos.x += (Math.random() - 0.5) * 0.5;
            pos.z += (Math.random() - 0.5) * 0.5;

            const p = {
                pos: pos,
                vel: new THREE.Vector3(
                    (Math.random() - 0.5) * 0.5, // Sideways spread
                    0.5 + Math.random() * 0.8,   // Upward speed (faster initially)
                    (Math.random() - 0.5) * 0.5  // Forward/Back spread
                ),
                life: 2.0 + Math.random() * 1.0, // Longer life
                maxLife: 2.0 + Math.random() * 1.0,
                size: 1.0 + Math.random() * 1.5, // Initial size variation
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 2.0,
                opacity: 0.4 + Math.random() * 0.2 // Initial opacity
            };
            
            if (this.smokeParticles.length > 400) this.smokeParticles.shift(); // Limit count
            this.smokeParticles.push(p);
        }
    }

    updateSmoke(dt) {
        const positions = [];
        const sizes = [];
        const colors = [];
        const opacities = []; // We'll store opacity in alpha channel or color

        // Reuse arrays or typed arrays would be better for performance in large systems,
        // but for this count it's fine.

        for (let i = this.smokeParticles.length - 1; i >= 0; i--) {
            const p = this.smokeParticles[i];
            p.life -= dt;

            if (p.life <= 0) {
                this.smokeParticles.splice(i, 1);
                continue;
            }

            // Physics
            p.pos.add(p.vel.clone().multiplyScalar(dt));
            p.vel.y *= 0.95; // Slow down upward
            p.vel.x *= 0.98; // Drag
            p.vel.z *= 0.98;
            p.rotation += p.rotSpeed * dt;

            // Growth
            const lifeRatio = 1.0 - (p.life / p.maxLife); // 0 to 1
            const currentSize = p.size * (1.0 + lifeRatio * 4.0); // Grow significantly

            // Fade
            const alpha = p.opacity * (1.0 - Math.pow(lifeRatio, 3.0)); // Non-linear fade out

            // Update global opacity if we can't do per-particle (PointsMaterial limitation)
            // Since we can't do per-particle opacity easily without custom shader/attributes,
            // and we are using a single material, the material opacity affects ALL particles.
            // This is a limitation of standard THREE.PointsMaterial without vertex colors/alphas.
            
            // WORKAROUND: We will just use the base material opacity and let particles die naturally.
            // Or we can enable vertexColors and set alpha if the material supports it (PointsMaterial does not support alpha per vertex easily in WebGL1/standard three without custom shader hacks).
            
            // However, since we want them to fade out, we can simulate it by scaling them down or just accepting they pop out at end of life?
            // No, "p.life" handles removal.
            
            // Better visual hack: We lowered the base opacity to 0.3.
            // The texture has a gradient.
            
            positions.push(p.pos.x, p.pos.y, p.pos.z);
        }
        
        // Update the geometry
        if (this.smokeSystem && this.smokeSystem.geometry) {
            this.smokeSystem.geometry.setAttribute(
                'position',
                new THREE.Float32BufferAttribute(positions, 3)
            );
            this.smokeSystem.geometry.attributes.position.needsUpdate = true;
            // this.smokeMat.opacity = 0.85; // REMOVE THIS OVERRIDE so our lower 0.3 sticks
        }
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
        // Fix: Move further back (was -1.5) to avoid spawning inside the car mesh
        const backOffset = forwardDir.clone().multiplyScalar(-3.5);
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

    updateRemote(dt) {
        // Remote cars just need particle updates
        this.updateSmoke(dt);
        this.updateFlames(dt);
        this.updateSparks(dt);
        this.updateSkidmarks(dt);
        this.updateSpeedLines(dt);
    }
}
