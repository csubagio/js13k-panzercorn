import vertexShader from "./renderer.vert.glsl";
import fragmentShader from "./renderer.frag.glsl";
import { cvs, gl } from "./canvas";
import { GL } from "./gl";
import { CompoundMesh } from "./compound";
import {
  atan2,
  cos,
  f32,
  forIndex,
  forMap,
  hypot,
  PI2,
  sin,
  v3,
  type Vec3,
} from "./math";
import { clock } from "./clock";
import {
  matrix,
  modelMatrix,
  multiply,
  quaternion,
  scale,
  translate,
  turnX,
} from "./matrix";

const glyphOffsets = f32(128 * 4);
const flightMatrix = f32(16);

export const enum MeshKind {
  Sky,
  Floor,
  Carpet,
  Capsulite,
  Trail,
  Label,
  Color,
  Asteroid,
  Splash,
  Hurt,
}
export let viewer = v3(0, 1.5, 0);

const program = gl.createProgram();
forIndex(2, (i) => {
  const source = [vertexShader, fragmentShader][i];
  const shader = gl.createShader(GL.VERTEX_SHADER - i)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (__DEV__ && !gl.getShaderParameter(shader, GL.COMPILE_STATUS))
    console.error(source, gl.getShaderInfoLog(shader));
  gl.attachShader(program, shader);
});
gl.linkProgram(program);
if (__DEV__ && !gl.getProgramParameter(program, GL.LINK_STATUS))
  console.error(vertexShader, fragmentShader, gl.getProgramInfoLog(program));
export const [
  projection,
  view,
  clockUniform,
  kindUniform,
  transform,
  shapeUniform,
  mainColor,
  trailUniform,
  shaderFog,
  worldScrollUniform,
  flightUniform,
  pointScaleUniform,
] = [
  "pr",
  "vw",
  "cl",
  "k",
  "md",
  "sp",
  "c",
  "tr[0]",
  "s",
  "ws",
  "fm",
  "pc",
].map((name) => gl.getUniformLocation(program, name)!);

gl.enable(GL.DEPTH_TEST);
gl.enable(GL.BLEND);
gl.blendFunc(GL.SRC_ALPHA, GL.ONE_MINUS_SRC_ALPHA);
gl.useProgram(program);

export const setKind = (kind: MeshKind) => {
  gl.uniform1i(kindUniform, kind);
};

export const setFlightTransform = (
  enabled: boolean,
  x = 0,
  y = 0,
  pitch = 0,
  yaw = 0,
  roll = 0,
) => {
  matrix(
    flightMatrix,
    0,
    0,
    0,
    enabled ? pitch : 0,
    enabled ? yaw : 0,
    enabled ? roll : 0,
  );
  if (enabled) {
    flightMatrix[12] = -(flightMatrix[0] * x + flightMatrix[4] * y);
    flightMatrix[13] = -(flightMatrix[1] * x + flightMatrix[5] * y);
    flightMatrix[14] = -(flightMatrix[2] * x + flightMatrix[6] * y);
  }
  gl.uniformMatrix4fv(flightUniform, false, flightMatrix);
};

export const drawGrid = (
  density = 20,
  instances = density - 1,
  prim = GL.TRIANGLE_STRIP,
) => {
  gl.uniform3f(clockUniform, clock.tim, density - 1, density - 1);
  gl.drawArraysInstanced(prim, 0, density * 2, instances);
};

export const drawPoints = (count: number) => gl.drawArrays(GL.POINTS, 0, count);
export const setPointScale = () =>
  gl.uniform1f(pointScaleUniform, cvs.height / 2);

export const setModelTS = (
  x: number = 0,
  y: number = 0,
  z: number = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) => setModelTRS(x, y, z, 0, 0, 0, sx, sy, sz);

export const setModelTRS = (
  x: number,
  y: number,
  z: number,
  rx = 0,
  ry = 0,
  rz = 0,
  sx = 1,
  sy = sx,
  sz = sx,
) => {
  matrix(modelMatrix, x, y, z, rx, ry, rz, sx, sy, sz);
  gl.uniformMatrix4fv(transform, false, modelMatrix);
};

/** shape uniform actually varies by kind */
export const shape = (
  startRadius: number,
  endRadius: number,
  length: number,
  squareness: number,
) => {
  gl.uniform4f(shapeUniform, startRadius, endRadius, length, squareness);
};

