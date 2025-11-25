import * as THREE from 'three';

// Based on "Realistic real-time grass rendering" by Eddie Lee, 2010
// Ported from React-Three-Fiber example to Vanilla Three.js + Spherical Adaptation

const vertexShader = `
precision mediump float;
attribute vec3 offset;
attribute vec4 orientation;
attribute float halfRootAngleSin;
attribute float halfRootAngleCos;
attribute float stretch;
attribute vec4 baseQuaternion; // New: Align to sphere normal

uniform float time;
uniform float bladeHeight;
uniform vec3 playerPos; // New: Interaction

varying vec2 vUv;
varying float frc;

// Simplex Noise
vec3 mod289(vec3 x) {return x - floor(x * (1.0 / 289.0)) * 289.0;} 
vec2 mod289(vec2 x) {return x - floor(x * (1.0 / 289.0)) * 289.0;} 
vec3 permute(vec3 x) {return mod289(((x*34.0)+1.0)*x);} 
float snoise(vec2 v){const vec4 C = vec4(0.211324865405187, 0.366025403784439, -0.577350269189626, 0.024390243902439); vec2 i  = floor(v + dot(v, C.yy) ); vec2 x0 = v -   i + dot(i, C.xx); vec2 i1; i1 = (x0.x > x0.y) ? vec2(1.0, 0.0) : vec2(0.0, 1.0); vec4 x12 = x0.xyxy + C.xxzz; x12.xy -= i1; i = mod289(i); vec3 p = permute( permute( i.y + vec3(0.0, i1.y, 1.0 )) + i.x + vec3(0.0, i1.x, 1.0 )); vec3 m = max(0.5 - vec3(dot(x0,x0), dot(x12.xy,x12.xy), dot(x12.zw,x12.zw)), 0.0); m = m*m ; m = m*m ; vec3 x = 2.0 * fract(p * C.www) - 1.0; vec3 h = abs(x) - 0.5; vec3 ox = floor(x + 0.5); vec3 a0 = x - ox; m *= 1.79284291400159 - 0.85373472095314 * ( a0*a0 + h*h ); vec3 g; g.x  = a0.x  * x0.x  + h.x  * x0.y; g.yz = a0.yz * x12.xz + h.yz * x12.yw; return 130.0 * dot(m, g);}

vec3 rotateVectorByQuaternion( vec3 v, vec4 q){
  return 2.0 * cross(q.xyz, v * q.w + cross(q.xyz, v)) + v;
}

vec4 slerp(vec4 v0, vec4 v1, float t) {
  normalize(v0);
  normalize(v1);
  float dot_ = dot(v0, v1);
  if (dot_ < 0.0) {
    v1 = -v1;
    dot_ = -dot_;
  }  
  const float DOT_THRESHOLD = 0.9995;
  if (dot_ > DOT_THRESHOLD) {
    vec4 result = t*(v1 - v0) + v0;
    normalize(result);
    return result;
  }
  float theta_0 = acos(dot_);
  float theta = theta_0*t;
  float sin_theta = sin(theta);
  float sin_theta_0 = sin(theta_0);
  float s0 = cos(theta) - dot_ * sin_theta / sin_theta_0;
  float s1 = sin_theta / sin_theta_0;
  return (s0 * v0) + (s1 * v1);
}

void main() {
  frc = position.y / float(bladeHeight);
  
  // Wind noise (using world offset for continuity)
  float noise = 1.0 - (snoise(vec2((time - offset.x / 50.0), (time - offset.z / 50.0)))); 
  
  // Local Space Direction (Unbent)
  vec4 direction = vec4(0.0, halfRootAngleSin, 0.0, halfRootAngleCos);
  
  // Interpolate to Bent orientation
  direction = slerp(direction, orientation, frc);
  
  // Apply stretch
  vec3 vPosition = vec3(position.x, position.y + position.y * stretch, position.z);
  
  // Apply Local Rotation (Twist + Bend)
  vPosition = rotateVectorByQuaternion(vPosition, direction);

  // Apply Wind (Local Space)
  float halfAngle = noise * 0.3; // Stronger wind
  vPosition = rotateVectorByQuaternion(vPosition, normalize(vec4(sin(halfAngle), 0.0, -sin(halfAngle), cos(halfAngle))));

  // Apply Base Rotation (Align to Sphere Normal)
  vPosition = rotateVectorByQuaternion(vPosition, baseQuaternion);

  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(offset + vPosition, 1.0);
  
  // Better Interaction:
  // Calculate push direction in world space, then apply.
  vec3 worldPos = offset + vPosition; // Recalculate worldPos after all transformations
  float dist = distance(worldPos, playerPos);
  float radius = 5.0;
  if (dist < radius) {
      vec3 pushDir = normalize(offset - playerPos); // Push away from center of clump
      float pushStrength = (1.0 - dist / radius) * 3.0 * pow(frc, 2.0);
      gl_Position.xyz += pushDir * pushStrength;
  }
}
`;

