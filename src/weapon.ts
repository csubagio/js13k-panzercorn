import { clock } from "./clock";
import { playSound } from "./audio";
import { Sound } from "./audio-protocol";
import {
  damageEnemy,
  enemies,
  enemyPoint,
  EnemyState,
  type Enemy,
} from "./enemies";
import { handBlobs, handSides, hands } from "./hands";
import {
  clamp,
  cos,
  f32,
  forMap,
  min,
  PI,
  randomBetween,
  sin,
  v3,
  v3addScaled,
  v3copy,
  v3dot,
  v3FromArray,
  v3lerp,
  v3lengthSquared,
  v3Normalize,
  v3set,
  v3sub,
  type Vec3,
} from "./math";
import {
  addBonus,
  addPlayerScore,
  gameOver,
  inverseFlightPoint,
  ScoreMessagePriority,
} from "./player";
import { viewer } from "./shader";
import { spawnSplash } from "./splash";
import { scroll } from "./world";

interface Lock {
  enemy?: Enemy;
  age: number;
}

const laserSamples = 32;
export const weaponLocks = forMap(
  5,
  (): Lock => ({
    age: 0,
  }),
);
const targetPoint = v3();
const laserPoint = v3();
let fistClosed = false,
  lockDelay = 0;
export let sighting = false;
let desktopHeld = false;
let desktopMode = false;
let controllerHeld = false;
const desktopRay = v3(0, 0, -1);
const xrEyes = [v3(), v3()];
const lockNames = ["", "double", "triple", "quad", "penta"];
const lockTitles = ["lockster", "lock king", "lock wiz", "lock god"];
let lockChain = 0;
let xrEyeCount = 0;

export interface Laser {
  tim: number;
  duration: number;
  pnts: Float32Array;
  /** length is the count of written points in the points buffer */
  pointsLength: number;
  trgt?: Enemy;
  strt: Vec3;
  trgtPoint: Vec3;
  offs: Vec3;
  bonus: number;
}

export const lasers = forMap(
  12,
  (): Laser =>
    ({
      tim: 2,
      pnts: f32(laserSamples * 4),
      strt: v3(),
      trgtPoint: v3(),
      offs: v3(),
    }) as Laser,
);

export const setDesktopWeapon = (held: boolean, x: number, y: number) => {
  desktopMode = true;
  desktopHeld = held;
  v3set(desktopRay, x, y, -1);
  v3Normalize(desktopRay);
};

export const clearDesktopWeapon = () => {
  desktopMode = desktopHeld = false;
};

export const resetWeapon = () => {
  playSound(Sound.Stop);
  weaponLocks.map((lock) => (lock.enemy = undefined));
  lasers.map((laser) => {
    laser.tim = 2;
    laser.trgt = undefined;
  });
  fistClosed = sighting = desktopHeld = controllerHeld = desktopMode = false;
  lockDelay = lockChain = 0;
};

export const setXrAimEyes = (left: Vec3, right?: Vec3) => {
  v3copy(xrEyes[0], left);
  xrEyeCount = 1;
  if (right) {
    v3copy(xrEyes[1], right);
    xrEyeCount = 2;
  }
};

export const clearXrAimEyes = () => (xrEyeCount = 0);

export const setControllerWeapon = (held: boolean) => (controllerHeld = held);

const rightHand = () => handSides.indexOf(1) * 18;

const isFistClosed = (start: number) => {
  let distance = 0;
  const palm = start + 15;
  v3FromArray(laserPoint, hands, palm);
  for (let finger = 0; finger < 5; finger++) {
    const tip = start + finger * 3;
    v3FromArray(tempVec, hands, tip);
    v3sub(tempVec, tempVec, laserPoint);
    distance += v3Normalize(tempVec);
  }
  return distance < 0.55;
};

const tempVec = v3();
const rayHit = (ray: Vec3, origin: Vec3, rad: number, growth = 0) => {
  v3sub(tempVec, targetPoint, origin);
  const along = v3dot(ray, tempVec);
  rad += along * growth;
  return along > 0.1 && v3lengthSquared(tempVec) - along * along < rad * rad
    ? along
    : Infinity;
};
const findTarget = (ray: Vec3, origin = viewer) => {
  let sighted: Enemy | undefined,
    nearest = Infinity;
  enemies.map((enemy) => {
    if (enemy.lckable && enemy.lcked < enemy.health) {
      enemyPoint(enemy, targetPoint);
      const along = rayHit(ray, origin, enemy.rad, 0.02);
      if (along < nearest) {
        sighted = enemy;
        nearest = along;
      }
    }
  });
  return sighted;
};

