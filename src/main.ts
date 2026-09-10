import { startDesktopRenderer } from "./desktop";
import { initializeAudio, setSong } from "./audio";
import { Song } from "./audio-protocol";
import { enterXR } from "./xr";
import { cvs, gl } from "./canvas";
import { drawView } from "./draw";
import { f32, setDelta } from "./math";
import { level, revealStartButton, updateLevel } from "./levels";

(window as any).Wavedash?.init();

if (__DESKTOP__) startDesktopRenderer();
else {
  setDelta(2);
  updateLevel();
  drawView(
    f32([2, 0, 0, 0, 0, 4, 0, 0, 0, 0, -1, -1, 0, 0, -0.2, 0]),
    f32([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, -1, -3, 1]),
  );
}

let once = true;
cvs.onclick = () => {
  if (once) {
    once = false;
    revealStartButton();
    initializeAudio();
    if (level < 0) setSong(Song.Menu);
    if (__VR__ && navigator.xr) enterXR(gl).catch(() => {});
  }
};
