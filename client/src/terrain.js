import * as THREE from 'three';

export class Terrain {
    constructor(scene, audioFeatures) {
        this.scene = scene;
        this.features = audioFeatures;
        this.width = 100;
        this.depth = 100;
        this.segments = 100;

        this.geometry = new THREE.PlaneGeometry(this.width, this.depth, this.segments, this.segments);
        this.geometry.rotateX(-Math.PI / 2);

        // Base material - will be updated with vertex colors
        this.material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.4,
            metalness: 0.5,
            flatShading: true
        });

        this.mesh = new THREE.Mesh(this.geometry, this.material);
        this.scene.add(this.mesh);

        // Store original positions for animation
        this.originalPositions = this.geometry.attributes.position.array.slice();
        this.count = this.geometry.attributes.position.count;

        // Color palette based on Valence
        this.baseColor = new THREE.Color();
        this.highColor = new THREE.Color();

        if (this.features.valence > 0.5) {
            // Warm
            this.baseColor.setHSL(0.05, 0.8, 0.5); // Orange/Red
            this.highColor.setHSL(0.15, 1.0, 0.6); // Yellow
        } else {
            // Cold
            this.baseColor.setHSL(0.6, 0.8, 0.2); // Dark Blue
            this.highColor.setHSL(0.8, 1.0, 0.6); // Purple/Pink
        }

        // Danceability affects saturation/emissive
        const saturationMult = this.features.danceability;
        this.material.emissive = this.baseColor.clone().multiplyScalar(0.2 * saturationMult);
        this.material.emissiveIntensity = saturationMult;

        // Initialize colors
        const colors = [];
        for (let i = 0; i < this.count; i++) {
            colors.push(this.baseColor.r, this.baseColor.g, this.baseColor.b);
        }
        this.geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
    }

    update(time) {
        const positions = this.geometry.attributes.position.array;
        const colors = this.geometry.attributes.color.array;

        // Tempo -> Speed
        const speed = time * (this.features.tempo / 60);

        // Energy -> Amplitude/Roughness
        // Acousticness -> Smoothing (reduces roughness)
        const roughness = this.features.energy * (1 - this.features.acousticness * 0.5);
        const amplitude = 2 + (roughness * 5);

        // Liveness -> Random Jumps
        const doJump = Math.random() < (this.features.liveness * 0.01);

        for (let i = 0; i < this.count; i++) {
            const x = this.originalPositions[i * 3];
            const z = this.originalPositions[i * 3 + 2];

            // Wave motion
            let y = Math.sin(x * 0.1 + speed) * Math.cos(z * 0.1 + speed * 0.8) * amplitude;

            // Add some noise
            y += Math.sin(x * 0.3 + speed * 1.5) * Math.cos(z * 0.3 - speed) * (amplitude * 0.5);

            // Liveness jumps
            if (doJump && Math.random() < 0.001) {
                y += 5; // Spike
            }

            positions[i * 3 + 1] = y;

            // Update colors based on height
            const heightFactor = (y + amplitude) / (amplitude * 2);
            const r = THREE.MathUtils.lerp(this.baseColor.r, this.highColor.r, heightFactor);
            const g = THREE.MathUtils.lerp(this.baseColor.g, this.highColor.g, heightFactor);
            const b = THREE.MathUtils.lerp(this.baseColor.b, this.highColor.b, heightFactor);

            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
        }

        this.geometry.attributes.position.needsUpdate = true;
        this.geometry.attributes.color.needsUpdate = true;
        this.geometry.computeVertexNormals();
    }
}
