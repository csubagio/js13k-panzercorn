import { clock } from "./clock";
import { PI, sin, abs, f32, forMap, cos, pow } from "./math";
import {
  ButterflyPart,
  HawkPart,
  ToadPart,
  UnicornPart,
  WhalePart,
} from "./meshes";
import { updatePlayer } from "./player";

export const unicornAnim = f32(UnicornPart.Count);
export const toadAnim = f32(ToadPart.Count);
export const hawkAnim = f32(HawkPart.Count);
export const whaleAnim = f32(WhalePart.Count);
export const butterflyAnim = f32(ButterflyPart.Count);

export const animateWhale = (swim: number) => {
  whaleAnim.fill(0);
  swim += 2.6;
  whaleAnim[WhalePart.head_006] = sin(swim) * 0.3;
  swim -= 1.5;
  whaleAnim[WhalePart.whale] = sin(swim) * 0.3;
  swim -= 1;
  whaleAnim[WhalePart.tail1_001] = sin(swim) * 0.3;
  swim -= 1;
  whaleAnim[WhalePart.tail2_001] = sin(swim) * 0.4;
  swim -= 1;
  whaleAnim[WhalePart.tail3_001] = sin(swim) * 0.5;
  swim -= 1;
  whaleAnim[WhalePart.r_tail_001] = whaleAnim[WhalePart.l_tail_001] =
    sin(swim) * 0.6;
  swim -= 3.2;
  whaleAnim[WhalePart.r_fin1] = whaleAnim[WhalePart.l_fin1] = sin(swim) * 0.8;
  swim -= 1.2;
  whaleAnim[WhalePart.r_fin2] = whaleAnim[WhalePart.l_fin2] = sin(swim) * 0.5;
};

const gait1 = 0;
const gait2 = gait1 + PI * 0.3;
const gait3 = PI * 1.9;
const gait4 = gait3 + PI * 0.3;

/** [part, amplitude, phase] */
// prettier-ignore
const gait = [
  UnicornPart.unicorn, 0.01, -1,
  UnicornPart.neck, 0.25, 0.8,
  UnicornPart.head, 0.25, 2.5,

  UnicornPart.r_front_shoulder, 0.25, gait1,
  UnicornPart.r_front_leg, 0.5, gait1,
  UnicornPart.r_front_calf, 0.85, gait1 - 1.5,
  UnicornPart.r_front_shin, 0.52, gait1 - 2.1,

  UnicornPart.l_front_shoulder, 0.25, gait2,
  UnicornPart.l_front_leg, 0.5, gait2,
  UnicornPart.l_front_calf, 0.85, gait2 -1.5,
  UnicornPart.l_front_shin, 0.52, gait2 -2.1,

  UnicornPart.r_butt, 0.6, gait3,
  UnicornPart.r_rear_leg, 0.3, gait3 + 1,
  UnicornPart.r_rear_calf, 0.4, gait3 + 2,
  UnicornPart.r_rear_shin, 0.5, gait3 + 2.5,

  UnicornPart.l_butt, 0.6, gait4,
  UnicornPart.l_rear_leg, 0.3, gait4 + 1,
  UnicornPart.l_rear_calf, 0.4, gait4 + 2,
  UnicornPart.l_rear_shin, 0.5, gait4 + 2.5,

  UnicornPart.tail1, 0.2, 0,
  UnicornPart.tail2, 0.3, -1,
  UnicornPart.tail3, 0.4, -2,
  UnicornPart.tail4, 0.5, -3,
];

export const animateUnicorn = (t: number) => {
  t += PI;
  unicornAnim.fill(0);
  for (let i = 0; i < gait.length; i += 3) {
    let si = sin(t + gait[i + 2]);
    si = 0.5 + 0.5 * si;
    si = si * si * (3 - 2 * si);
    si = si * 2 - 1;
    unicornAnim[gait[i]] += gait[i + 1] * si;
  }
};

export const animateHawk = (t: number) => {
  hawkAnim.fill(0);
  hawkAnim[HawkPart.head_004] = abs(sin(clock.tim)) * 0.3;
  hawkAnim[HawkPart.r_wing] = hawkAnim[HawkPart.l_wing] = sin(t) * 0.9;
  hawkAnim[HawkPart.r_wing2] = hawkAnim[HawkPart.l_wing2] =
    sin((t -= 0.5)) * 0.9;
  hawkAnim[HawkPart.r_feather5] = hawkAnim[HawkPart.l_feather5] =
    sin((t -= 0.5)) * 0.5;
  hawkAnim[HawkPart.butt] = sin((t += 0.5)) * 0.2;
  hawkAnim[HawkPart.tail] = sin((t -= 0.1)) * 0.3;
  hawkAnim[HawkPart.l_tail] = hawkAnim[HawkPart.r_tail] = sin((t -= 0.1)) * 0.4;
};

export const animateButterfly = () => {
  let flap = clock.tim * 13 + pow(sin(clock.tim), 2) * 11;
  butterflyAnim.fill(0);
  butterflyAnim[ButterflyPart.r_wing1] = butterflyAnim[ButterflyPart.l_wing1] =
    sin(flap) * 0.9;
  butterflyAnim[ButterflyPart.r_wing2_001] = butterflyAnim[
    ButterflyPart.l_wing2_001
  ] = sin(flap - 0.8) * 0.9;
};

export const animate = () => {
  animateButterfly();
};
