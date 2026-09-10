import {
  checkAsteroidHits,
  clearAsteroids,
  spawnAsteroid,
  updateAsteroids,
} from "./asteroids";
import { setSong, setTempo } from "./audio";
import { Song } from "./audio-protocol";
import { clock } from "./clock";
import {
  areAnyEnemiesAlive,
  clearEnemies,
  EnemyKind,
  spawnEnemy,
  updateEnemies,
} from "./enemies";
import { buttonAnchor, handBlobs, handRadius, hands } from "./hands";
import {
  floor,
  max,
  min,
  PI,
  sin,
  v3,
  v3damp,
  shuffle,
  type Vec3,
  clamp,
  forIndex,
} from "./math";
import {
  addBonus,
  flightBounds,
  flightPosition,
  gameOver,
  giveInvulnerable,
  healPlayer,
  resetPlayer,
  ScoreMessagePriority,
  updatePlayer,
} from "./player";
import { setUniformColorOKLCH, shaderFog, viewer } from "./shader";
import { scroll, setScrollSpeed, updateWorld, worldSpeed } from "./world";
import { resetWeapon, updateWeapon } from "./weapon";
import { animate } from "./animate";
import { updateSplashes } from "./splash";

export const enum EnvColor {
  Sky,
  Fog,
  Terrain,
  Wire,
  Asteroid,
}

/** Sky, fog, terrain, and terrain-wire OKLCH colors. */
type ColorSet = SafeArray<EnvColor, Vec3>;
export const EnvColorCount = 5;

// prettier-ignore
const plainColors: ColorSet[] = [
  // swamp
  [v3(5, 9, 19), v3(9, 4, 22), v3(5, 6, 13), v3(3, 6, 13), v3(5, 8, 9)],
  // peach
  [v3(6, 6, 24), v3(8, 5, 26), v3(5, 3, 1), v3(4, 3, 1), v3(7, 4, 17)],
  // night?
  [v3(2, 2, 22), v3(3, 1, 22), v3(7, 4, 11), v3(7, 4, 11), v3(4, 3, 11)],
]

const bossColors: ColorSet[] = [
  // ocean - whale
  [v3(7, 7, 21), v3(11, 5, 15), v3(6, 7, 16), v3(10, 5, 14), v3(8, 6, 19)],
  // desert - hawk
  [v3(7, 7, 19), v3(10, 3, 13), v3(6, 3, 7), v3(4, 3, 7), v3(4, 2, 5)],
  // neon - unicorn
  [v3(2, 6, 22), v3(7, 7, 5), v3(2, 9, 29), v3(5, 9, 30), v3(4, 8, 27)],
];
export const skySet: ColorSet = [v3(), v3(), v3(), v3(), v3()];

const laneCount = 5;
let asteroidClear = ".+...";
let asteroidEasy = ["I.+.I", ".i+i.", "i+.+i"];
for (const c of "iIaA")
  for (let i = 0; i < 3; i++)
    asteroidEasy.push(("+.+." + c + ".+.+").slice(i, i + laneCount));
let asteroidMedium = ["+ITI+", "+iti+", "iti.+", "ITI.+", "+.u.+", ".u.+."];
let asteroidHard = [
  "ITITI",
  "+u+II",
  "III..",
  ".uIt+",
  "ITIti",
  "III+a",
  "++a++",
  "+I+I+",
];

let asteroids: string[] = [];
let enemies: EnemyKind[] = [];

const bossCycle = 5;

const enemyWaveGenerator = (level: number): EnemyKind[] => {
  let result: EnemyKind[] = [];
  if (level % bossCycle == bossCycle - 1) {
    // boss
    let difficulty = floor(level / (bossCycle * 3));
    for (let i = 0; i < min(8, difficulty * 2); ++i) {
      result.push(EnemyKind.buttercorn);
    }
    for (let i = 1; i < min(8, difficulty); ++i) {
      result.push(EnemyKind.toadicorn);
    }
    shuffle(result);

    let boss = ((level / bossCycle) | 0) % 3;
    result.unshift(EnemyKind.whalicorn + boss);
    colorTarget = bossColors[boss];
  } else {
    // regular
    for (let i = 0; i < min(16, 1 + level); ++i) {
      result.push(EnemyKind.buttercorn);
    }
    for (let i = 1; i < min(16, level / 3); ++i) {
      result.push(EnemyKind.toadicorn);
    }
    colorTarget = plainColors[level % 3];
    shuffle(result);
  }
  return result;
};

export let level = -1;
export let rush = 0;
export let rushDuration = 3;

let rowSpacing = 1;
let distance = 0,
  lastStep = -1,
  colorTarget = plainColors[0],
  speed = 1,
  altitudeTime = 0,
  altitudeChain = 0,
  altitudeZone = 0,
  defeatTime = -1;

export const startButton = {
  x: 0,
  y: -0.3,
  z: -0.8,
  scl: 0,
  lum: 6,
  sat: 6,
  hue: 0,
  actv: 1,
  labl: "START",
  pulse: 1,
  stat: 0,
  squareness: 0.3,
};