export const label = (text: string) => {
  const spacing = 0.45;
  forIndex(text.length, (i) => {
    const character = text.charCodeAt(i);
    const offset = i * 4;
    glyphOffsets[offset] = character & 15;
    glyphOffsets[offset + 1] = character >> 4;
    glyphOffsets[offset + 2] = (i + 0.5 - text.length / 2) * spacing;
  });
  gl.uniform4fv(trailUniform, glyphOffsets, 0, text.length * 4);
  drawGrid(2, text.length);
};

export const lookAt = (roll = 0, x = viewer.x, y = viewer.y, z = viewer.z) => {
  x -= modelMatrix[12];
  y -= modelMatrix[13];
  z -= modelMatrix[14];
  setModelTRS(
    modelMatrix[12],
    modelMatrix[13],
    modelMatrix[14],
    atan2(-y, hypot(x, z)),
    atan2(x, z),
    roll,
    hypot(modelMatrix[0], modelMatrix[1], modelMatrix[2]),
    hypot(modelMatrix[4], modelMatrix[5], modelMatrix[6]),
    hypot(modelMatrix[8], modelMatrix[9], modelMatrix[10]),
  );
};

const compoundTransforms = forMap(9, () => f32(16));
const localTransform = f32(16);
export const renderCompound = (
  compound: CompoundMesh,
  jointAngles: Float32Array,
  density = 100,
) => {
  const quantum = compound[0];
  compoundTransforms[0].set(modelMatrix);
  setKind(MeshKind.Capsulite);
  for (let i = 1, part = 0; i < compound.length; ) {
    const header = compound[i++];
    if (header == MeshKind.Color) {
      setColorOKLCH(compound[i++], compound[i++], compound[i++]);
    } else {
      const partIndex = part++;
      const depth = (header & 255) >> 5,
        localX = compound[i++] * quantum,
        localY = compound[i++] * quantum,
        localZ = compound[i++] * quantum;
      let localRotationX = compound[i++] / 99,
        localRotationY = compound[i++] / 99,
        localRotationZ = compound[i++] / 99,
        localRotationW = compound[i++] / 99;
      const animation = jointAngles[partIndex] / 2;
      if (animation) {
        const sine = sin(animation),
          cosine = cos(animation),
          x = localRotationW * sine + localRotationX * cosine,
          y = localRotationY * cosine + localRotationZ * sine,
          z = localRotationZ * cosine - localRotationY * sine,
          w = localRotationW * cosine - localRotationX * sine;
        localRotationX = x;
        localRotationY = y;
        localRotationZ = z;
        localRotationW = w;
      }

      quaternion(
        localTransform,
        localRotationX,
        localRotationY,
        localRotationZ,
        localRotationW,
      );
      localTransform[12] = localX;
      localTransform[13] = localY;
      localTransform[14] = localZ;
      const world = compoundTransforms[depth + 1];
      multiply(world, compoundTransforms[depth], localTransform);

      {
        const tipLength = compound[i++] * quantum;
        shape(
          compound[i++] * quantum,
          compound[i++] * quantum,
          tipLength / 2,
          compound[i++] / 99,
        );
        const aspect = 1 + compound[i++] / 99;
        modelMatrix.set(world);
        translate(modelMatrix, 0, tipLength / 2, 0);
        turnX(modelMatrix);
        scale(modelMatrix, 1, aspect);
      }
      gl.uniformMatrix4fv(transform, false, modelMatrix);
      drawGrid(density);
    }
  }
};

export const setUniformColorOKLCH = (
  uniform: WebGLUniformLocation,
  luminance: number,
  sat: number,
  hue: number,
) => {
  sat = (sat * 0.3) / 9.0;
  hue = (hue * PI2) / 32;
  gl.uniform3f(uniform, luminance / 9.0, sat * cos(hue), sat * sin(hue));
};

/** values are in a "compressed" scale:
 * luminance is 0-9, mapped to 0-1
 * saturation is 0-9 mapped to 0-0.3
 * hue is 0-32 mapped to 0-2PI
 */
export const setColorOKLCH = (luminance: number, sat: number, hue: number) => {
  setUniformColorOKLCH(mainColor, luminance, sat, hue);
};
export const setColorVec = (color: Vec3) =>
  setColorOKLCH(color.x, color.y, color.z);
