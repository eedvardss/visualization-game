import * as THREE from 'three';

export class TrackEffects {
    constructor(trackMesh, scene) {
        this.trackMesh = trackMesh;
        this.scene = scene || trackMesh.parent; // Fallback if scene not passed directly
        this.material = trackMesh.material;

        // 1. BEAT ORBS (Planets)
        this.orbs = [];
        this.initOrbs();

        // 2. SHOCKWAVE RINGS
        this.rings = [];
        this.ringGeo = new THREE.RingGeometry(1, 1.2, 32);
        this.ringMat = new THREE.MeshBasicMaterial({
            color: 0x00ffff,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0
        });

        // 3. EQUALIZER PILLARS
        this.pillars = null;
        this.initPillars();
    }

    initOrbs() {
        const orbGeo = new THREE.IcosahedronGeometry(10, 2);
        const orbMat = new THREE.MeshBasicMaterial({
            color: 0xff00ff,
            wireframe: true,
            transparent: true,
            opacity: 0.5
        });

        // Create 3 orbs at different positions
        const positions = [
            { x: 0, y: 60, z: -100, scale: 2.0, color: 0x00ffff },
            { x: -80, y: 40, z: 50, scale: 1.5, color: 0xff00ff },
            { x: 80, y: 50, z: 0, scale: 1.8, color: 0xffff00 }
        ];

        positions.forEach(pos => {
            const mat = orbMat.clone();
            mat.color.setHex(pos.color);

            const orb = new THREE.Mesh(orbGeo, mat);
            orb.position.set(pos.x, pos.y, pos.z);
            orb.originalScale = pos.scale;
            orb.scale.setScalar(pos.scale);

            this.scene.add(orb);
            this.orbs.push({ mesh: orb, speed: Math.random() * 0.5 + 0.2 });
        });
    }

    initPillars() {
        const count = 40;
        const geo = new THREE.BoxGeometry(2, 10, 2);
        const mat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
        this.pillars = new THREE.InstancedMesh(geo, mat, count);

        const dummy = new THREE.Object3D();
        const radius = 60; // Circle around the center

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            dummy.position.set(x, -10, z); // Start low
            dummy.lookAt(0, 0, 0);
            dummy.updateMatrix();
            this.pillars.setMatrixAt(i, dummy.matrix);
        }

        this.scene.add(this.pillars);
    }

    spawnShockwave() {
        // Find a dead ring or create new
        let ring = this.rings.find(r => !r.visible);
        if (!ring) {
            ring = new THREE.Mesh(this.ringGeo, this.ringMat.clone());
            ring.rotation.x = -Math.PI / 2;
            this.scene.add(ring);
            this.rings.push(ring);
        }

        // Reset ring
        ring.visible = true;
        ring.scale.setScalar(1);
        ring.material.opacity = 1.0;
        ring.position.copy(this.trackMesh.position); // Center of world usually, or track center
        ring.position.y = 5; // Slightly above ground
    }

    update(time, audioData) {
        const dt = 0.016; // Approx dt

        // Update Track Shader
        if (this.material.uniforms) {
            this.material.uniforms.uTime.value = time;

            let beat = 0;
            if (audioData.timelineEvent && audioData.timelineEvent.type === 'beat') {
                beat = 1.0;
                this.spawnShockwave(); // Spawn ring on beat
            }

            this.material.uniforms.uBeat.value = THREE.MathUtils.lerp(
                this.material.uniforms.uBeat.value,
                beat,
                0.1
            );
        }

        // Use realtime energy if available, otherwise fallback to beat pulse
        const energy = audioData.realtimeEnergy > 0 ? audioData.realtimeEnergy : (this.material.uniforms ? this.material.uniforms.uBeat.value : 0);

        // Update Orbs
        this.orbs.forEach(orb => {
            orb.mesh.rotation.y += dt * orb.speed;
            orb.mesh.rotation.z += dt * orb.speed * 0.5;

            const scale = orb.mesh.originalScale * (1 + energy * 1.5);
            orb.mesh.scale.setScalar(scale);
        });

        // Update Shockwaves
        this.rings.forEach(ring => {
            if (ring.visible) {
                ring.scale.multiplyScalar(1.05); // Expand
                ring.material.opacity -= 0.02; // Fade
                if (ring.material.opacity <= 0) {
                    ring.visible = false;
                }
            }
        });

        // Update Pillars
        if (this.pillars) {
            const dummy = new THREE.Object3D();
            const count = this.pillars.count;
            const radius = 60;

            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + time * 0.2; // Rotate slowly
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;

                // Wave pattern
                const wave = Math.sin(i * 0.5 + time * 2) * 0.5 + 0.5;
                const height = 5 + wave * 20 * (1 + energy * 3.0); // Scale height with energy

                dummy.position.set(x, height / 2 - 10, z);
                dummy.scale.set(1, height / 10, 1);
                dummy.lookAt(0, 0, 0);
                dummy.updateMatrix();
                this.pillars.setMatrixAt(i, dummy.matrix);
            }
            this.pillars.instanceMatrix.needsUpdate = true;
        }
    }
}
