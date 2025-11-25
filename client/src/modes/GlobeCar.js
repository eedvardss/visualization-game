import * as THREE from 'three';
import { Car } from '../car.js';

export class GlobeCar extends Car {
    constructor(scene, color, isLocal = false, modelName = 'mercedes.glb') {
        super(scene, color, isLocal, modelName);

        // Globe specific properties
        this.planetRadius = 120;
        this.planetCenter = new THREE.Vector3(0, 0, 0);

        // Override physics constants for globe feel
        this.MAX_SPEED = 80;
        this.ACCEL = 50;
        this.BRAKE = 70;
        this.DRAG = 0.97;
        this.STEER_RATE = 1.2;

        // Current state on sphere
        this.velocity = new THREE.Vector3(0, 0, 0); // Tangent velocity
    }

    update(dt, context = {}) {
        const { planetRadius, center, canMove = true } = context;
        if (planetRadius) this.planetRadius = planetRadius;
        if (center) this.planetCenter.copy(center);

        if (!this.isLocal) {
            this.updateRemote(dt);
            return;
        }

        // 1. Get current position and normal
        const currentPos = this.mesh.position.clone();
        const toCenter = currentPos.clone().sub(this.planetCenter);
        let dist = toCenter.length();

        // Safety check: if car is at center (invalid state), snap to surface
        if (dist < 1.0) {
            const randomDir = new THREE.Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
            this.mesh.position.copy(this.planetCenter.clone().add(randomDir.multiplyScalar(this.planetRadius + 0.5)));
            // Update derived vars
            toCenter.copy(this.mesh.position).sub(this.planetCenter);
            dist = toCenter.length();
        }

        const normal = toCenter.clone().normalize(); // Up vector for the car

        // 2. Handle Input & Speed
        if (canMove) {
            if (this.keys.w) this.speed += this.ACCEL * dt;
            if (this.keys.s) this.speed -= this.BRAKE * dt;
        }
        this.speed *= this.DRAG;
        this.speed = THREE.MathUtils.clamp(this.speed, -this.MAX_SPEED, this.MAX_SPEED);

        // 3. Handle Steering
        // We rotate the velocity vector around the normal
        // Standard: A is Left (+), D is Right (-)
        const steerInput = (this.keys.a ? 1 : 0) - (this.keys.d ? 1 : 0);

        // 4. Calculate Movement
        // We need a forward vector tangent to the sphere.
        let forward = new THREE.Vector3(0, 0, 1).applyQuaternion(this.mesh.quaternion);
        forward.projectOnPlane(normal).normalize();

        // Apply steering to the forward vector
        if (Math.abs(steerInput) > 0.01 && Math.abs(this.speed) > 1.0) {
            const axis = normal;
            const angle = steerInput * this.STEER_RATE * dt * (this.speed > 0 ? 1 : -1);
            forward.applyAxisAngle(axis, angle);
        }

        // Update position
        const moveVec = forward.clone().multiplyScalar(this.speed * dt);
        const newPos = currentPos.clone().add(moveVec);

        // 5. Snap to Sphere Surface
        const newToCenter = newPos.clone().sub(this.planetCenter).normalize();
        const surfacePos = this.planetCenter.clone().add(newToCenter.multiplyScalar(this.planetRadius + 0.5));

        this.mesh.position.copy(surfacePos);

        // 6. Align Orientation
        // Use the movement direction (projected to new normal) as the new forward
        // This ensures the car always faces the direction it is moving
        const newNormal = newToCenter;
        const newForward = forward.clone().projectOnPlane(newNormal).normalize();

        const targetLook = surfacePos.clone().add(newForward);
        this.mesh.up.copy(newNormal);
        this.mesh.lookAt(targetLook);

        // 7. Update Visuals (Wheels, Particles)
        if (this.hasWheels) {
            const rot = this.speed * dt * 2.5;
            this.wheels.fl.rotation.x -= rot;
            this.wheels.fr.rotation.x -= rot;
            this.wheels.rl.rotation.x -= rot;
            this.wheels.rr.rotation.x -= rot;

            // Visual steering
            const steerAngle = steerInput * 0.5;
            this.wheels.fl.rotation.y = steerAngle;
            this.wheels.fr.rotation.y = steerAngle;
        }
    }
}
