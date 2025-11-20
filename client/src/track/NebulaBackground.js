import * as THREE from 'three';

function tintColor(source, satMultiplier = 1.0, lightOffset = 0) {
    const color = source.clone();
    const hsl = { h: 0, s: 0, l: 0 };
    color.getHSL(hsl);
    hsl.s = THREE.MathUtils.clamp(hsl.s * satMultiplier, 0, 1);
    hsl.l = THREE.MathUtils.clamp(hsl.l + lightOffset, 0, 1);
    color.setHSL(hsl.h, hsl.s, hsl.l);
    return color;
}

export class NebulaBackground {
    constructor(scene, palette = null) {
        this.scene = scene;
        this.mesh = null;
        this.dust = null;

        const baseColor = palette?.base ? palette.base.clone() : new THREE.Color(0x050510);
        const accentColor = palette?.accent ? palette.accent.clone() : new THREE.Color(0x4b0082);
        const glowColor = palette?.glow ? palette.glow.clone() : new THREE.Color(0x00f0ff);

        // Premium Cosmic Palette
        this.uniforms = {
            uTime: { value: 0 },
            uBeat: { value: 0 },
            uEnergy: { value: 0 },
            uEuphoria: { value: 0 },
            uColor1: { value: baseColor },
            uColor2: { value: accentColor },
            uColor3: { value: glowColor }
        };

        this.init();
        this.initDust(palette);
        if (palette) this.applyPalette(palette);
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
            uniform float uEuphoria;
            
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
                
                // Layered Noise
                float n1 = fbm(coord + vec3(time, time * 0.3, 0.0));
                float n2 = fbm(coord * 2.0 - vec3(0.0, time * 0.5, 0.0));
                
                float noise = n1 + n2 * 0.5;
                float baseBlend = clamp(noise + 0.25, 0.0, 1.0);
                
                // Color Mixing
                vec3 color = mix(uColor1, uColor2, baseBlend);
                
                // Highlights based on energy
                float highlightBlend = clamp(n2 + uEnergy * 0.8, 0.0, 1.0);
                vec3 highlight = mix(uColor2, uColor3, highlightBlend);
                float mixAmt = clamp(n1 * (0.35 + uEnergy * 0.5), 0.0, 1.0);
                color = mix(color, highlight, mixAmt);
                
                // Additional glow layers
                float glowEnvelope = smoothstep(0.15, 0.85, baseBlend);
                vec3 rim = mix(uColor2, uColor3, glowEnvelope * (0.6 + uEnergy * 0.4));
                color += rim * pow(max(0.0, n2), 3.0) * 0.4;
                
                // Pulse Brightness & Color Shift on Beat (clamped to avoid artifacts)
                vec3 beatColor = mix(uColor2, uColor3, 0.65); 
                float pulseMask = smoothstep(0.5, 0.68, noise) * snoise(coord * 4.0 + vec3(time * 0.6, 0.0, 0.0));
                pulseMask = clamp(pulseMask * 1.5, 0.0, 1.0);
                color += beatColor * pulseMask * clamp(uBeat, 0.0, 1.0) * 0.38;

                // Euphoria waves (high energy moments flood the sky)
                float euphoricWave = smoothstep(0.25, 0.9, noise + uEuphoria * 0.4);
                vec3 euphoricColor = mix(color, mix(uColor2, uColor3, 0.9), euphoricWave);
                color = mix(color, euphoricColor, clamp(uEuphoria, 0.0, 1.0));
                color += vec3(0.1, 0.12, 0.18) * uEuphoria * euphoricWave;

                // Overall brightness pulse (still controlled)
                color *= (0.9 + clamp(uBeat, 0.0, 1.0) * 0.05);
                color = pow(max(color, vec3(0.05)), vec3(1.02));
                
                gl_FragColor = vec4(color, 1.0);
            }
        `;

        const material = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: vertexShader,
            fragmentShader: fragmentShader,
            side: THREE.BackSide,
            depthWrite: false,
            // fog: true // Default is true. We want fog to blend the distant nebula.
        });

        const geometry = new THREE.SphereGeometry(2000, 64, 64); // Keep large size
        this.mesh = new THREE.Mesh(geometry, material);
        this.scene.add(this.mesh);
    }

    initDust(palette) {
        const count = 2000;
        const geometry = new THREE.BufferGeometry();
        const positions = [];
        const speeds = [];
        const colors = [];

        for (let i = 0; i < count; i++) {
            positions.push(THREE.MathUtils.randFloatSpread(1500));
            positions.push(THREE.MathUtils.randFloatSpread(1500)); // Full height range (was biased up)
            positions.push(THREE.MathUtils.randFloatSpread(1500));
            speeds.push(Math.random());

            const colorSource = palette
                ? palette.accent.clone().lerp(palette.glow, Math.random())
                : new THREE.Color(0xffffff);
            colors.push(colorSource.r, colorSource.g, colorSource.b);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geometry.setAttribute('speed', new THREE.Float32BufferAttribute(speeds, 1));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 2.6,
            transparent: true,
            opacity: 0.75,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true,
            sizeAttenuation: true
        });

        this.dust = new THREE.Points(geometry, material);
        this.scene.add(this.dust);
    }

    applyPalette(palette) {
        if (!palette) return;

        const cloudBase = tintColor(palette.base, 1.05, 0.06);
        const neonHighlight = tintColor(palette.base, 1.2, 0.14);
        const glowAccent = tintColor(palette.accent, 1.1, 0.18).lerp(tintColor(palette.glow, 1.05, 0.12), 0.4);

        this.setColors(cloudBase, neonHighlight, glowAccent);

        if (this.dust && this.dust.geometry.attributes.color) {
            const colorAttr = this.dust.geometry.attributes.color;
            for (let i = 0; i < colorAttr.count; i++) {
                const idx = i * 3;
                const c = neonHighlight.clone().lerp(glowAccent, Math.random());
                colorAttr.array[idx] = c.r;
                colorAttr.array[idx + 1] = c.g;
                colorAttr.array[idx + 2] = c.b;
            }
            colorAttr.needsUpdate = true;
        }
    }

    setColors(c1, c2, c3) {
        // Smoothly transition to new colors
        // (For now, direct set is fine as this happens once per song load)
        this.uniforms.uColor1.value.copy(c1);
        this.uniforms.uColor2.value.copy(c2);
        this.uniforms.uColor3.value.copy(c3);
    }

    setHue(hue) {
        // hue is 0-360
        const h = hue / 360;

        // Helper to shift hue while keeping saturation/lightness
        const shift = (color, offsetH) => {
            const hsl = { h: 0, s: 0, l: 0 };
            color.getHSL(hsl);
            color.setHSL((h + offsetH) % 1, hsl.s, hsl.l);
        };

        // Shift all 3 colors relative to the base hue
        // We assume the base palette has some relation we want to preserve or just override
        // Let's just set the base hue and keep relative offsets if possible, 
        // or just set them all to the new hue with variations.

        // Simple approach: Set base hue, and offset others slightly
        const c1 = this.uniforms.uColor1.value;
        const c2 = this.uniforms.uColor2.value;
        const c3 = this.uniforms.uColor3.value;

        // We don't want to lose the original saturation/lightness if we can avoid it
        // But we don't store the original palette. 
        // Let's just shift the current colors' hue to the target hue.

        const hsl1 = {}; c1.getHSL(hsl1);
        const hsl2 = {}; c2.getHSL(hsl2);
        const hsl3 = {}; c3.getHSL(hsl3);

        c1.setHSL(h, hsl1.s, hsl1.l);
        c2.setHSL((h + 0.1) % 1, hsl2.s, hsl2.l); // Accent slightly offset
        c3.setHSL((h + 0.5) % 1, hsl3.s, hsl3.l); // Glow complementary-ish
    }

    update(time, audioData = {}) {
        this.uniforms.uTime.value = time;

        // SMOOTH PULSE (Anti-Epilepsy)
        // Instead of jumping to 1.0, we target 1.0 and lerp there
        // But for a beat, we kind of need a jump. 
        // We'll reduce the max intensity and use a softer decay.

        if (audioData.timelineEvent && audioData.timelineEvent.type === 'beat') {
            const target = 0.4;
            this.uniforms.uBeat.value = THREE.MathUtils.lerp(
                this.uniforms.uBeat.value,
                target,
                0.35
            );
        } else {
            this.uniforms.uBeat.value = THREE.MathUtils.lerp(
                this.uniforms.uBeat.value,
                0.0,
                0.08
            );
        }

        // Energy
        this.uniforms.uEnergy.value = THREE.MathUtils.lerp(
            this.uniforms.uEnergy.value,
            audioData.realtimeEnergy || 0,
            0.05 // Slower reaction to energy for smoother look
        );

        const euphoricTarget = audioData.realtimeEnergy
            ? Math.min(1, Math.max(0, audioData.realtimeEnergy - 0.55) * 2.2)
            : 0;
        const beatBoost = audioData.timelineEvent && audioData.timelineEvent.type === 'beat' ? 0.25 : 0;
        this.uniforms.uEuphoria.value = THREE.MathUtils.lerp(
            this.uniforms.uEuphoria.value,
            Math.min(1, euphoricTarget + beatBoost),
            0.08
        );

        // Rotate Nebula
        if (this.mesh) {
            this.mesh.rotation.y = time * 0.01;
        }

        // Animate Dust
        if (this.dust) {
            this.dust.rotation.y = time * 0.02;
            const posAttr = this.dust.geometry.attributes.position;
            const speedAttr = this.dust.geometry.attributes.speed;
            for (let i = 0; i < posAttr.count; i++) {
                const idx = i * 3;
                const s = speedAttr.array[i];
                posAttr.array[idx] += Math.sin(time * 0.05 + s * 10.0) * 0.02;
                posAttr.array[idx + 1] += Math.cos(time * 0.04 + s * 6.0) * 0.015;
                posAttr.array[idx + 2] += Math.sin(time * 0.03 + s * 8.0) * 0.02;
            }
            posAttr.needsUpdate = true;
            this.dust.material.opacity = 0.45 + (audioData.realtimeEnergy || 0) * 0.4;
        }
    }
}