const fragmentShader = `
precision mediump float;
uniform vec3 tipColor;
uniform vec3 bottomColor;
varying vec2 vUv;
varying float frc;

void main() {
  vec4 col = vec4(1.0);
  // Mix colors based on height (frc)
  col.rgb = mix(bottomColor, tipColor, frc);
  
  // Simple fake lighting/shadowing
  // Darker at bottom
  col.rgb = mix(col.rgb * 0.5, col.rgb, frc);

  gl_FragColor = col;
  
  // Tone mapping (if needed, but we are in raw shader material)
  // #include <tonemapping_fragment>
  // #include <encodings_fragment>
}
`;

export class GlobeGrass {
  constructor(scene, radius, center, count = 200000) {
    this.scene = scene;
    this.radius = radius;
    this.center = center;
    this.count = count;
    this.mesh = null;
    this.time = 0;

    this.init();
  }

  init() {
    const bladeWidth = 0.25; // Wider blades
    const bladeHeight = 1.2; // Taller
    const joints = 5;

    // Cross Geometry: Two planes intersecting
    const plane1 = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, joints);
    plane1.translate(0, bladeHeight / 2, 0);

    const plane2 = new THREE.PlaneGeometry(bladeWidth, bladeHeight, 1, joints);
    plane2.translate(0, bladeHeight / 2, 0);
    plane2.rotateY(Math.PI / 2);

    // Merge
    const pos1 = plane1.attributes.position.array;
    const uv1 = plane1.attributes.uv.array;
    const ind1 = plane1.index.array;

    const pos2 = plane2.attributes.position.array;
    const uv2 = plane2.attributes.uv.array;
    const ind2 = plane2.index.array;

    const mergedPos = new Float32Array(pos1.length + pos2.length);
    mergedPos.set(pos1);
    mergedPos.set(pos2, pos1.length);

    const mergedUv = new Float32Array(uv1.length + uv2.length);
    mergedUv.set(uv1);
    mergedUv.set(uv2, uv1.length);

    const mergedInd = [];
    // Add indices from plane1
    for (let i = 0; i < ind1.length; i++) mergedInd.push(ind1[i]);
    // Add indices from plane2, offset by vertex count of plane1
    const offset = pos1.length / 3;
    for (let i = 0; i < ind2.length; i++) mergedInd.push(ind2[i] + offset);

    const finalBaseGeo = new THREE.BufferGeometry();
    finalBaseGeo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
    finalBaseGeo.setAttribute('uv', new THREE.BufferAttribute(mergedUv, 2));
    finalBaseGeo.setIndex(mergedInd);

    // Instanced Geometry
    const instancedGeo = new THREE.InstancedBufferGeometry();
    instancedGeo.index = finalBaseGeo.index;
    instancedGeo.attributes.position = finalBaseGeo.attributes.position;
    instancedGeo.attributes.uv = finalBaseGeo.attributes.uv;

