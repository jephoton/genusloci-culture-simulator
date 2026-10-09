import { BlendFunction, Effect } from "postprocessing";
import { Uniform, Vector2, Vector4 } from "three";
import { MAX_WAVES } from "@/render/effects/director";

const FRAGMENT = /* glsl */ `
  uniform vec4 uWaves[${MAX_WAVES}];
  uniform vec2 uShake;
  uniform float uAspect;

  // Fisheye bulge behind the front plus a sharp refractive ring at the front.
  // wave = (u, v, progress, strength); strength < 0 pulls inward (implosion).
  vec2 displacement(vec2 uv, vec4 wave) {
    if (wave.w == 0.0) return vec2(0.0);
    vec2 d = uv - wave.xy;
    d.x *= uAspect;
    float dist = length(d);
    float radius = wave.z * 0.55;
    float fade = 1.0 - wave.z;
    float ring = exp(-pow((dist - radius) / 0.025, 2.0));
    float bulge = (1.0 - smoothstep(0.0, max(radius, 0.001), dist)) * 0.6;
    vec2 dir = dist > 0.0001 ? d / dist : vec2(0.0);
    dir.x /= uAspect;
    return dir * (ring * 0.035 + bulge * 0.025) * fade * wave.w;
  }

  void mainUv(inout vec2 uv) {
    vec2 offset = uShake;
    for (int i = 0; i < ${MAX_WAVES}; i++) offset -= displacement(uv, uWaves[i]);
    uv += offset;
  }

  void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
    vec3 glow = vec3(0.0);
    for (int i = 0; i < ${MAX_WAVES}; i++) {
      vec4 w = uWaves[i];
      if (w.w == 0.0) continue;
      vec2 d = uv - w.xy;
      d.x *= uAspect;
      float ring = exp(-pow((length(d) - w.z * 0.55) / 0.018, 2.0));
      glow += ring * (1.0 - w.z) * (w.w > 0.0 ? vec3(0.9, 0.85, 1.2) : vec3(0.5, 0.55, 0.8)) * abs(w.w) * 0.35;
    }
    outputColor = vec4(inputColor.rgb + glow, inputColor.a);
  }
`;

export type ScreenWave = { u: number; v: number; progress: number; strength: number };

/** Screen-space shockwaves (up to MAX_WAVES) with a refractive ring, a fisheye bulge and a faint glow, plus global shake. */
export class ShockwaveEffect extends Effect {
  constructor() {
    super("ShockwaveEffect", FRAGMENT, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, Uniform>([
        ["uWaves", new Uniform(Array.from({ length: MAX_WAVES }, () => new Vector4(0, 0, 0, 0)))],
        ["uShake", new Uniform(new Vector2(0, 0))],
        ["uAspect", new Uniform(1)],
      ]),
    });
  }

  setWaves(waves: ScreenWave[]): void {
    const slots = this.uniforms.get("uWaves")?.value as Vector4[];
    for (let i = 0; i < slots.length; i++) {
      const w = waves[i];
      if (w) slots[i].set(w.u, w.v, w.progress, w.strength);
      else slots[i].set(0, 0, 0, 0);
    }
  }

  setShake(x: number, y: number): void {
    (this.uniforms.get("uShake")?.value as Vector2).set(x, y);
  }

  setAspect(aspect: number): void {
    const u = this.uniforms.get("uAspect");
    if (u) u.value = aspect;
  }
}
