export const {
  PI,
  sin,
  cos,
  tan,
  atan2,
  abs,
  random,
  min,
  max,
  floor,
  round,
  pow,
  hypot,
  exp,
  tanh,
  sqrt,
} = Math;
export const PI2 = PI * 2;
export const f32 = (value: number | ArrayLike<number>) =>
  new Float32Array(value as number);
let delta = 0;

export const setDelta = (value: number) => {
  delta = value;
};

export const clamp = (a: number, _min: number, _max: number) => {
  return min(_max, max(_min, a));
};
export const lerp = (a: number, b: number, x: number) => {
  return a + (b - a) * x;
};
export const damp = (a: number, b: number, speed: number) => {
  return lerp(b, a, exp(-speed * delta));
};

export const randomSignedUnit = () => {
  return random() * 2 - 1;
};
export const randomBetween = (x: number, y: number) => {
  return lerp(x, y, random());
};

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}
export const v3 = (x: number = 0, y: number = x, z: number = y) => {
  return { x, y, z };
};

export const v3Normalize = (v: Vec3) => {
  let len = v3lengthSquared(v);
  if (len <= 0.001) return 0;
  len = sqrt(len);
  v.x /= len;
  v.y /= len;
  v.z /= len;
  return len;
};

export const v3FromArray = (t: Vec3, a: number[], i: number) =>
  v3set(t, a[i], a[i + 1], a[i + 2]);

export const v3sub = (t: Vec3, a: Vec3, b: Vec3) => {
  t.x = a.x - b.x;
  t.y = a.y - b.y;
  t.z = a.z - b.z;
};

export const v3addScaled = (t: Vec3, a: Vec3, b: Vec3, s: number) => {
  t.x = a.x + b.x * s;
  t.y = a.y + b.y * s;
  t.z = a.z + b.z * s;
};

export const v3lerp = (a: Vec3, b: Vec3, s: number) => {
  a.x += (b.x - a.x) * s;
  a.y += (b.y - a.y) * s;
  a.z += (b.z - a.z) * s;
};

export const v3damp = (a: Vec3, b: Vec3, s: number) => {
  a.x = damp(a.x, b.x, s);
  a.y = damp(a.y, b.y, s);
  a.z = damp(a.z, b.z, s);
};

export const v3copy = (a: Vec3, b: Vec3) => {
  a.x = b.x;
  a.y = b.y;
  a.z = b.z;
};

export const v3set = (t: Vec3, x: number, y: number = x, z: number = y) => {
  t.x = x;
  t.y = y;
  t.z = z;
};

export const v3dot = (a: Vec3, b: Vec3) => a.x * b.x + a.y * b.y + a.z * b.z;
export const v3lengthSquared = (v: Vec3) => v3dot(v, v);

export const forMap = <T>(count: number, fn: (i: number) => T): T[] => {
  return Array.from<number, T>({ length: count }, (_, i) => fn(i));
};

export const forIndex = (count: number, fn: (i: number) => void) => {
  for (let i = 0; i < count; ++i) fn(i);
};

export const shuffle = (a: any[]) => a.sort(() => random() - 0.5);
