import { abs, forMap, min } from "./math";
import { scroll } from "./world";
import {
  addBonus,
  flightBounds,
  flightPosition,
  hitPlayer,
  ScoreMessagePriority,
} from "./player";
import { viewer } from "./shader";

export interface Asteroid {
  x: number;
  y: number;
  z: number;
  heit: number;
  rad: number;
  seed: number;
  row: number;
  hit: boolean;
}

export const asteroids = forMap(
  48,
  (i): Asteroid =>
    ({
      z: 101,
      seed: i * 19.37 + 3.1,
    }) as Asteroid,
);
let closeChain = -1,
  closeRow = -2;
const closeNames = ["daredevil", "insane", "thread the needle", "untouchable"];

export const spawnAsteroid = (x: number, kind: string, row: number) => {
  const asteroid = asteroids.find((a) => a.z > 100),
    tall = flightBounds.y;
  if (!asteroid) return;
  asteroid.x = x;
  asteroid.z = -500;
  const wide = kind == "T" || kind == "t" || kind == "u",
    sphere = kind == "A" || kind == "a";
  asteroid.rad = wide ? 22 : 6;
  asteroid.heit =
    kind == "I"
      ? tall * 2
      : kind == "i"
        ? tall / 2
        : wide
          ? tall * 0.25
          : asteroid.rad;
  asteroid.y = sphere
    ? tall * (kind == "A" ? 1 / 3 : 2 / 3) + 4
    : kind == "T"
      ? tall
      : kind == "t"
        ? tall * 0.5
        : 0;
  asteroid.seed += 7.1;
  asteroid.row = row;
  asteroid.hit = false;
};

export const updateAsteroids = () => {
  asteroids.map((asteroid) => {
    if (asteroid.z > 100) return;
    asteroid.z += scroll;
    if (asteroid.z > 0) asteroid.y -= (scroll * (asteroid.heit + 2)) / 100;
  });
};

export const clearAsteroids = () => {
  asteroids.map((a) => (a.z = 101));
  closeChain = -1;
  closeRow = -2;
};

export const checkAsteroidHits = () => {
  asteroids.map((asteroid) => {
    if (asteroid.z > 100 || asteroid.hit) return;
    const dx = asteroid.x - flightPosition.x - viewer.x,
      dy = asteroid.y - flightPosition.y - viewer.y,
      x = dx / (asteroid.rad + 0.5),
      y = dy / (asteroid.heit / 2 + 0.5);
    const z = (asteroid.z - viewer.z) / (asteroid.rad + 0.5);
    const distance = x * x + y * y + z * z;
    if (distance < 1) {
      asteroid.z = 101;
      closeChain = -1;
      closeRow = asteroid.row;
      hitPlayer();
    } else if (asteroid.z > viewer.z) {
      asteroid.hit = true;
      if (
        (distance < 2 ||
          (asteroid.rad > 10 &&
            abs(dx) < asteroid.rad * 1.2 &&
            abs(dy) < asteroid.heit + 2)) &&
        asteroid.row !== closeRow
      ) {
        closeChain = asteroid.row === closeRow + 1 ? min(3, closeChain + 1) : 0;
        closeRow = asteroid.row;
        const score = (closeChain + 1) * 50;
        addBonus(
          score,
          `${closeNames[closeChain]}! +${score}`,
          ScoreMessagePriority.StuntBonus,
        );
      }
    }
  });
};
