import * as THREE from 'three';
import { GlobeGrass } from './GlobeGrass.js';

// Lightweight globe mode controller: builds a cartoon planet, coins, and lava pools.
export class GlobeMode {
    constructor(scene, network) {
        this.scene = scene;
        this.network = network;
        this.center = new THREE.Vector3(0, 0, 0);
        this.radius = 120;
        this.planet = null;
        this.grass = null; // New Grass Controller
        this.coins = [];
        this.lavaPools = [];
        this.collected = 0;
        this.onCollect = null;
        this.onHazard = null;
        this.coinColor = 0xffd447;
        this.lavaColor = 0xff5f3d;

        if (this.network) {
            this.network.onCoinCollected = (data) => {
                this.handleRemoteCollect(data.coinIndex);
            };
        }
    }

    start(opts = {}) {
        this.radius = opts.radius || 120;
        this.center.copy(opts.center || new THREE.Vector3(0, 0, 0));
        this.clear();
        this.buildPlanet();
        this.buildCoins(opts.coinCount || 28);
        this.buildLava(opts.lavaCount || 6);
        this.collected = 0;
        if (this.onCollect) this.onCollect(this.collected, this.coins.length);
    }

    clear() {
        const drop = (obj) => {
            if (!obj) return;
            if (obj.parent) obj.parent.remove(obj);
            if (obj.geometry) obj.geometry.dispose();
            if (obj.material) {
                if (Array.isArray(obj.material)) obj.material.forEach(m => m.dispose());
                else obj.material.dispose();
            }
        };
        if (this.planet) drop(this.planet);
        if (this.grass) this.grass.dispose(); // Use dispose method
        this.coins.forEach(c => drop(c.mesh));
        this.lavaPools.forEach(l => drop(l.mesh));
        this.planet = null;
        this.grass = null;
        this.coins = [];
        this.lavaPools = [];
    }

    buildPlanet() {
        const geo = new THREE.SphereGeometry(this.radius, 64, 64);
        const mat = new THREE.MeshToonMaterial({
            color: 0x88ff66, // Lighter Cartoon Green
            emissive: 0x225511, // Slight emissive to ensure it's never too dark
            side: THREE.DoubleSide
        });
        this.planet = new THREE.Mesh(geo, mat);
        this.scene.add(this.planet);

        // Advanced Grass
        this.grass = new GlobeGrass(this.scene, this.radius, this.center, 200000);

        // Realistic trees
        for (let i = 0; i < 50; i++) {
            const spot = this.spawnOnSurface(this.radius);
            const trunkH = 3 + Math.random() * 2; // Slightly shorter trunks
            const up = spot.pos.clone().normalize();

            // Trunk
            const trunk = new THREE.Mesh(
                new THREE.CylinderGeometry(0.6, 1.0, trunkH, 6),
                new THREE.MeshStandardMaterial({ color: 0x5C4033 })
            );
            // Sink trunk base by 1.0. Center is at (trunkH/2 - 1.0)
            trunk.position.copy(spot.pos.clone().add(up.clone().multiplyScalar(trunkH / 2 - 1.0)));
            trunk.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
            this.scene.add(trunk);

            // Leaves - 2 layers for realism
            const leavesMat = new THREE.MeshStandardMaterial({ color: 0x228B22, flatShading: true });

            // Bottom Layer
            const l1H = 5;
            const l1 = new THREE.Mesh(new THREE.ConeGeometry(3.5, l1H, 8), leavesMat);
            // Base of cone at -l1H/2. We want base at trunk top - 0.5 overlap.
            // Trunk top is at (trunkH - 1.0).
            // So Cone Base at (trunkH - 1.5).
            // Cone Center at (trunkH - 1.5) + l1H/2.
            l1.position.copy(spot.pos.clone().add(up.clone().multiplyScalar((trunkH - 1.5) + l1H / 2)));
            l1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
            this.scene.add(l1);

            // Top Layer
            const l2H = 4;
            const l2 = new THREE.Mesh(new THREE.ConeGeometry(2.5, l2H, 8), leavesMat);
            // Sit on top of l1 with overlap
            // l1 top is at (trunkH - 1.5) + l1H.
            // l2 base at l1 top - 1.0.
            // l2 center at (l1 top - 1.0) + l2H/2.
            const l1Top = (trunkH - 1.5) + l1H;
            l2.position.copy(spot.pos.clone().add(up.clone().multiplyScalar((l1Top - 1.0) + l2H / 2)));
            l2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
            this.scene.add(l2);
        }

        const toonCloud = new THREE.Mesh(
            new THREE.IcosahedronGeometry(this.radius * 0.6, 1),
            new THREE.MeshStandardMaterial({ color: 0xffffff, opacity: 0.16, transparent: true })
        );
        toonCloud.scale.setScalar(1.2);
        this.scene.add(toonCloud);
    }