const appendPoint = (laser: Laser) => {
  if (laser.trgt) {
    v3copy(laser.trgtPoint, laser.trgt.pos);
  }

  let t = clamp(laser.tim, 0, 1);
  const travel = scroll * t * (2 - t);
  laser.strt.z += travel;
  for (let point = 0; point < laser.pointsLength; point++)
    laser.pnts[point * 4 + 2] += travel;

  v3copy(laserPoint, laser.strt);
  v3lerp(laserPoint, laser.trgtPoint, t);
  const arc = sin(t * PI);
  v3addScaled(laserPoint, laserPoint, laser.offs, arc);

  const points = laser.pnts;
  if (laser.pointsLength === laserSamples) points.copyWithin(0, 4);
  else laser.pointsLength++;
  const end = (laser.pointsLength - 1) * 4;
  points[end] = laserPoint.x;
  points[end + 1] = laserPoint.y;
  points[end + 2] = laserPoint.z;
  points[end + 3] = arc;
};

const fireLocks = (start: number) => {
  if (start < 0) v3set(tempVec, 0, 2, 0);
  else v3FromArray(tempVec, hands, start + 15);
  inverseFlightPoint(targetPoint, tempVec);
  let delay = 0,
    bonus = 0,
    last: Laser | undefined;
  weaponLocks.map((lock, finger) => {
    const laser = lasers.find((laser) => laser.tim > 1.5);
    if (laser && lock.enemy) {
      if (last) last.bonus = 0;
      laser.bonus = bonus++;
      last = laser;
      playSound(Sound.Pew);
      laser.trgt = lock.enemy;
      v3copy(laser.strt, targetPoint);
      laser.tim = 0;
      v3sub(tempVec, lock.enemy.pos, laser.strt);
      laser.duration = v3Normalize(tempVec) / 100 + delay;
      delay += 0.1;
      laser.pointsLength = 0;
      let ang = randomBetween(0.7, 0.9) + (1.2 * finger) / 4;
      laser.offs.x = cos(ang) * 30;
      laser.offs.y = sin(ang) * 18;
      appendPoint(laser);
      appendPoint(laser);
      lock.enemy = undefined;
      if (bonus < 4) lockChain = 0;
    }
  });
};

export const fireDesktopWeapon = () => {
  desktopHeld = false;
  playSound(Sound.Stop);
  fireLocks(-1);
  fistClosed = false;
  lockDelay = 0;
};

const updateLasers = () => {
  lasers.map((laser) => {
    if (!laser.trgt?.health) laser.trgt = undefined;
    if (laser.tim <= 1.5) {
      if (laser.tim < 1) {
        laser.tim += clock.dlta / laser.duration;
      } else {
        if (laser.trgt) {
          spawnSplash(laser.trgt.pos);
          playSound(Sound.Boom);
          damageEnemy(laser.trgt);
          const bonus = laser.bonus * 10;
          if (bonus)
            addPlayerScore(
              bonus,
              `${lockNames[laser.bonus]} lock +${bonus}!`,
              ScoreMessagePriority.LockBonus,
            );
          if (laser.bonus > 2) {
            const chain = min(3, lockChain++),
              score = (chain + 1) * 100;
            addBonus(
              score,
              `${lockTitles[chain]}! +${score}`,
              ScoreMessagePriority.LockBonus,
            );
          }
          laser.trgt = undefined;
        }
        laser.tim += clock.dlta;
      }
      appendPoint(laser);
    }
  });
};

const tempRay = v3();
export const updateWeapon = () => {
  updateLasers();
  const start = rightHand();
  if (gameOver || (start < 0 && !desktopMode)) {
    if (fistClosed) playSound(Sound.Stop);
    fistClosed = sighting = false;
    lockDelay = 0;
    return;
  }
  weaponLocks.map((lock) => {
    if (lock.enemy) {
      lock.age += clock.dlta * 10;
      if (lock.enemy.pos.z >= 5 || lock.enemy.stat === EnemyState.inactive) {
        lock.enemy.lcked = 0;
        lock.enemy = undefined;
      }
    }
  });
  const palm = start + 15;
  let target: Enemy | undefined;
  if (start >= 0 && !desktopMode) {
    v3FromArray(laserPoint, hands, palm);
    for (let eye = 0; eye < xrEyeCount && !target; eye++) {
      v3sub(tempRay, laserPoint, xrEyes[eye]);
      v3Normalize(tempRay);
      target = findTarget(tempRay, xrEyes[eye]);
    }
  } else {
    v3copy(tempRay, desktopRay);
    target = findTarget(tempRay);
  }
  sighting = !!target;
  const closed = desktopMode
    ? desktopHeld
    : handBlobs[(start / 18) | 0]
      ? controllerHeld
      : isFistClosed(start);
  if (closed && !fistClosed) playSound(Sound.Aim);
  if (closed) {
    if (lockDelay > 0) {
      lockDelay -= clock.dlta;
    } else {
      const next = weaponLocks.find((lock) => !lock.enemy);
      if (target && next) {
        next.enemy = target;
        next.age = 0;
        target.lcked++;
        playSound(Sound.Lock);
        lockDelay = 0.2;
      }
    }
  } else if (fistClosed) {
    playSound(Sound.Stop);
    fireLocks(start);
    lockDelay = 0;
  }
  fistClosed = closed;
};
