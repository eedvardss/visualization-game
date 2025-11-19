import * as THREE from 'three';

export class TrackEffects {
    constructor(trackMesh) {
        this.mesh = trackMesh;
        this.material = trackMesh.material;
    }

    update(time, audioData) {
        if (!this.material.uniforms) return;

        this.material.uniforms.uTime.value = time;

        let beat = 0;
        if (audioData.timelineEvent && audioData.timelineEvent.type === 'beat') {
            beat = 1.0;
        }

        this.material.uniforms.uBeat.value = THREE.MathUtils.lerp(
            this.material.uniforms.uBeat.value,
            beat,
            0.1
        );
    }
}
