import * as THREE from 'three';

export class TrackEffects {
    constructor(trackMesh, scene) {
        this.trackMesh = trackMesh;
        this.scene = scene || trackMesh.parent;
        this.material = trackMesh.material;

        // 1. MAGNETIC FLUID ORBS
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
        // High detail geometry for smooth liquid deformation
        const orbGeo = new THREE.IcosahedronGeometry(15, 5);

        // FERROFLUID SHADER
        const vertexShader = `
            uniform float uTime;
            uniform float uEnergy;
            varying vec2 vUv;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            // Simplex 3D Noise
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;

                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );

                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy; 
                vec3 x3 = x0 - D.yyy;      

                i = mod289(i); 
                vec4 p = permute( permute( permute( 
                            i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
                          + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
                          + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));

                float n_ = 0.142857142857; 
                vec3  ns = n_ * D.wyz - D.xzx;

                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);  

                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_ );    

                vec4 x = x_ *ns.x + ns.yyyy;
                vec4 y = y_ *ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);

                vec4 b0 = vec4( x.xy, y.xy );
                vec4 b1 = vec4( x.zw, y.zw );

                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));

                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;

                vec3 p0 = vec3(a0.xy,h.x);
                vec3 p1 = vec3(a0.zw,h.y);
                vec3 p2 = vec3(a1.xy,h.z);
                vec3 p3 = vec3(a1.zw,h.w);

                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
                p0 *= norm.x;
                p1 *= norm.y;
                p2 *= norm.z;
                p3 *= norm.w;

                vec4 m = max(0.5 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 105.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), 
                                              dot(p2,x2), dot(p3,x3) ) );
            }

            void main() {
                vUv = uv;
                vNormal = normal;
                
                // Liquid Displacement
                float noise = snoise(position * 0.1 + uTime * 0.5);
                float displacement = noise * (5.0 + uEnergy * 10.0); // React to music
                
                vec3 newPos = position + normal * displacement;
                
                vec4 mvPosition = modelViewMatrix * vec4(newPos, 1.0);
                vViewPosition = -mvPosition.xyz;
                gl_Position = projectionMatrix * mvPosition;
            }
        `;

        const fragmentShader = `
            uniform vec3 uColor;
            uniform float uTime;
            varying vec3 vNormal;
            varying vec3 vViewPosition;

            void main() {
                vec3 normal = normalize(vNormal);
                vec3 viewDir = normalize(vViewPosition);
                
                // Fresnel Rim Light (Glowing Edge)
                float fresnel = pow(1.0 - dot(normal, viewDir), 3.0);
                
                // Liquid Metal Look
                // Dark base + Shiny Rim
                vec3 baseColor = vec3(0.05, 0.05, 0.1); // Dark metallic
                vec3 rimColor = uColor * 2.0; // Bright glowing rim
                
                vec3 color = mix(baseColor, rimColor, fresnel);
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        // Spawn 6 random orbs around the track
        for (let i = 0; i < 6; i++) {
            const color = new THREE.Color().setHSL(Math.random(), 1.0, 0.5);

            const mat = new THREE.ShaderMaterial({
                uniforms: {
                    uTime: { value: 0 },
                    uEnergy: { value: 0 },
                    uColor: { value: color }
                },
                vertexShader,
                fragmentShader,
                transparent: true
            });

            const orb = new THREE.Mesh(orbGeo, mat);

            // Random Position in a large donut shape around the track
            const angle = Math.random() * Math.PI * 2;
            const radius = 200 + Math.random() * 100; // Outside the track (track radius is 150)
            const height = Math.random() * 100 - 20;

            orb.position.set(
                Math.cos(angle) * radius,
                height,
                Math.sin(angle) * radius
            );

            // Random scale variation
            const s = 1.0 + Math.random() * 1.5;
            orb.scale.set(s, s, s);

            this.scene.add(orb);
            this.orbs.push(orb);
        }
    }

    initPillars() {
        const count = 60; // More pillars
        // Hexagonal Prism (Cylinder with 6 segments)
        const geo = new THREE.CylinderGeometry(1.5, 1.5, 1, 6);
        geo.translate(0, 0.5, 0); // Pivot at bottom

        // GRADIENT SHADER
        const vertexShader = `
            varying vec2 vUv;
            varying vec3 vPosition;
            void main() {
                vUv = uv;
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
            }
        `;

        const fragmentShader = `
            uniform vec3 uColor;
            uniform float uEnergy;
            varying vec2 vUv;
            varying vec3 vPosition;

            void main() {
                // Vertical Gradient: Dark bottom, Bright top
                float h = vPosition.y; // 0 to 1 (since height is 1 and pivot is bottom)
                
                // Glow intensity based on height and energy
                float glow = h * h * (1.0 + uEnergy * 2.0);
                
                vec3 color = uColor * glow;
                
                // Add a white rim at the very top
                if (h > 0.95) color += vec3(0.5);

                gl_FragColor = vec4(color, 1.0);
            }
        `;

        this.pillarUniforms = {
            uColor: { value: new THREE.Color(0x00ff00) },
            uEnergy: { value: 0 }
        };

        const mat = new THREE.ShaderMaterial({
            uniforms: this.pillarUniforms,
            vertexShader,
            fragmentShader,
            transparent: true,
            side: THREE.DoubleSide
        });

        this.pillars = new THREE.InstancedMesh(geo, mat, count);

        const dummy = new THREE.Object3D();
        const radius = 60;

        for (let i = 0; i < count; i++) {
            const angle = (i / count) * Math.PI * 2;
            const x = Math.cos(angle) * radius;
            const z = Math.sin(angle) * radius;

            dummy.position.set(x, -20, z);
            dummy.lookAt(0, 0, 0);
            dummy.updateMatrix();
            this.pillars.setMatrixAt(i, dummy.matrix);
        }

        this.scene.add(this.pillars);
    }

    setPillarColor(color) {
        if (this.pillarUniforms) {
            this.pillarUniforms.uColor.value.copy(color);
        }
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

        // Update Orbs (Magnetic Fluid)
        this.orbs.forEach(orb => {
            orb.material.uniforms.uTime.value = time;
            orb.material.uniforms.uEnergy.value = energy;

            // Slow rotation
            orb.rotation.y += dt * 0.2;
            orb.rotation.z += dt * 0.1;

            // PHYSICAL PULSE ON BEAT
            // Base scale is 1.0 (set in init). We multiply it.
            // Beat gives a sharp kick (0 to 1), Energy gives sustained size.
            const beat = this.material.uniforms ? this.material.uniforms.uBeat.value : 0;
            const scale = 1.0 + beat * 0.4 + energy * 0.3;
            orb.scale.set(scale, scale, scale);
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
            // Update Uniforms
            this.pillarUniforms.uEnergy.value = energy;

            const dummy = new THREE.Object3D();
            const count = this.pillars.count;
            const radius = 60;

            for (let i = 0; i < count; i++) {
                const angle = (i / count) * Math.PI * 2 + time * 0.1; // Rotate slowly
                const x = Math.cos(angle) * radius;
                const z = Math.sin(angle) * radius;

                // Wave pattern
                // Combine two sine waves for more organic look
                const wave1 = Math.sin(i * 0.5 + time * 3.0);
                const wave2 = Math.cos(i * 0.2 - time * 1.5);
                const wave = (wave1 + wave2) * 0.5 + 0.5; // 0 to 1

                // Height reacts strongly to energy
                const height = 2 + wave * 10 + energy * 40.0;

                dummy.position.set(x, -10, z); // Base at -10
                dummy.scale.set(1, height, 1); // Scale Y (geometry is height 1)
                dummy.lookAt(0, 0, 0);
                dummy.updateMatrix();
                this.pillars.setMatrixAt(i, dummy.matrix);
            }
            this.pillars.instanceMatrix.needsUpdate = true;
        }
    }
}
