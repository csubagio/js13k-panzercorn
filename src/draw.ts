import {
  butterflyAnim,
  hawkAnim,
  toadAnim,
  unicornAnim,
  whaleAnim,
} from "./animate";
import { asteroids } from "./asteroids";
import {
  butterflyBeamRadius,
  eagleBeamHeightOffset,
  enemies,
  EnemyKind,
  EnemyState,
  unicornX,
  unicornZ,
  whaleSpouts,
} from "./enemies";
import { gl } from "./canvas";
import { GL } from "./gl";
import { clock } from "./clock";
import { buttonAnchor, hands, handBlobs, handRadius, handSides } from "./hands";
import { abs, cos, max, min, PI, pow, sin, v3, v3copy, v3lerp } from "./math";
import { toad, butterfly, unicorn, hawk, whale } from "./meshes";
import {
  projection,
  view,
  viewer,
  MeshKind,
  setColorOKLCH,
  setColorVec,
  setModelTRS,
  shape,
  lookAt,
  renderCompound,
  trailUniform,
  label,
  worldScrollUniform,
  setFlightTransform,
  drawGrid,
  drawPoints,
  setPointScale,
  setKind,
  setModelTS,
} from "./shader";
import "./text";
import { EnvColor, level, rush, skySet, startButton } from "./levels";
import { sighting, lasers, weaponLocks } from "./weapon";
import {
  flightOrb,
  flightPitch,
  flightPosition,
  flightRoll,
  flightYaw,
  gameOver,
  health,
  hurt,
  playerScore,
  scoreMessages,
  scoreMultiplier,
  showFlightOrb,
} from "./player";
import { worldDistance } from "./world";
import { particleCount, particleDataLength, splashes } from "./splash";

const animalMeshes = [butterfly, toad, whale, hawk, unicorn];
const animalAnims = [butterflyAnim, toadAnim, whaleAnim, hawkAnim, unicornAnim];

const tempColor = v3();

const setWorldFlight = (enabled: boolean) =>
  setFlightTransform(
    enabled,
    flightPosition.x,
    flightPosition.y,
    flightPitch,
    flightYaw,
    flightRoll,
  );

const depthMask = (e: boolean) => gl.depthMask(e);

