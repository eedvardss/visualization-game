import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export class Graphics {
    constructor() {
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            5000
        );

        // SAFE INITIAL CAMERA POSITION (prevents frozen screen before car exists)
        this.camera.position.set(0, 40, 80);
        this.camera.lookAt(0, 0, 0);

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(window.devicePixelRatio);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;

        document.body.appendChild(this.renderer.domElement);

        // Lights
        this.ambientLight = new THREE.AmbientLight(0x404040, 2.0);
        this.scene.add(this.ambientLight);

        this.dirLight = new THREE.DirectionalLight(0xffffff, 2.0);
        this.dirLight.position.set(50, 100, 50);
        this.scene.add(this.dirLight);

        // Bloom
        this.composer = new EffectComposer(this.renderer);
        const renderPass = new RenderPass(this.scene, this.camera);
        this.composer.addPass(renderPass);

        this.bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            1.5,
            0.4,
            0.85
        );
        this.bloomPass.threshold = 0.4;
        this.bloomPass.strength = 0.6;
        this.bloomPass.radius = 0.5;
        this.composer.addPass(this.bloomPass);

        window.addEventListener('resize', () => this.onWindowResize(), false);
    }

    setupFog(valence) {
        const color = valence > 0.5 ? 0x220044 : 0x000033;
        this.scene.fog = new THREE.FogExp2(color, 0.001);
        this.scene.background = new THREE.Color(0x050505);

        this.createStarfield();
        this.createNebula(color);
    }

    createStarfield() {
        const geometry = new THREE.BufferGeometry();
        const vertices = [];
        for (let i = 0; i < 5000; i++) {
            vertices.push(THREE.MathUtils.randFloatSpread(2000));
            vertices.push(THREE.MathUtils.randFloatSpread(2000));
            vertices.push(THREE.MathUtils.randFloatSpread(2000));
        }
        geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const material = new THREE.PointsMaterial({ color: 0xffffff, size: 1.5 });
        this.starfield = new THREE.Points(geometry, material);
        this.scene.add(this.starfield);
    }

    createNebula(colorHex) {
        const geo = new THREE.SphereGeometry(800, 32, 32);
        const mat = new THREE.MeshBasicMaterial({
            color: colorHex,
            side: THREE.BackSide,
            transparent: true,
            opacity: 0.3,
            blending: THREE.AdditiveBlending
        });
        this.nebula = new THREE.Mesh(geo, mat);
        this.scene.add(this.nebula);

        const dustGeo = new THREE.BufferGeometry();
        const dustPos = [];
        for (let i = 0; i < 500; i++) {
            dustPos.push(THREE.MathUtils.randFloatSpread(500));
            dustPos.push(THREE.MathUtils.randFloatSpread(200));
            dustPos.push(THREE.MathUtils.randFloatSpread(500));
        }
        dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
        const dustMat = new THREE.PointsMaterial({
            color: colorHex,
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
        if (this.starfield) {
            this.starfield.rotation.y += 0.0002;
        }
        if (this.nebula) {
            this.nebula.rotation.y -= 0.0001;
        }
        this.composer.render();
    }
}
