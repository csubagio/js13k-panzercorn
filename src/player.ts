import { clock } from "./clock";
import { handBlobs, handSides, hands } from "./hands";
import {
  abs,
  clamp,
  cos,
  damp,
  forMap,
  lerp,
  max,
  min,
  sin,
  v3,
  v3addScaled,
  v3copy,
  v3FromArray,
  v3lengthSquared,
  v3Normalize,
  v3set,
  v3sub,
  type Vec3,
} from "./math";
import { playSound } from "./audio";
import { Sound } from "./audio-protocol";
import { scrollSpeed } from "./world";

export const flightBounds = { x: 26, y: 16 };
export const flightPosition = v3(0, 1, 0);
export const flightVelocity = v3(0, 0, 0);
export const flightControl = v3(0, 0, 0);
export const flightOrb = v3(0, 0, 0);
const palmPoint = v3(),
  rollAxis = v3();
export let showFlightOrb = false;
export let flightRoll = 0;
export let flightPitch = 0;
export let flightYaw = 0;
export let health = 5;
export let hurt = 0;
export let gameOver = false;
export let playerScore = 0;
export let scoreMultiplier = 1;
let invulnerable = 0,
  multiplierTimer = 0,
  cr = 1,
  sr = 0,
  cp = 1,
  sp = 0,
  cy = 1,
  sy = 0;

export const enum ScoreMessagePriority {
  None,
  EnemyHit,
  LockBonus,
  StuntBonus,
}

interface ScoreMessage {
  msg?: string;
  priority: ScoreMessagePriority;
  timer: 0;
}

const scoreMessageCount = 7;
export const scoreMessages = forMap(
  scoreMessageCount,
  (): ScoreMessage =>
    ({
      timer: 0,
    }) as ScoreMessage,
);

export const addPlayerScore = (
  amount: number,
  message: string,
  priority: ScoreMessagePriority,
) => {
  playerScore += amount;
  let insert = -1;
  for (let i = 0; i < scoreMessageCount; ++i) {
    if (scoreMessages[i].priority < priority) {
      insert = i;
    }
    if (!scoreMessages[i].msg) {
      insert = i;
      break;
    }
  }

  if (insert >= 0) {
    scoreMessages[insert].msg = message;
    scoreMessages[insert].priority = priority;
    scoreMessages.sort((a, b) => a.timer - b.timer);
  }
};

export const addBonus = (
  amount: number,
  message: string,
  priority: ScoreMessagePriority,
) => {
  addPlayerScore(amount, message, priority);
  scoreMultiplier++;
};

export const resetPlayer = () => {
  health = 5;
  hurt = 0;
  gameOver = false;
  playerScore = 0;
  scoreMultiplier = 1;
  invulnerable = multiplierTimer = 0;
  v3set(flightPosition, 0, 1, 0);
  v3set(flightVelocity, 0);
  scoreMessages.map((m) => (m.msg = undefined));
};

export const giveInvulnerable = (d: number) => {
  invulnerable = d;
};

export const hitPlayer = () => {
  if (invulnerable > 0 || gameOver) return false;
  health--;
  hurt = 1;
  playSound(Sound.Hurt);
  invulnerable = 0.9;
  gameOver = health === 0;
  return true;
};

export const healPlayer = () => {
  health = min(5, health + 1);
};

/** Maps a stable game-world point into the player-local rendered world. */
export const flightWorldPoint = (
  out: Vec3,
  x: number,
  y: number,
  z: number,
) => {
  x -= flightPosition.x;
  y -= flightPosition.y;
  const rx = cr * x - sr * y;
  const ry = sr * x + cr * y;
  const py = cp * ry - sp * z,
    pz = sp * ry + cp * z;
  out.x = cy * rx + sy * pz;
  out.y = py;
  out.z = -sy * rx + cy * pz;
};

/** Maps a tracked/render-space point back into the stable game world. */
export const inverseFlightPoint = (out: Vec3, point: Vec3) => {
  const x = cy * point.x - sy * point.z,
    rz = sy * point.x + cy * point.z;
  const y = cp * point.y + sp * rz;
  const z = -sp * point.y + cp * rz;
  out.x = cr * x + sr * y + flightPosition.x;
  out.y = -sr * x + cr * y + flightPosition.y;
  out.z = z;
};

