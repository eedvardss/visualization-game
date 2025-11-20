import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

export class TrackGenerator {
    constructor(scene) {
        this.scene = scene;
        this.curve = null;
        this.mesh = null;
        this.material = null;
        this.frenetFrames = null;
        this.roadWidth = 0;

        this.guardrailLoader = new GLTFLoader();
        this.guardrailGroup = new THREE.Group();
        this.scene.add(this.guardrailGroup);

        this.guardrailTemplate = null;
        this.guardrailSpacing = 6;
        this.guardrailBaseOffset = 0;
        this.guardrailHalfWidth = 0.2;

        this.GUARDRAIL_VERTICAL_LIFT = 0.05;
        this.GUARDRAIL_SPACING_OVERLAP = 0.9;
        this.GUARDRAIL_ROAD_OVERLAP = 0.05;
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
        this.roadWidth = roadWidth;
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

        // ======== 4. TEXTURED NEON RAINBOW SHADER ==========================

        const vertexShader = `
            varying vec2 vUv;
            #include <fog_pars_vertex>
            
            void main() {
                vUv = uv;
                vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
                gl_Position = projectionMatrix * mvPosition;
                #include <fog_vertex>
            }
        `;

        const fragmentShader = `
            uniform float uTime;
            uniform float uBeat;
            varying vec2 vUv;
            #include <fog_pars_fragment>

            vec3 palette( in float t, in vec3 a, in vec3 b, in vec3 c, in vec3 d ) {
                return a + b*cos( 6.28318*(c*t+d) );
            }

            // Simple pseudo-random noise
            float random(vec2 st) {
                return fract(sin(dot(st.xy, vec2(12.9898,78.233))) * 43758.5453123);
            }

            void main() {
                // 1. RAINBOW BASE
                // Scale: 0.005 for massive wide bands
                float t = uTime * 0.2 + vUv.x * 0.005; 

                vec3 a = vec3(0.5, 0.5, 0.5);
                vec3 b = vec3(0.5, 0.5, 0.5);
                vec3 c = vec3(1.0, 1.0, 1.0);
                vec3 d = vec3(0.00, 0.33, 0.67);

                vec3 color = palette(t, a, b, c, d);

                // 2. ASPHALT TEXTURE
                // High frequency noise
                float noise = random(vUv * 500.0); // 500x repeat for fine grain
                
                // Mix noise into color
                // We darken the color slightly where noise is low to create "grit"
                // Range: 0.7 to 1.0
                float textureIntensity = 0.7 + 0.3 * noise;
                color *= textureIntensity;

                // 3. BRIGHTNESS CONTROL
                // Base brightness 0.6 (glowing but visible color)
                color *= 0.6;

                // 4. BEAT PULSE
                color += uBeat * 0.2;

                gl_FragColor = vec4(color, 1.0);
                #include <fog_fragment>
            }
        `;

        this.material = new THREE.ShaderMaterial({
            uniforms: {
                uTime: { value: 0 },
                uBeat: { value: 0 },
                ...THREE.UniformsLib.fog // Include fog uniforms
            },
            vertexShader,
            fragmentShader,
            side: THREE.DoubleSide,
            fog: true // Enable fog
        });

        this.mesh = new THREE.Mesh(geometry, this.material);
        this.mesh.receiveShadow = true;
        this.scene.add(this.mesh);

        // ======== 5. GUARDRAIL MODEL INSTANCES =======================
        this.loadGuardrails();

        return { curve: this.curve, frames: this.frenetFrames };
    }

    loadGuardrails() {
        if (!this.curve || !this.frenetFrames) return;

        if (this.guardrailTemplate) {
            this.buildGuardrailInstances();
            return;
        }

        this.guardrailLoader.load(
            '/assets/models/guardrail_and_terminal.glb',
            (gltf) => {
                const template = gltf.scene;
                template.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                template.updateMatrixWorld(true);
                const bbox = new THREE.Box3().setFromObject(template);
                const size = bbox.getSize(new THREE.Vector3());
                const segmentLength = size.x;

                if (segmentLength > 0) {
                    this.guardrailSpacing = segmentLength * this.GUARDRAIL_SPACING_OVERLAP;
                }
                this.guardrailBaseOffset = -bbox.min.y;
                this.guardrailHalfWidth = size.z * 0.5;

                this.guardrailTemplate = template;
                this.buildGuardrailInstances();
            },
            undefined,
            (error) => {
                console.error('Failed to load guardrail model:', error);
            }
        );
    }

    buildGuardrailInstances() {
        if (!this.guardrailTemplate || !this.curve || !this.frenetFrames) return;

        this.guardrailGroup.clear();

        const totalLength = this.curve.getLength();
        const frameCount = this.frenetFrames.tangents.length;
        const guardCenterOffset =
            this.roadWidth / 2 +
            this.guardrailHalfWidth -
            this.GUARDRAIL_ROAD_OVERLAP;
        const lateralOffsets = [-guardCenterOffset, guardCenterOffset];
        const spacing = Math.max(this.guardrailSpacing, 1);

        const tangentVec = new THREE.Vector3();
        const normalVec = new THREE.Vector3();
        const upVec = new THREE.Vector3();
        const offsetVec = new THREE.Vector3();
        const lookTarget = new THREE.Vector3();
        const lookMatrix = new THREE.Matrix4();
        const tempQuat = new THREE.Quaternion();

        for (let dist = 0; dist < totalLength; dist += spacing) {
            const t = (dist / totalLength) % 1;
            const point = this.curve.getPointAt(t);
            const frameIdx = Math.floor(t * (frameCount - 1));

            tangentVec.copy(this.frenetFrames.tangents[frameIdx]).normalize();
            normalVec.copy(this.frenetFrames.normals[frameIdx]).normalize();
            upVec.copy(this.frenetFrames.binormals[frameIdx]).negate().normalize();

            for (const lateral of lateralOffsets) {
                const guard = this.guardrailTemplate.clone(true);

                offsetVec.copy(normalVec).multiplyScalar(lateral);
                guard.position.copy(point).add(offsetVec);
                guard.position.addScaledVector(
                    upVec,
                    this.guardrailBaseOffset + this.GUARDRAIL_VERTICAL_LIFT
                );

                lookTarget.copy(guard.position).add(tangentVec);
                lookMatrix.lookAt(guard.position, lookTarget, upVec);
                tempQuat.setFromRotationMatrix(lookMatrix);
                guard.quaternion.copy(tempQuat);
                guard.rotateY(-Math.PI / 2);

                this.guardrailGroup.add(guard);
            }
        }
    }
}
