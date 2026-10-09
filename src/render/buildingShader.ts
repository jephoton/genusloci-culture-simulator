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
      n = mat3(instanceMatrix) * n;
    #endif
    vec4 world = modelMatrix * local;
    vWorld = world.xyz;
    vNormal = normalize(mat3(modelMatrix) * n);
    vSeed = aSeed;
    vLit = aLit;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`;

/** Dark facades with a grid of warm windows (≈3 m × 3.5 m in world space) that flicker; values > 1 feed bloom. */
export const BUILDING_FRAGMENT = /* glsl */ `
  uniform float uTime;
  varying vec3 vWorld;
  varying vec3 vNormal;
  varying float vSeed;
  varying float vLit;
  float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
  void main() {
    float light = 0.55 + 0.45 * max(dot(vNormal, normalize(vec3(0.4, 0.8, 0.3))), 0.0);
    vec3 color = vec3(0.045, 0.05, 0.075) * light;
    float wall = 1.0 - step(0.5, abs(vNormal.y));
    vec2 facade = vec2(abs(vNormal.x) > 0.5 ? vWorld.z : vWorld.x, vWorld.y);
    vec2 size = vec2(0.3, 0.35);
    vec2 cell = floor(facade / size);
    vec2 f = fract(facade / size);
    float window = step(0.25, f.x) * step(f.x, 0.75) * step(0.3, f.y) * step(f.y, 0.8) * step(0.2, vWorld.y);
    float roll = hash(cell + vSeed * 17.0);
    float on = step(roll, vLit) * wall;
    float flicker = 0.8 + 0.2 * sin(uTime * (1.5 + roll * 2.0) + roll * 40.0);
    color = mix(color, vec3(1.7, 1.25, 0.75) * flicker, window * on);
    color += (1.0 - wall) * vec3(0.03, 0.035, 0.05);
    gl_FragColor = vec4(color, 1.0);
  }
`;
