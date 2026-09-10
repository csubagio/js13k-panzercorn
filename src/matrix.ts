import { sin, cos, f32 } from "./math";

export const modelMatrix = f32(16);

/** Y * X * Z rotation, then local scale. */
export const matrix = (
  m: Float32Array,
  x = 0,
  y = 0,
  z = 0,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) => {
  rx /= 2;
  ry /= 2;
  rz /= 2;
  const a = sin(ry),
    b = cos(ry),
    c = sin(rx),
    d = cos(rx),
    e = sin(rz),
    f = cos(rz);
  quaternion(
    m,
    b * c * f + a * d * e,
    a * d * f - b * c * e,
    b * d * e - a * c * f,
    b * d * f + a * c * e,
  );
  scale(m, sx, sy, sz);
  m[12] = x;
  m[13] = y;
  m[14] = z;
  m[15] = 1;
};

export const quaternion = (
  m: Float32Array,
  x: number,
  y: number,
  z: number,
  w: number,
) => {
  const xx = x * x,
    yy = y * y,
    zz = z * z,
    xy = x * y,
    xz = x * z,
    yz = y * z,
    wx = w * x,
    wy = w * y,
    wz = w * z;
  m[0] = 1 - 2 * (yy + zz);
  m[1] = 2 * (xy + wz);
  m[2] = 2 * (xz - wy);
  m[3] = 0;
  m[4] = 2 * (xy - wz);
  m[5] = 1 - 2 * (xx + zz);
  m[6] = 2 * (yz + wx);
  m[7] = 0;
  m[8] = 2 * (xz + wy);
  m[9] = 2 * (yz - wx);
  m[10] = 1 - 2 * (xx + yy);
  m[11] = 0;
  m[15] = 1;
};

export const multiply = (
  out: Float32Array,
  a: Float32Array,
  b: Float32Array,
) => {
  const a0 = a[0],
    a1 = a[1],
    a2 = a[2],
    a4 = a[4],
    a5 = a[5],
    a6 = a[6],
    a8 = a[8],
    a9 = a[9],
    a10 = a[10],
    a12 = a[12],
    a13 = a[13],
    a14 = a[14];
  for (let i = 0; i < 16; i += 4) {
    const x = b[i],
      y = b[i + 1],
      z = b[i + 2],
      w = i == 12;
    out[i] = a0 * x + a4 * y + a8 * z + (w ? a12 : 0);
    out[i + 1] = a1 * x + a5 * y + a9 * z + (w ? a13 : 0);
    out[i + 2] = a2 * x + a6 * y + a10 * z + (w ? a14 : 0);
  }
  out[15] = 1;
};

export const translate = (m: Float32Array, x: number, y: number, z: number) => {
  m[12] += m[0] * x + m[4] * y + m[8] * z;
  m[13] += m[1] * x + m[5] * y + m[9] * z;
  m[14] += m[2] * x + m[6] * y + m[10] * z;
};

export const scale = (m: Float32Array, x: number, y = x, z = x) => {
  for (let i = 0; i < 3; i++) {
    m[i] *= x;
    m[i + 4] *= y;
    m[i + 8] *= z;
  }
};

/** Post-rotate about X by -90 degrees. */
export const turnX = (m: Float32Array) => {
  for (let i = 0; i < 3; i++) {
    const y = m[i + 4];
    m[i + 4] = -m[i + 8];
    m[i + 8] = y;
  }
};