export const drawView = (
  projectionMatrix: Float32Array,
  viewMatrix: Float32Array,
) => {
  gl.uniformMatrix4fv(projection, false, projectionMatrix);
  gl.uniform1f(worldScrollUniform, worldDistance);
  gl.uniformMatrix4fv(view, false, viewMatrix);

  // sky
  setWorldFlight(true);
  setKind(MeshKind.Sky);
  setColorVec(skySet[0]);
  depthMask(false);
  drawGrid(1.5, 1);
  depthMask(true);

  // terrain reflection
  gl.enable(GL.CULL_FACE);
  gl.frontFace(GL.CW);

  setKind(MeshKind.Floor);
  setColorVec(skySet[2]);
  setModelTS(0, 0, 0, 1, -1, 1);
  drawGrid(100);

  gl.disable(GL.CULL_FACE);

  // asteroids, with built in reflections
  setKind(MeshKind.Asteroid);
  setColorVec(skySet[EnvColor.Asteroid]);
  asteroids.map((asteroid) => {
    if (asteroid.z < 99) {
      shape(0, 0, 0, asteroid.seed);
      setModelTS(
        asteroid.x,
        asteroid.y,
        asteroid.z,
        asteroid.rad,
        asteroid.heit,
        asteroid.rad,
      );
      drawGrid(24);
    }
  });

  setKind(MeshKind.Splash);
  setPointScale();
  setColorOKLCH(6, 0, 0);
  splashes.map((s) => {
    if (s.age < 1.5) {
      setModelTRS(s.orgn.x, s.orgn.y, s.orgn.z);
      let t = s.age / 1.5;
      shape(
        1 - pow(1 - t, 2),
        (1 - t) * 2,
        0.7 + max(0, 4 - t * 16), // brightness
        pow(t, 2) * -11,
      );
      gl.uniform4fv(trailUniform, s.pnts);
      drawPoints(particleCount);
    }
  });

  setWorldFlight(false);
  setKind(MeshKind.Carpet);
  setModelTS(0, 0, 0, 4, 1, 8);
  setColorOKLCH(5, 5, 1);
  drawGrid(100);

  // Five paired capsulites form a tiny heart meter on the carpet ahead.
  setKind(MeshKind.Capsulite);
  for (let heart = 0; heart < (level < 0 ? 0 : 5); heart++) {
    const full = heart < health;
    let x = (heart / 4 - 0.5) * 1.1;
    let y = 0.3;
    let z = -2;
    const tilt = 1.1;
    setColorOKLCH(full ? 4 : 1, full ? 7 : 1, 2);
    shape(0.07, 0.01, 0.05, 1);
    setModelTRS(x - 0.02, y, z, tilt, PI / 2, 0);
    drawGrid(20);
    setModelTRS(x + 0.02, y, z, PI - tilt, PI / 2, 0);
    drawGrid(20);
  }

  // hands
  for (let i = 0; i < hands.length; i += 3) {
    if (!handBlobs[(i / 18) | 0] || i % 18 == 15 || handSides[(i / 18) | 0]) {
      const palm = i % 18 == 15;
      const rad = handRadius;
      shape(rad, rad, 0, 1);
      setModelTRS(hands[i], hands[i + 1], hands[i + 2]);
      const finger = (i % 18) / 3;
      const isRightFinger = handSides[(i / 18) | 0] && finger < 5;
      if (palm && handSides[(i / 18) | 0])
        setColorOKLCH(sighting ? 6 : 5, 8, sighting ? 2 : 15);
      else if (isRightFinger)
        setColorOKLCH(weaponLocks[finger].enemy ? 9 : 2, 0, 0);
      else setColorOKLCH(8, 9, 3);
      drawGrid(12);
    }
  }

  if (showFlightOrb) {
    shape(0.07, 0.07, 0, 1);
    setModelTRS(flightOrb.x, flightOrb.y, flightOrb.z);
    setColorOKLCH(5, 7, 1);
    drawGrid(20);
  }
  setWorldFlight(true);
  setKind(MeshKind.Trail);
  setModelTS();
  setColorOKLCH(7, 0, 0);
  lasers.map((laser) => {
    if (laser.tim <= 1.5) {
      gl.uniform4fv(trailUniform, laser.pnts, 0, laser.pointsLength * 4);
      drawGrid(laser.pointsLength - 1, 1);
    }
  });
  // the tower
  setKind(MeshKind.Capsulite);
  shape(15, 20, 100, 0.25);
  setColorOKLCH(9, 0, 0);
  setModelTRS(0, 0, -460, PI / 2, 0, 0);
  drawGrid();
  setModelTRS(0, 124, -460, PI / 2, 0, 0, 0.7);
  drawGrid();
  shape(10, 10, 1, 1);
  setModelTRS(0, 224, -460);
  drawGrid();

  enemies.map((enemy, i) => {
    if (enemy.stat != EnemyState.inactive) {
      setModelTRS(
        enemy.pos.x,
        enemy.pos.y,
        enemy.pos.z,
        enemy.rot.x,
        enemy.rot.y,
        enemy.rot.z,
        enemy.rad,
      );
      if (enemy.knd < EnemyKind.bubble) {
        renderCompound(animalMeshes[enemy.knd], animalAnims[enemy.knd], 20);
      } else if (enemy.knd === EnemyKind.bubble) {
        setKind(MeshKind.Capsulite);
        shape(1, 1, 0.2, 1);
        setColorOKLCH(9 + sin(clock.tim * 30) * 2, 8, 12);
        drawGrid();
      }

      if (!gameOver && enemy.stat == EnemyState.firing) {
        const t = enemy.unitTimer;
        const it = 1 - enemy.unitTimer;
        const pulse = sin(pow(t, 0.5) * 80);
        if (enemy.knd == EnemyKind.buttercorn) {
          const r = butterflyBeamRadius * it;
          shape(r, r, 500, 1);
          setColorOKLCH(9 + pulse * 3 - t, 8, 29 + pulse * 3);
          setModelTRS(enemy.pos.x, enemy.pos.y, enemy.pos.z + 500);
          drawGrid(20);
        }

        if (enemy.knd == EnemyKind.eaglicorn) {
          let l = 20 * (1 + t * 30);
          shape(0.1, 30 * it, l, 1);
          setColorOKLCH(7 + pulse * 3, 8, 5);
          setModelTRS(
            enemy.pos.x + l * sin(enemy.rot.y),
            enemy.pos.y + eagleBeamHeightOffset,
            enemy.pos.z + l * cos(enemy.rot.y),
            0,
            enemy.rot.y,
            0,
            1,
            0.01,
            1,
          );
          drawGrid(20);
        }

        if (enemy.knd == EnemyKind.unicorn) {
          setKind(MeshKind.Color);
          setColorOKLCH(8 + pulse, 8, 0);
          setModelTRS(
            unicornX * -enemy.cycle,
            -20,
            unicornZ,
            0,
            enemy.rot.y,
            0,
            1,
            40,
            80,
          );
          drawGrid(2, 1);
        }
      }
    }
  });

  setKind(MeshKind.Asteroid);
  whaleSpouts.map((s) => {
    if (s.age > 0) {
      v3copy(tempColor, skySet[EnvColor.Terrain]);
      v3lerp(tempColor, v3(11, 0, 16), s.age);
      setColorVec(tempColor);
      setModelTS(s.pos.x, s.pos.y, s.pos.z, s.rad, s.hght, s.rad);
      shape(0, 0, 0, s.pos.x + s.age * 80);
      drawGrid(24);
    }
  });

  // terrain above water, transparent floor
  setKind(MeshKind.Floor);
  setModelTS();
  setColorVec(skySet[2]);
  drawGrid(100);

  // terrain wireframe, for texture
  setColorVec(skySet[3]);
  drawGrid(100, 99, GL.LINE_STRIP);
  setWorldFlight(false);

  {
    depthMask(false);

    const b = startButton;
    if (b.actv) {
      const pulse = abs(sin(clock.tim * PI)) * b.pulse;
      setKind(MeshKind.Capsulite);
      shape(0.05, 0.02, 0, b.squareness);
      const scale = b.actv * b.scl * (1 + 0.1 * pulse);
      setModelTS(b.x, buttonAnchor + b.y, b.z, scale, scale, 0.01);
      lookAt();
      setColorOKLCH(b.lum + pulse * 0.1, b.sat, b.hue);
      drawGrid();

      setKind(MeshKind.Label);
      setModelTS(b.x, buttonAnchor + b.y, b.z + 0.01, 0.025 * b.scl);
      lookAt();
      setColorOKLCH(b.lum + 2, b.sat - 3, b.hue);
      label(b.labl);

      setColorOKLCH(6, 9, 29);
      setModelTS(0, 1.5 + sin(clock.tim) * 0.05, -2, 0.3);
      label("PÄNZERCÖRN");
      setModelTS(0, 1.3 + sin(clock.tim - 1) * 0.05, -2, 0.1);
      label("(instructions on game page)");
    }

    if (rush > 0.5) {
      setKind(MeshKind.Label);
      setModelTS(0, 1.5 + sin(clock.tim) * 0.05, -2, 0.3);
      setColorOKLCH(6, 9, 29);
      label(`LEVEL ${level}`);
    }
  }

  setKind(MeshKind.Label);
  if (playerScore > 0) {
    depthMask(false);
    setColorOKLCH(6, 8, 5);
    setModelTS(0, 0.5, -2, 0.1);
    label(
      `lv:${level} score:${(1e9 + playerScore + "").slice(1)} x${(1e2 + scoreMultiplier + "").slice(1)}`,
    );

    let scoreHeight = 0.54;
    scoreMessages.map((m) => {
      if (m.msg) {
        setColorOKLCH(6 - m.timer * 2, 7, m.priority * 7);
        scoreHeight += 0.03 + (1 - pow(1 - m.timer, 2)) * 0.05;
        setModelTS(0, scoreHeight, -2, 0.1);
        label(m.msg);
      }
    });
  }

  setWorldFlight(true);
  setColorOKLCH(7 + 4 * sin(clock.tim * 28), 6, 2);
  gl.disable(GL.DEPTH_TEST);
  weaponLocks.map((l) => {
    if (l.enemy) {
      let p = l.enemy.pos;
      let t = min(1, l.age);
      setModelTS(p.x, p.y, p.z, 4 * (3 - 2 * t));
      lookAt(((1 - t) * PI) / 2);
      label("{ }");
    }
  });

  if (hurt && !gameOver) {
    setWorldFlight(false);
    setKind(MeshKind.Hurt);
    shape(viewer.x, viewer.y, viewer.z, 0);
    setColorOKLCH((pow(hurt, 2) + max(0, hurt - 0.8)) * 9, 0, 0);
    drawGrid(1.5, 1);
  }

  gl.enable(GL.DEPTH_TEST);
};