export const revealStartButton = () => (startButton.scl = 2);

const pushAsteroids = (some: string[]) => (asteroids = asteroids.concat(some));

export const beginLevel = (next: number) => {
  level = next;
  if (level % bossCycle == 0) healPlayer();
  const bpm = min(160, 100 + next);
  speed = bpm / 100;
  rowSpacing = max(1.5, 3 - next * 0.05);
  setScrollSpeed(speed);
  setSong(Song.Combat);
  setTempo(bpm);
  distance = altitudeTime = altitudeChain = altitudeZone = 0;
  rush = rushDuration = max(1, 3 - level / 5);
  giveInvulnerable(rush);
  defeatTime = -1;
  lastStep = -1;
  startButton.actv = 0;
  clearEnemies();
  shuffle(asteroidMedium);
  asteroids = [];
  pushAsteroids(Array(max(2, floor(6 - level / 3))).fill(asteroidClear));
  pushAsteroids(asteroidEasy.slice(0, max(2, 10 - level / 3)));
  pushAsteroids(asteroidMedium.slice(0, clamp(level / 3 - 3, 0, 9)));
  pushAsteroids(asteroidHard.slice(0, clamp(level / 3 - 9, 0, 9)));
  shuffle(asteroids);
  enemies = enemyWaveGenerator(next);
};

const startGame = () => {
  resetPlayer();
  resetWeapon();
  clearAsteroids();
  beginLevel(0);
};

export const completeLevel = () => beginLevel(level + 1);

export const pressStart = (x: number, y: number, z: number) => {
  if (startButton.actv && startButton.scl > 0) {
    const bx = startButton.x - viewer.x;
    const by = startButton.y + buttonAnchor - viewer.y;
    const bz = startButton.z - viewer.z;
    const length = x * x + y * y + z * z;
    const t = (bx * x + by * y + bz * z) / length;
    const r = 0.05 * startButton.scl;
    if (t > 0 && bx * bx + by * by + bz * bz - t * t * length < r * r) {
      startGame();
      return true;
    }
  }
  return false;
};

export const updateStartButton = () => {
  const b = startButton;
  let state = 0;
  if (b.actv) {
    for (let i = 0; i < hands.length; i += 3) {
      if (handBlobs[(i / 18) | 0] || i % 18 != 15) {
        const x = hands[i] - b.x,
          y = hands[i + 1] - b.y - buttonAnchor,
          z = hands[i + 2] - b.z,
          r = 0.05 * b.scl + handRadius;
        if (x * x + y * y + z * z < r * r) state = 1;
      }
    }
    if (state && !b.stat) startGame();
    b.stat = state;
  }
};

export const updateLevel = () => {
  for (let i = 0; i < EnvColorCount; i++)
    v3damp(skySet[i as EnvColor], colorTarget[i as EnvColor], 1);
  setUniformColorOKLCH(shaderFog, skySet[1].x, skySet[1].y, skySet[1].z);
  animate();

  if (gameOver) {
    if (defeatTime < 0) {
      defeatTime = 0;
      setScrollSpeed(0);
      setSong(Song.Defeat);
    } else if ((defeatTime += clock.dlta) > 3) {
      startButton.labl = "RETRY";
      startButton.actv = min(1, startButton.actv + clock.dlta * 5);
    }
    return;
  }

  rush = max(0, rush - clock.dlta);
  setScrollSpeed(speed * (1 + 3 * sin((rush / rushDuration) * PI)));

  updatePlayer();
  updateWorld();
  updateEnemies();
  updateWeapon();
  updateAsteroids();
  updateSplashes();
  checkAsteroidHits();
  if (level >= 0) {
    const zone =
      flightPosition.y < 2 ? -1 : flightPosition.y > flightBounds.y - 2 ? 1 : 0;
    if (zone && !gameOver) {
      if (zone !== altitudeZone) altitudeTime = altitudeChain = 0;
      if ((altitudeTime += clock.dlta) > 5) {
        altitudeTime = 0;
        altitudeChain = min(3, altitudeChain + 1);
        const score = altitudeChain * 50;
        addBonus(
          score,
          `${zone < 0 ? "pond skimmer" : "ridin high"}! +${score}`,
          ScoreMessagePriority.StuntBonus,
        );
      }
    } else altitudeTime = altitudeChain = 0;
    altitudeZone = zone;
    distance += scroll;
    const step = (distance / (worldSpeed * rowSpacing)) | 0;
    if (step !== lastStep) {
      lastStep = step;
      const asters = asteroids[step % asteroids.length];
      for (let lane = 0; lane < laneCount; lane++) {
        const note = asters[step & 1 ? 4 - lane : lane];
        const x = (lane - 2) * 12;
        if (note > "@") spawnAsteroid(x, note, step);
        else if (note == "+") {
          let kind = enemies.shift();
          if (kind != undefined) {
            spawnEnemy(kind, x);
          }
        }
      }
      // detect level end when no more to spawn and no more alive
      if (enemies.length == 0 && !areAnyEnemiesAlive()) {
        completeLevel();
      }
    }
  }
};