const desktopInput = v3(),
  vrInput = v3(),
  controllerInput = v3();
let vrActive = false,
  controllerActive = false;

const deadZone = (value: number) => {
  const magnitude = abs(value);
  return magnitude < 0.1
    ? 0
    : clamp((magnitude - 0.12) / 0.44, 0, 1) ** 2 * (value < 0 ? -1 : 1);
};

export const setDesktopFlight = (x: number, y: number) => {
  v3set(desktopInput, x, y, 0);
};

export const clearControllerFlight = () => (controllerActive = false);
export const setControllerFlight = (x: number, y: number) => {
  v3set(controllerInput, deadZone(x), deadZone(y), 0);
  controllerActive = true;
};

export const clearVrFlightControl = () => {
  showFlightOrb = false;
  vrActive = false;
};

export const updateVrFlightControl = (head: { y: number }) => {
  const targetHeight = head.y - 0.3;
  v3set(flightOrb, -0.4, lerp(flightOrb.y, targetHeight, 0.01), -0.4);
  showFlightOrb = true;
  vrActive = false;
  for (let strt = 0; strt < hands.length; strt += 18) {
    if (handBlobs[strt / 18] || handSides[strt / 18]) continue;
    const palm = strt + 15;
    v3FromArray(palmPoint, hands, palm);
    v3sub(palmPoint, palmPoint, flightOrb);
    if (v3lengthSquared(palmPoint) > 0.16) continue;
    const height = palmPoint.y;
    v3FromArray(rollAxis, hands, strt + 12);
    v3FromArray(palmPoint, hands, strt);
    v3sub(rollAxis, rollAxis, palmPoint);
    v3Normalize(rollAxis);
    vrInput.x = deadZone(rollAxis.y);
    const distance = abs(height) - 0.03;
    vrInput.y =
      distance > 0
        ? clamp(distance / 0.12, 0, 1) ** 2 * (height < 0 ? -1 : 1)
        : 0;
    vrActive = true;
    break;
  }
  v3copy(
    flightControl,
    vrActive ? vrInput : controllerActive ? controllerInput : desktopInput,
  );
};

export const touchInput = v3(0);

export const updatePlayer = () => {
  scoreMessages.map((m) => {
    if (m.msg) {
      m.timer += clock.dlta;
      if (m.timer > 1) {
        m.timer = 0;
        m.msg = undefined;
      }
    }
  });

  invulnerable = max(0, invulnerable - clock.dlta);
  hurt = max(0, hurt - clock.dlta);

  if (scoreMultiplier > 1 && (multiplierTimer -= clock.dlta) < 0) {
    scoreMultiplier--;
    multiplierTimer = 3;
  }

  if (!showFlightOrb) v3addScaled(flightControl, desktopInput, touchInput, 1);
  let controlSpeed = 16 + scrollSpeed * 2;
  flightVelocity.x = damp(flightVelocity.x, flightControl.x * controlSpeed, 4);
  flightVelocity.y = damp(flightVelocity.y, flightControl.y * controlSpeed, 4);
  v3addScaled(flightPosition, flightPosition, flightVelocity, clock.dlta);
  flightPosition.x = clamp(flightPosition.x, -flightBounds.x, flightBounds.x);
  flightPosition.y = clamp(flightPosition.y, 0.75, flightBounds.y);
  if (abs(flightPosition.x) === flightBounds.x) flightVelocity.x = 0;
  if (flightPosition.y === 0.75 || flightPosition.y === flightBounds.y)
    flightVelocity.y = 0;
  flightRoll = damp(flightRoll, flightVelocity.x * 0.02, 3);
  flightPitch = damp(
    flightPitch,
    (flightPosition.y / flightBounds.y - 0.5) * 0.36,
    3,
  );
  flightYaw = showFlightOrb ? 0 : damp(flightYaw, touchInput.z, 3);
  cr = cos(flightRoll);
  sr = sin(flightRoll);
  cp = cos(flightPitch);
  sp = sin(flightPitch);
  cy = cos(flightYaw);
  sy = sin(flightYaw);
};
