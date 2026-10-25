/** Instanced unit boxes (base at y = 0); per-instance aSeed and aLit (share of lit windows). */
export const BUILDING_VERTEX = /* glsl */ `
  attribute float aSeed;
  attribute float aLit;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  varying float vLit;
  void main() {
    vec4 local = vec4(position + vec3(0.0, 0.5, 0.0), 1.0);
    vec3 n = normal;
    #ifdef USE_INSTANCING
      local = instanceMatrix * local;
      mat3 scaleMatrix = mat3(instanceMatrix);
      n /= vec3(dot(scaleMatrix[0], scaleMatrix[0]), dot(scaleMatrix[1], scaleMatrix[1]), dot(scaleMatrix[2], scaleMatrix[2]));
      n = scaleMatrix * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vSeed = aSeed;
    vLit = aLit;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Painted miniature facades, large sparse windows, and visible cornices instead of glittering towers. */
export const BUILDING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  uniform float uFocus;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  varying float vLit;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float light = 0.55 + 0.45 * max(dot(vNormal, normalize(vec3(0.4, 0.8, 0.3))), 0.0);
    float choice = floor(vSeed * 6.0);
    vec3 paint = vec3(0.48, 0.59, 0.57);
    if (choice < 1.0) paint = vec3(0.65, 0.43, 0.36);
    else if (choice < 2.0) paint = vec3(0.68, 0.61, 0.45);
    else if (choice < 3.0) paint = vec3(0.39, 0.53, 0.58);
    else if (choice < 4.0) paint = vec3(0.62, 0.52, 0.55);
    else if (choice < 5.0) paint = vec3(0.65, 0.64, 0.55);
    vec3 color = paint * light * 0.72;
    float wall = 1.0 - step(0.5, abs(vNormal.y));
    vec2 facade = vec2(abs(vNormal.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
    vec2 size = vec2(1.25, 1.4);
    vec2 cell = floor(facade / size);
    vec2 f = fract(facade / size);
    float window = step(0.28, f.x) * step(f.x, 0.72) * step(0.28, f.y) * step(f.y, 0.76) * step(0.35, vWorld.y);
    float roll = hash(cell + vSeed * 17.0);
    float on = step(roll, vLit) * wall;
    float flicker = 0.8 + 0.2 * sin(uTime * (1.5 + roll * 2.0) + roll * 40.0);
    color = mix(color, mix(vec3(0.075, 0.12, 0.15), vec3(0.95, 0.66, 0.31) * flicker, on), window * wall);
    float sill = step(0.21, f.y) * step(f.y, 0.28) * step(0.22, f.x) * step(f.x, 0.78);
    color = mix(color, paint * 0.9, sill * wall);
    gl_FragColor = vec4(color * uFocus, 1.0);
  }
`;

export const ROOF_FRAGMENT = /* glsl */ `
  uniform float uFocus;
  varying vec3 vNormal;
  varying float vSeed;
  void main() {
    vec3 roof = vSeed < 0.33 ? vec3(0.39, 0.22, 0.20) : vSeed < 0.66 ? vec3(0.20, 0.32, 0.35) : vec3(0.33, 0.29, 0.38);
    float light = 0.65 + 0.35 * max(dot(normalize(vNormal), normalize(vec3(0.4, 0.8, 0.3))), 0.0);
    gl_FragColor = vec4(roof * light * uFocus, 1.0);
  }
`;