    // Attributes data
    const offsets = [];
    const orientations = [];
    const stretches = [];
    const halfRootAngleSin = [];
    const halfRootAngleCos = [];
    const baseQuaternions = [];

    const tempQ = new THREE.Quaternion();
    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < this.count; i++) {
      // 1. Position on Sphere
      const u = Math.random();
      const v = Math.random();
      const theta = u * 2 * Math.PI;
      const phi = Math.acos(2 * v - 1);
      const sinPhi = Math.sin(phi);

      const x = this.radius * sinPhi * Math.cos(theta);
      const y = this.radius * Math.cos(phi);
      const z = this.radius * sinPhi * Math.sin(theta);

      offsets.push(x + this.center.x, y + this.center.y, z + this.center.z);

      // 2. Base Quaternion (Align Local Y to Normal)
      const normal = new THREE.Vector3(x, y, z).normalize();
      tempQ.setFromUnitVectors(up, normal);
      baseQuaternions.push(tempQ.x, tempQ.y, tempQ.z, tempQ.w);

      // 3. Local Twist (Rotation around Y)
      const twistAngle = Math.random() * Math.PI * 2;
      halfRootAngleSin.push(Math.sin(0.5 * twistAngle));
      halfRootAngleCos.push(Math.cos(0.5 * twistAngle));

      // 4. Local Bend (Rotation around X)
      // Combine Twist * Bend for final orientation
      const qTwist = new THREE.Quaternion().setFromAxisAngle(up, twistAngle);
      const bendAngle = (Math.random() * 0.4) - 0.2; // Reduced bend to fix "weird angles"
      const qBend = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), bendAngle);

      const qFinal = qTwist.clone().multiply(qBend); // Local space orientation
      orientations.push(qFinal.x, qFinal.y, qFinal.z, qFinal.w);

      // 5. Stretch
      stretches.push(Math.random() * 0.5); // 0 to 0.5 extra height
    }

    instancedGeo.setAttribute('offset', new THREE.InstancedBufferAttribute(new Float32Array(offsets), 3));
    instancedGeo.setAttribute('orientation', new THREE.InstancedBufferAttribute(new Float32Array(orientations), 4));
    instancedGeo.setAttribute('baseQuaternion', new THREE.InstancedBufferAttribute(new Float32Array(baseQuaternions), 4));
    instancedGeo.setAttribute('halfRootAngleSin', new THREE.InstancedBufferAttribute(new Float32Array(halfRootAngleSin), 1));
    instancedGeo.setAttribute('halfRootAngleCos', new THREE.InstancedBufferAttribute(new Float32Array(halfRootAngleCos), 1));
    instancedGeo.setAttribute('stretch', new THREE.InstancedBufferAttribute(new Float32Array(stretches), 1));

    // Material
    const material = new THREE.ShaderMaterial({
      vertexShader,
      fragmentShader,
      uniforms: {
        time: { value: 0 },
        bladeHeight: { value: bladeHeight },
        tipColor: { value: new THREE.Color(0.2, 0.8, 0.2) }, // Brighter Green
        bottomColor: { value: new THREE.Color(0.0, 0.2, 0.0) },
        playerPos: { value: new THREE.Vector3(0, 0, 0) }
      },
      side: THREE.DoubleSide
    });

    this.mesh = new THREE.Mesh(instancedGeo, material);
    this.mesh.frustumCulled = false; // Always draw
    this.scene.add(this.mesh);
  }

  update(time, playerPos) {
    if (this.mesh) {
      this.mesh.material.uniforms.time.value = time;
      if (playerPos) {
        this.mesh.material.uniforms.playerPos.value.copy(playerPos);
      }
    }
  }

  dispose() {
    if (this.mesh) {
      this.scene.remove(this.mesh);
      this.mesh.geometry.dispose();
      this.mesh.material.dispose();
    }
  }
}
