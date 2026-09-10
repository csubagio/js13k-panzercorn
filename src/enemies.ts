import { clock } from "./clock";
import {
  addPlayerScore,
  flightBounds,
  flightPosition,
  flightWorldPoint,
  hitPlayer,
  scoreMultiplier,
  ScoreMessagePriority,
} from "./player";
import {
  abs,
  atan2,
  clamp,
  cos,
  damp,
  forMap,
  lerp,
  max,
  PI,
  PI2,
  pow,
  randomBetween,
  sin,
  v3,
  v3addScaled,
  v3copy,
  v3damp,
  v3Normalize,
  v3set,
  v3sub,
  type Vec3,
} from "./math";
import { scroll } from "./world";
import { viewer } from "./shader";
import { animateHawk, animateUnicorn, animateWhale } from "./animate";
import { spawnSplash } from "./splash";
import { playSound } from "./audio";
import { Sound } from "./audio-protocol";

export const butterflyBeamRadius = 0.5;
export const eagleBeamHeightOffset = 1;
export const unicornX = 20;
export const unicornZ = -30;

export const enum EnemyKind {
  // first set are the compound based animalcorns
  buttercorn,
  toadicorn,
  whalicorn,
  eaglicorn,
  unicorn,
  // these are projectiles that have their own lives
  bubble,
}

// health, score, radius
// prettier-ignore
const enemyStats = [
  1, 10, 2, // butter
  3, 50, 2, // toad
  20, 200, 12, // whali
  50, 500, 8, // eagli
  100, 1000, 2, // uni
  1, 5, 1.5, // bubble
];

const enemyNames = [
  "buttercorn",
  "toadicorn",
  "whalicorn",
  "eaglicorn",
  "unicorn",
  "bubble",
];

export const enum EnemyState {
  inactive,
  spawning,
  ranging,
  charging,
  holding,
  firing,
  exposed,
  recovering,
}

export interface Enemy {
  knd: EnemyKind;
  stat: number;
  health: number;

  /** timer meaning changes based on kind and state */
  timer: number;
  unitTimer: number;
  cycle: number;
  dlay: number;

  /** how many lasers the player has locked onto them */
  lcked: number;

  /** whether the player can lock onto the enemy */
  lckable: boolean;

  /** all enemy meshes are approx 1 unit in radius */
  rad: number;

  pos: Vec3;
  mov: Vec3;
  rot: Vec3;
}

export const enemies: Enemy[] = forMap(
  24,
  () =>
    ({
      stat: EnemyState.inactive,
      pos: v3(),
      mov: v3(),
      rot: v3(),
    }) as Enemy,
);

export const whaleSpouts = forMap(
  3,
  () =>
    ({
      pos: v3(0),
      age: 0,
    }) as { pos: Vec3; age: number; hght: number; rad: number },
);

const spout = (whale: Enemy) => {
  whale.dlay = 2;
  let spout = whaleSpouts.find((t) => !t.age);
  if (spout) {
    playSound(Sound.Boom);
    spout.age = 1;
    v3copy(spout.pos, whale.pos);
    spout.pos.y = 0;
    spout.hght = 0;
  }
};

export const spawnEnemy = (
  kind: EnemyKind,
  x: number,
  y: number = 0,
  z: number = -500,
) => {
  const enemy = enemies.find((e) => e.stat === EnemyState.inactive);
  if (enemy) {
    enemy.knd = kind;
    enemy.stat = EnemyState.spawning;
    enemy.health = enemyStats[kind * 3];
    enemy.timer = 0;
    enemy.unitTimer = 0;
    enemy.cycle = kind == EnemyKind.unicorn ? 1 : 0;
    enemy.dlay = 0;
    enemy.lcked = 0;
    enemy.lckable = true;
    enemy.rad = enemyStats[kind * 3 + 2];
    v3set(enemy.pos, x, y, z);
    const ang = randomBetween(0, PI2);
    v3set(enemy.mov, sin(ang), cos(ang), 0);
    v3set(enemy.rot, 0);
  }
};

export const clearEnemies = () => {
  enemies.map((e) => ((e.stat = EnemyState.inactive), (e.lckable = false)));
  whaleSpouts.map((w) => (w.age = 0));
};

const timerState = (
  enemy: Enemy,
  duration: number,
  from: EnemyState,
  to: EnemyState,
  then?: (enemy: Enemy) => void,
) => {
  if (enemy.stat == from) {
    if (enemy.timer >= duration) {
      enemy.timer = 0;
      enemy.stat = to;
      if (to == EnemyState.firing && enemy.knd > EnemyKind.whalicorn)
        playSound(Sound.Bwoom);
      then?.(enemy);
    }
    enemy.unitTimer = enemy.timer / duration;
  }
};