    buildCoins(count) {
        for (let i = 0; i < count; i++) {
            // Lowered height: radius + 1.5 (was +4)
            const coin = this.spawnOnSurface(this.radius + 1.5);
            const geo = new THREE.CylinderGeometry(2, 2, 0.8, 24);
            const mat = new THREE.MeshStandardMaterial({
                color: this.coinColor,
                emissive: 0xffe38a,
                metalness: 0.8,
                roughness: 0.2
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(coin.pos);
            mesh.lookAt(this.center);
            mesh.rotateX(Math.PI / 2);
            this.scene.add(mesh);
            this.coins.push({ mesh, collected: false, index: i });
        }
    }

    buildLava(count) {
        for (let i = 0; i < count; i++) {
            const spot = this.spawnOnSurface(this.radius + 0.1); // Closer to surface
            const geo = new THREE.CircleGeometry(8 + Math.random() * 6, 32);
            const mat = new THREE.MeshStandardMaterial({
                color: this.lavaColor,
                emissive: 0xff4400,
                emissiveIntensity: 2.0,
                side: THREE.DoubleSide,
                transparent: true,
                opacity: 0.9
            });
            const mesh = new THREE.Mesh(geo, mat);
            mesh.position.copy(spot.pos);
            mesh.lookAt(this.center);
            // CircleGeometry faces +Z. lookAt(center) makes -Z point to center. 
            // So +Z points OUT. This is correct. No extra rotation needed?
            // Wait, previous code had rotateX(Math.PI/2). 
            // If I lookAt center, the plane is perpendicular to the radius.
            // So the circle is tangent.
            // If I rotateX(90), I might be flipping it?
            // Let's remove rotation and see.

            this.scene.add(mesh);
            this.lavaPools.push({ mesh, radius: 9 });
        }
    }

    spawnOnSurface(r) {
        const u = Math.random();
        const v = Math.random();
        const theta = u * 2 * Math.PI;
        const phi = Math.acos(2 * v - 1);
        const sinPhi = Math.sin(phi);
        const pos = new THREE.Vector3(
            r * sinPhi * Math.cos(theta),
            r * Math.cos(phi),
            r * sinPhi * Math.sin(theta)
        );
        return { pos };
    }

    getDriveContext() {
        return { planetRadius: this.radius, center: this.center };
    }

    update(car, dt) {
        if (!car) return;
        const pos = car.mesh.position;

        // Animate coins
        const time = Date.now() * 0.002;
        if (this.grass) {
            const playerPos = car ? car.mesh.position : null;
            this.grass.update(time, playerPos);
        }

        this.coins.forEach(c => {
            if (!c.collected) {
                c.mesh.rotation.x += dt;
                c.mesh.position.addScaledVector(c.mesh.position.clone().normalize(), Math.sin(time + c.index) * 0.05);
            }
        });

        // Check collisions
        this.coins.forEach((c) => {
            if (c.collected) return;
            if (pos.distanceTo(c.mesh.position) < 6) {
                this.collectCoin(c);
            }
        });

        // Lava
        for (const lava of this.lavaPools) {
            // Pulse animation
            if (lava.mesh.material.emissiveIntensity !== undefined) {
                lava.mesh.material.emissiveIntensity = 2.0 + Math.sin(time * 3 + lava.mesh.id) * 0.5;
            }

            const d = pos.distanceTo(lava.mesh.position);
            if (d < lava.radius + 2) {
                if (this.onHazard) this.onHazard();
                break;
            }
        }
    }

    collectCoin(coin) {
        coin.collected = true;
        coin.mesh.visible = false;
        this.collected += 1;
        if (this.onCollect) this.onCollect(this.collected, this.coins.length);

        // Network sync
        if (this.network) {
            this.network.sendCoinCollect(coin.index);
        }
    }

    handleRemoteCollect(index) {
        const coin = this.coins.find(c => c.index === index);
        if (coin && !coin.collected) {
            coin.collected = true;
            coin.mesh.visible = false;
            // We don't increment local 'collected' count for remote actions, 
            // unless we want a global count. Usually 'collected' is personal score.
        }
    }

    dispose() {
        this.clear();
    }
}
