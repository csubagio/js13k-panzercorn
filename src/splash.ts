import { playSound } from "./audio";
import { Sound } from "./audio-protocol";
import { clock } from "./clock";
import {
  cos,
  f32,
  forMap,
  PI2,
  pow,
  random,
  randomBetween,
  sin,
  v3,
  v3copy,
  type Vec3,
} from "./math";
import { scroll } from "./world";

interface Splash {
  orgn: Vec3;
  pnts: Float32Array;
  age: number;
}

export const particleCount = 128;
export const particleDataLength = particleCount * 4;
export const splashes = forMap(
  32,
  (): Splash => ({
    orgn: v3(),
    pnts: f32(particleDataLength),
    age: 2,
  }),
);

export const spawnSplash = (point: Vec3) => {
  for (const splash of splashes) {
    if (splash.age >= 1.5) {
      v3copy(splash.orgn, point);
      splash.age = 0;

      const p = splash.pnts;
      for (let i = 0; i < particleCount * 4; ) {
        const ang = randomBetween(0, PI2);
        const dist = 5 + 15 * pow(random(), 2);
        p[i++] = sin(ang) * dist;
        p[i++] = (cos(ang) + 0.5) * dist;
        p[i++] = randomBetween(-9, 4);
        p[i++] = randomBetween(0.2, 1);
      }

      return;
    }
  }
};

export const updateSplashes = () => {
  splashes.map((s) => {
    if (s.age < 1.5) {
      s.orgn.z += scroll;
      s.age += clock.dlta;
    }
  });
};