const enemyUpdate: SafeArray<EnemyKind, (e: Enemy) => void> = [
  (butter) => {
    // butter
    const bx = flightBounds.x - 2;
    const by = flightBounds.y - 2;

    timerState(butter, 2, EnemyState.ranging, EnemyState.firing);
    timerState(butter, 1, EnemyState.firing, EnemyState.ranging);

    v3addScaled(butter.pos, butter.pos, butter.mov, clock.dlta * 2);
    if (abs(butter.pos.x) > bx) {
      butter.pos.x = clamp(butter.pos.x, -bx, bx);
      butter.mov.x = -butter.mov.x;
    }
    if (butter.pos.y < 2 || butter.pos.y > by) {
      butter.pos.y = clamp(butter.pos.y, 2, by);
      butter.mov.y = -butter.mov.y;
    }

    butter.rot.x = sin(clock.tim * 1.7) * 0.2;
    butter.rot.y = PI;

    if (butter.stat == EnemyState.firing) {
      const x = butter.pos.x - flightPosition.x - viewer.x,
        y = butter.pos.y - flightPosition.y - viewer.y;
      if (x * x + y * y < (butterflyBeamRadius + 0.5) ** 2) hitPlayer();
    }
  },

  (toad) => {
    // toad
    // opt out of the spawn behavior, we're going to just crawl along anyway
    if (toad.stat == EnemyState.spawning) toad.stat = EnemyState.ranging;
    toad.pos.z += scroll;
    if (toad.pos.z > 10) {
      toad.stat = EnemyState.inactive;
    }
    if (toad.pos.z > -200) {
      toad.dlay -= clock.dlta;
      if (toad.dlay < 0) {
        spawnEnemy(EnemyKind.bubble, toad.pos.x, toad.pos.y, toad.pos.z);
        toad.dlay = 3;
      }
    }
  },

  (whale) => {
    // whale
    timerState(whale, 6, EnemyState.ranging, EnemyState.exposed, spout);
    timerState(whale, 2, EnemyState.exposed, EnemyState.ranging, spout);

    const t = whale.unitTimer;
    let anim = pow(t, 2);
    if (whale.stat == EnemyState.ranging) {
      anim *= PI2 * 3;
    }
    if (whale.stat == EnemyState.exposed) {
      anim *= PI2;
    }
    animateWhale(anim);
    whale.lckable = whale.stat == EnemyState.exposed;

    let swim = whale.cycle;
    whale.pos.x = sin(swim) * 20;
    whale.rot.y = -cos(swim + 0.4) * 0.7;
    if (whale.stat == EnemyState.spawning) {
      whale.pos.y = -5;
      whale.cycle += clock.dlta;
    } else {
      whale.pos.z = -50 + sin(swim) * 15;
    }

    let rot = 0;
    if (whale.stat == EnemyState.ranging) {
      whale.pos.y = -5;
      whale.cycle += clock.dlta;
      whale.dlay -= clock.dlta;
      if (whale.dlay < 0) {
        spout(whale);
      }
    }
    if (whale.stat == EnemyState.exposed) {
      let bounce = sin(t * PI);
      whale.pos.y = -5 + bounce * 20;
      rot = cos(t * PI);
      whale.cycle += clock.dlta * 1.5;
      whale.dlay = 0.5;
    }
    whale.rot.x = damp(whale.rot.x, rot, 3);
  },

  (eagle) => {
    // eagli
    // eagle cycle is effectively the angle around the player, as a phase
    // eagle patrols back and forth along an arc, pauses to charge, then fires

    timerState(eagle, 3, EnemyState.ranging, EnemyState.charging);
    timerState(eagle, 2, EnemyState.charging, EnemyState.firing);
    timerState(eagle, 3, EnemyState.firing, EnemyState.ranging);

    let tilt = 0;

    if (eagle.stat == EnemyState.ranging) {
      eagle.pos.y = damp(
        eagle.pos.y,
        max(3, flightPosition.y - eagleBeamHeightOffset),
        0.5,
      );
      eagle.cycle += clock.dlta;
      eagle.dlay += clock.dlta * 7;
    }
    if (eagle.stat == EnemyState.charging) {
      tilt = -1;
      eagle.dlay += clock.dlta * 12;
    }
    if (eagle.stat == EnemyState.firing) {
      tilt = -0.3;
      eagle.dlay += clock.dlta;
      if (
        abs(flightPosition.y - eagle.pos.y - eagleBeamHeightOffset) < 1 &&
        eagle.timer > 0.2
      ) {
        hitPlayer();
      }
    }

    if (eagle.stat != EnemyState.spawning) {
      let angle = sin(eagle.cycle);
      eagle.pos.x = damp(
        eagle.pos.x,
        flightPosition.x / 2 + sin(angle) * 30,
        5,
      );
      eagle.pos.z = damp(eagle.pos.z, abs(cos(angle)) * -40, 5);
      v3sub(eagle.mov, flightPosition, eagle.pos);
      v3set(eagle.mov, tilt, atan2(eagle.mov.x, eagle.mov.z), 0);
      v3damp(eagle.rot, eagle.mov, 3);
    } else {
      eagle.dlay += clock.dlta * 4;
      eagle.pos.y = flightBounds.y / 2;
      eagle.pos.x = 0;
    }
    animateHawk(eagle.dlay);
  },

  (uni) => {
    // opt out of the spawn behavior, just start them in cycle
    if (uni.stat == EnemyState.spawning) uni.stat = EnemyState.ranging;
    timerState(
      uni,
      8,
      EnemyState.ranging,
      EnemyState.charging,
      (enemy) => (enemy.rot.y = 0),
    );
    timerState(uni, 1, EnemyState.charging, EnemyState.holding);
    timerState(uni, 0.2, EnemyState.holding, EnemyState.firing);
    timerState(uni, 3, EnemyState.firing, EnemyState.recovering);
    timerState(
      uni,
      3,
      EnemyState.recovering,
      EnemyState.ranging,
      (enemy) => (enemy.cycle = -enemy.cycle),
    );
    const t = uni.unitTimer;

    // uni
    if (uni.stat == EnemyState.ranging) {
      let arc = sin(t * PI);
      let phase = t * PI * 7;
      v3set(
        uni.pos,
        uni.cycle *
          (unicornX - pow(t, 0.5) * unicornX * 2 + arc * unicornX * 2),
        5 + abs(sin(phase)) / 2 + arc * 20,
        lerp(10, unicornZ, t) - arc * 40,
      );
      v3set(uni.rot, 0, PI + uni.cycle * max(0, (t - 0.5) * PI2), 0);
      animateUnicorn(phase * 2);
    }
    if (uni.stat == EnemyState.charging) {
      v3set(uni.pos, unicornX * -uni.cycle, 5, unicornZ);
      v3sub(uni.mov, flightPosition, uni.pos);
      v3set(uni.mov, 0, atan2(uni.mov.x, uni.mov.z), 0);
      v3damp(uni.rot, uni.mov, 3);
      animateUnicorn(t * 3);
    }
    if (uni.stat == EnemyState.firing) {
      const s = sin(uni.rot.y),
        c = cos(uni.rot.y);
      v3set(uni.pos, 0, -9, 9);
      if (
        abs(
          (flightPosition.x + viewer.x + unicornX * uni.cycle) * c -
            (viewer.z - unicornZ) * s,
        ) < 1
      )
        hitPlayer();
    }
  },

  (bubble) => {
    // bubble
    const delta = clock.dlta;
    if (bubble.stat == EnemyState.spawning) bubble.stat = EnemyState.ranging;
    bubble.pos.z += scroll;
    bubble.pos.y += max(0, 1 - bubble.timer) * delta * 20;
    bubble.rot.x += delta * 3;
    bubble.rot.y += delta * 7;
    bubble.rot.z += delta * 5;
    bubble.rad = 1 + sin(delta * 4) * 0.2;
    if (bubble.pos.z > 0) {
      bubble.stat = EnemyState.inactive;
    } else {
      v3sub(bubble.mov, flightPosition, bubble.pos);
      let distance = v3Normalize(bubble.mov);
      if (distance < 2) {
        hitPlayer();
        bubble.stat = EnemyState.inactive;
        spawnSplash(bubble.pos);
      }
      v3addScaled(bubble.pos, bubble.pos, bubble.mov, delta * 20);
    }
  },
];

