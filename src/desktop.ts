import { isXRRunning } from "./xr";
import { updateClock } from "./clock";
import { gl, cvs } from "./canvas";
import { GL } from "./gl";
import { drawView } from "./draw";
import { f32, v3set } from "./math";
import { clearVrFlightControl, setDesktopFlight, touchInput } from "./player";
import { fireDesktopWeapon, setDesktopWeapon } from "./weapon";
import { setButtonAnchor } from "./hands";
import { viewer } from "./shader";
import { pressStart, updateLevel } from "./levels";

let left = 0,
  right = 0,
  up = 0,
  down = 0,
  held = 0,
  wid = 9,
  hei = 9;
const focal = 2;
const desktopPlayerHeight = 1.2;

// prettier-ignore
const view = f32([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-desktopPlayerHeight,0,1]);

// prettier-ignore
const projection = f32([
  focal,0,0,0, 0,focal,0,0, 0,0,-700.1/699.9,-1, 0,0,-140/699.9,0,
]);

const resize = () => {
  cvs.width = wid = innerWidth;
  cvs.height = hei = innerHeight;
  projection[0] = (focal * hei) / wid;
  gl.viewport(0, 0, wid, hei);
};

const draw = (time: number) => {
  if (!isXRRunning()) {
    updateClock(time);
    updateLevel();
    gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    drawView(projection, view);
    requestAnimationFrame(draw);
  }
};

export const startDesktopRenderer = () => {
  clearVrFlightControl();
  viewer.y = desktopPlayerHeight;
  setButtonAnchor(viewer.y, desktopPlayerHeight - 1);
  onresize = resize;
  resize();
  onkeydown = onkeyup = (event) => {
    const pressed = +(event.type == "keydown"),
      key = event.key;
    if (key == "a") left = pressed;
    if (key == "d") right = pressed;
    if (key == "w") up = pressed;
    if (key == "s") down = pressed;
    setDesktopFlight(right - left, up - down);
  };
  const aim = (event: PointerEvent, active: number) => {
    const x = ((event.clientX / wid) * 2 - 1) / projection[0];
    const y = (1 - (event.clientY / hei) * 2) / projection[5];
    const touch = event.pointerType == "touch" ? 2 : 0;
    v3set(touchInput, x * touch, y * touch, x / 2);
    if (held || active) {
      if (active && pressStart(x, y, -1)) {
        held = 0;
      } else {
        setDesktopWeapon(!!active, x, y);
        if (!active) {
          touch && v3set(touchInput, 0);
          fireDesktopWeapon();
        }
      }
    }
    held = active;
    return false;
  };
  onpointerdown = (event) => aim(event, 1);
  onpointermove = (event) => aim(event, held);
  onpointerup = (event) => aim(event, 0);
  requestAnimationFrame(draw);
};
