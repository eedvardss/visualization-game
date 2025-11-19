import * as THREE from 'three';

export class TrackGenerator {
    constructor(scene) {
        this.scene = scene;
        this.curve = null;
        this.mesh = null;
        this.material = null;
        this.frenetFrames = null;
    }

    generate() {
        // ======== 1. SMOOTH CIRCULAR TRACK WITH GENTLE HILLS =========
        const points = [];
        const radius = 150;
        const heightAmp = 20;
        const numPoints = 200;

        for (let i = 0; i < numPoints; i++) {
            const t = i / numPoints;
            const angle = t * Math.PI * 2;

            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;
            const y =
                Math.sin(angle * 2.0) * heightAmp +
                Math.cos(angle * 1.0) * 5.0;

            points.push(new THREE.Vector3(x, y, z));
        }

        this.curve = new THREE.CatmullRomCurve3(points, true, 'catmullrom', 0.5);

        // ======== 2. FRENET FRAMES (STABLE) ==========================
        const segments = 1000;
        this.frenetFrames = this.curve.computeFrenetFrames(segments, true);

        // Smooth normals and binormals to reduce twisting artifacts
        for (let i = 1; i < segments; i++) {
            this.frenetFrames.normals[i]
                .lerp(this.frenetFrames.normals[i - 1], 0.5)
                .normalize();

            this.frenetFrames.binormals[i]
                .lerp(this.frenetFrames.binormals[i - 1], 0.5)
                .normalize();
        }

        // ======== 3. ROAD SHAPE (RECTANGLE, CENTERED) ================
        const roadWidth = 15;
        const roadThickness = 0.6;

        const shape = new THREE.Shape();
        shape.moveTo(-roadWidth / 2, -roadThickness / 2);
        shape.lineTo(roadWidth / 2, -roadThickness / 2);
        shape.lineTo(roadWidth / 2, roadThickness / 2);
        shape.lineTo(-roadWidth / 2, roadThickness / 2);
        shape.lineTo(-roadWidth / 2, -roadThickness / 2);

        const extrudeSettings = {
            steps: segments,
            bevelEnabled: false,
            extrudePath: this.curve
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);
        geometry.computeVertexNormals();

        // ======== 4. RAINBOW SHADER MATERIAL ==========================

        const vertexShader = `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform float uBeat;
            varying vec2 vUv;

            vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
                return a + b*cos( 6.28318*(c*t+d) );
            }

            void main() {
                float t = uTime * 0.2 + vUv.x * 4.0;

                vec3 a = vec3(0.5, 0.5, 0.5);
                vec3 b = vec3(0.5, 0.5, 0.5);
                vec3 c = vec3(1.0, 1.0, 1.0);
                vec3 d = vec3(0.00, 0.33, 0.67);

                vec3 color = palette(t, a, b, c, d);

                // Beat pulse
                color += uBeat * 0.1;

                // Subtle grid pattern
                float gridX = step(0.98, fract(vUv.x * 40.0));
                float gridY = step(0.95, fract(vUv.y * 2.0));
                vec3 gridColor = vec3(0.0);

                color = mix(color, gridColor, max(gridX, gridY) * 0.8);

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uBeat: { value: 0 }
            },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // ======== 5. SIMPLE POSTS AS GUARDS ==========================

        const postGeo = new THREE.BoxGeometry(0.5, 2, 0.5);
        const postMat = new THREE.MeshStandardMaterial({
            color: 0xff00ff,
            emissive: 0xff00ff,
            emissiveIntensity: 0.8
        });

        const postCount = 200;
        const posts = new THREE.InstancedMesh(postGeo, postMat, postCount * 2);
        const dummy = new THREE.Object3D();

        for (let i = 0; i < postCount; i++) {
            const t = i / postCount;

            const point = this.curve.getPointAt(t);
            const idx = Math.floor(t * (segments - 1));
            const tangent = this.frenetFrames.tangents[idx];
            const normal = this.frenetFrames.normals[idx];

            // left
            let p = point.clone().add(normal.clone().multiplyScalar(-roadWidth / 2 - 0.5));
            dummy.position.copy(p);
            dummy.lookAt(p.clone().add(tangent));
            dummy.updateMatrix();
            posts.setMatrixAt(i * 2, dummy.matrix);

            // right
            p = point.clone().add(normal.clone().multiplyScalar(roadWidth / 2 + 0.5));
            dummy.position.copy(p);
            dummy.lookAt(p.clone().add(tangent));
            dummy.updateMatrix();
            posts.setMatrixAt(i * 2 + 1, dummy.matrix);
        }

        this.scene.add(posts);

        return { curve: this.curve, frames: this.frenetFrames };
    }
}