export const updateEnemies = () => {
  enemies.map((enemy) => {
    if (enemy.health && enemy.stat !== EnemyState.inactive) {
      if (enemy.stat == EnemyState.spawning) {
        enemy.pos.z += scroll * 1.5;
        if (enemy.pos.z > -40) {
          enemy.pos.z = -40;
          enemy.stat = EnemyState.ranging;
          enemy.timer = 0;
        }
      }

      enemy.timer += clock.dlta;
      enemy.lckable = enemy.pos.z > -300;
      enemyUpdate[enemy.knd](enemy);
    }
  });
  whaleSpouts.map((s) => {
    s.age = max(0, s.age - clock.dlta * 0.5);
    if (s.age) {
      let w = sin(pow(s.age, 2) * PI);
      s.rad = 7 - w * 5;
      s.hght = damp(s.hght, 30, 6);
      s.pos.z += scroll;
      const x = s.pos.x - flightPosition.x - viewer.x,
        z = s.pos.z - viewer.z;
      if (x * x + z * z < s.rad * s.rad) {
        s.age = 0;
        hitPlayer();
      }
    }
  });
};

export const enemyPoint = (enemy: Enemy, out: Vec3) =>
  flightWorldPoint(out, enemy.pos.x, enemy.pos.y, enemy.pos.z);

export const damageEnemy = (enemy: Enemy) => {
  if (enemy.health && (--enemy.lcked, !--enemy.health)) {
    const score = enemyStats[enemy.knd * 3 + 1] * scoreMultiplier;
    enemy.stat = EnemyState.inactive;
    enemy.lckable = false;
    addPlayerScore(
      score,
      `~${enemyNames[enemy.knd]}~ +${score}`,
      ScoreMessagePriority.EnemyHit,
    );
  }
};

export function areAnyEnemiesAlive() {
  return enemies.find((e) => e.stat != EnemyState.inactive) !== undefined;
}
