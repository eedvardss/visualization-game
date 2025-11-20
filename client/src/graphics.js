import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { generateSkyPalette } from './utils/skyPalette.js';

export class Graphics {
    constructor(audioFeatures = null) {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            5000
        );

        this.camera.position.set(0, 40, 80);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 0.95;
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

        document.body.appendChild(this.renderer.domElement);

        // Lights
        this.ambientLight = new THREE.AmbientLight(0x1b1b2f, 0.5); // Lowered base ambient
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xfaf5ff, 1.4);
        this.dirLight.position.set(60, 120, 60);
        this.dirLight.castShadow = true;
        this.scene.add(this.dirLight);

        this.fillLight = new THREE.HemisphereLight(0x5a7cff, 0x050014, 0.6);
        this.scene.add(this.fillLight);

        this.rimLight = new THREE.DirectionalLight(0x66e1ff, 1.0);
        this.rimLight.position.set(-80, 70, -60);
        this.scene.add(this.rimLight);

        this.modelGlow = new THREE.PointLight(0x7fb8ff, 0.8, 0, 2);
        this.modelGlow.position.set(0, 80, 0);
        this.scene.add(this.modelGlow);

        // Bloom
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.2,
            0.35,
            0.6
        );
        this.bloomPass.threshold = 0.45;
        this.bloomPass.strength = 0.45;
        this.bloomPass.radius = 0.35;
        this.composer.addPass(this.bloomPass);

        // Initialize
        this.updateSkyPalette(audioFeatures || {});

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    updateSkyPalette(features = {}) {
        this.skyPalette = generateSkyPalette(features || {});
        this.applySkyPalette();
        this.createStarfield();
        this.createNebula(this.skyPalette.fog.getHex());

        // Update lights to match the new palette
        this.ambientLight.color.copy(this.skyPalette.base).multiplyScalar(0.5);
        this.rimLight.color.copy(this.skyPalette.accent);
        this.modelGlow.color.copy(this.skyPalette.glow);
    }

    applySkyPalette() {
        const fogColor = this.skyPalette.fog.clone();
        const density = this.skyPalette.features.fogDensity || 0.007;

        this.scene.fog = new THREE.FogExp2(fogColor.getHex(), density);
        this.scene.background = fogColor;
        this.renderer.setClearColor(fogColor.getHex(), 1);

        this.baseFogColor = fogColor.clone();
        this.baseFogDensity = density;

        // Store the target bloom for this palette so we can scale it
        this.paletteBloomStrength = THREE.MathUtils.lerp(0.2, 0.5, this.skyPalette.features.energy);
        this.updateBloom();

        this.renderer.toneMappingExposure = THREE.MathUtils.lerp(0.7, 0.9, this.skyPalette.features.energy);
    }

    setBloomStrength(multiplier) {
        this.bloomMultiplier = multiplier;
        this.updateBloom();
    }

    updateBloom() {
        if (this.bloomPass) {
            const base = this.paletteBloomStrength !== undefined ? this.paletteBloomStrength : 0.45;
            const mult = this.bloomMultiplier !== undefined ? this.bloomMultiplier : 1.0;
            this.bloomPass.strength = base * mult;
        }
    }

    createStarfield() {
        if (this.starfield) {
            this.scene.remove(this.starfield);
        }

        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        const colors = [];

        const starCount = 7000;
        for (let i = 0; i < starCount; i++) {
            vertices.push(THREE.MathUtils.randFloatSpread(2200));
            vertices.push(THREE.MathUtils.randFloatSpread(2200));
            vertices.push(THREE.MathUtils.randFloatSpread(2200));

            const mixAccent = Math.random() * 0.6 + 0.2;
            const mixGlow = Math.pow(Math.random(), 2.5);
            const color = this.skyPalette.base.clone()
                .lerp(this.skyPalette.accent, mixAccent)
                .lerp(this.skyPalette.glow, mixGlow);

            // Random twinkle brightness
            color.multiplyScalar(0.7 + Math.random() * 0.5);
            colors.push(color.r, color.g, color.b);
        }

        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

        const material = new THREE.PointsMaterial({
            size: 1.7,
            transparent: true,
            opacity: 0.9,
            blending: THREE.AdditiveBlending,
            depthWrite: false,
            vertexColors: true,
            sizeAttenuation: true
        });

        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createNebula(colorHex) {
        if (this.nebula) this.scene.remove(this.nebula);
        if (this.dust) this.scene.remove(this.dust);

        const tint = colorHex !== undefined ? colorHex : this.skyPalette.accent.getHex();

        // Nebula Geometry
        const geo = new THREE.SphereGeometry(800, 32, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: tint,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.2, // Lower opacity for subtlety
            blending: THREE.AdditiveBlending
        });
        this.nebula = new THREE.Mesh(geo, mat);
        this.scene.add(this.nebula);

        // Dust Geometry
        const dustGeo = new THREE.BufferGeometry();
        const dustPos = [];
        for (let i = 0; i < 500; i++) {
            dustPos.push(THREE.MathUtils.randFloatSpread(500));
            dustPos.push(THREE.MathUtils.randFloatSpread(200));
            dustPos.push(THREE.MathUtils.randFloatSpread(500));
        }
        dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
        const dustMat = new THREE.PointsMaterial({
            color: tint,
            size: 4,
            transparent: true,
            opacity: 0.6,
            blending: THREE.AdditiveBlending
        });
        this.dust = new THREE.Points(dustGeo, dustMat);
        this.scene.add(this.dust);
    }

    onWindowResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    render() {
        if (this.starfield) this.starfield.rotation.y += 0.0002;
        if (this.nebula) this.nebula.rotation.y -= 0.0001;
        this.composer.render();
    }
}