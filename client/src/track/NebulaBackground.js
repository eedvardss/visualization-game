import * as THREE from 'three';

export class NebulaBackground {
    constructor(scene) {
        this.scene = scene;
        this.mesh = null;
        this.dust = null;

        // Premium Cosmic Palette
        this.uniforms = {
            uTime: { value: 0 },
            uBeat: { value: 0 },
            uEnergy: { value: 0 },
            uColor1: { value: new THREE.Color(0x050510) }, // Deep Void Blue
            uColor2: { value: new THREE.Color(0x4b0082) }, // Indigo/Purple
            uColor3: { value: new THREE.Color(0x00f0ff) }  // Electric Cyan
        };

        this.init();
        this.initDust();
    }

    init() {
        // Vertex Shader
        const vertexShader = `
            varying vec2 vUv;
            varying vec3 vWorldPosition;
            
            void main() {
                vUv = uv;
                vec4 worldPosition = modelMatrix * vec4(position, 1.0);
                vWorldPosition = worldPosition.xyz;
                gl_Position = projectionMatrix * viewMatrix * worldPosition;
            }
        `;

        // Fragment Shader (Procedural Noise Nebula)
        const fragmentShader = `
            uniform float uTime;
            uniform float uBeat;
            uniform float uEnergy;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            
            varying vec2 vUv;
            varying vec3 vWorldPosition;

            // Simplex 3D Noise 
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);

                // First corner
                vec3 i  = floor(v + dot(v, C.yyy) );
                vec3 x0 = v - i + dot(i, C.xxx) ;

                // Other corners
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min( g.xyz, l.zxy );
                vec3 i2 = max( g.xyz, l.zxy );

                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy; 
                vec3 x3 = x0 - D.yyy;      

                // Permutations
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

            float fbm(vec3 p) {
                float value = 0.0;
                float amplitude = 0.5;
                for (int i = 0; i < 5; i++) {
                    value += amplitude * snoise(p);
                    p *= 2.0;
                    amplitude *= 0.5;
                }
                return value;
            }

            void main() {
                vec3 coord = vWorldPosition * 0.0015; // Larger scale clouds
                float time = uTime * 0.05;
                
                // Beat distortion
                coord.y += uBeat * 0.1 * sin(coord.x * 5.0 + time * 2.0);
                
                // Layered Noise
                float n1 = fbm(coord + vec3(time, time * 0.3, 0.0));
                float n2 = fbm(coord * 2.0 - vec3(0.0, time * 0.5, 0.0));
                
                // Combine
                float noise = n1 + n2 * 0.5;
                
                // Color Mixing
                vec3 color = mix(uColor1, uColor2, noise + 0.3);
                
                // Highlights based on energy
                vec3 highlight = mix(uColor2, uColor3, n2 + uEnergy);
                color = mix(color, highlight, n1 * (0.4 + uEnergy * 0.6));
                
                // Pulse Brightness
                color *= (0.8 + uBeat * 0.4);
                
                // Fog fade at bottom
                float fog = smoothstep(-100.0, 100.0, vWorldPosition.y);
                color = mix(color, vec3(0.0), 1.0 - fog); 
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false
        });

        const geometry = new THREE.SphereGeometry(900, 64, 64);
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    initDust() {
        const count = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const speeds = [];

        for (let i = 0; i < count; i++) {
            positions.push(THREE.MathUtils.randFloatSpread(1500));
            positions.push(THREE.MathUtils.randFloatSpread(800) + 200); // Keep mostly in sky
            positions.push(THREE.MathUtils.randFloatSpread(1500));
            speeds.push(Math.random());
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));

        const material = new THREE.PointsMaterial({
            color: 0xffffff,
            size: 2,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending
        });

        this.dust = new THREE.Points(geometry, material);
        this.scene.add(this.dust);
    }

    update(time, audioData) {
        this.uniforms.uTime.value = time;

        // INSTANT ATTACK, SLOW DECAY for sharp beat hits
        if (audioData.timelineEvent && audioData.timelineEvent.type === 'beat') {
            this.uniforms.uBeat.value = 1.0;
        } else {
            this.uniforms.uBeat.value = THREE.MathUtils.lerp(
                this.uniforms.uBeat.value,
                0.0,
                0.05 // Slow decay
            );
        }

        // Energy
        this.uniforms.uEnergy.value = THREE.MathUtils.lerp(
            this.uniforms.uEnergy.value,
            audioData.realtimeEnergy || 0,
            0.1
        );

        // Rotate Nebula
        if (this.mesh) {
            this.mesh.rotation.y = time * 0.01;
        }

        // Animate Dust
        if (this.dust) {
            this.dust.rotation.y = time * 0.02;
            // Pulse dust size/opacity could go here if using shader material for dust
            // For now, simple rotation is good ambience
        }
    }
}
