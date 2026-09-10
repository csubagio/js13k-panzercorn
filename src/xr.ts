import { updateClock } from "./clock";
import { drawView } from "./draw";
import {
  clearXRInputs,
  hands,
  handSides,
  handBlobs,
  setButtonAnchor,
} from "./hands";
import { abs, v3copy, v3set } from "./math";
import { viewer } from "./shader";
import { GL } from "./gl";
import {
  clearControllerFlight,
  clearVrFlightControl,
  setControllerFlight,
  touchInput,
  updateVrFlightControl,
} from "./player";
import {
  clearDesktopWeapon,
  clearXrAimEyes,
  setControllerWeapon,
  setXrAimEyes,
} from "./weapon";
import { updateLevel, updateStartButton } from "./levels";

let fingers = ["thumb"].concat(
  ["index", "middle", "ring", "pinky"].map((s) => s + "-finger"),
);
const tips = fingers.map((f) => f + "-tip") as XRHandJoint[];
const palms = fingers.map((f) => f + "-metacarpal") as XRHandJoint[];

let session: XRSession | undefined;

export const isXRRunning = () => {
  return !!session;
};

export const enterXR = async (gl: WebGL2RenderingContext) => {
  const xrSession = await navigator.xr!.requestSession("immersive-vr", {
    requiredFeatures: ["local-floor"],
    optionalFeatures: ["hand-tracking"],
  });
  clearDesktopWeapon();
  clearXrAimEyes();
  session = xrSession;
  await gl.makeXRCompatible();
  const layer = new XRWebGLLayer(xrSession, gl);
  xrSession.updateRenderState({
    baseLayer: layer,
    depthNear: 0.1,
    depthFar: 700,
  });
  const space = await xrSession.requestReferenceSpace("local-floor");

  if (__DESKTOP__)
    xrSession.onend = () => {
      session = undefined;
      clearVrFlightControl();
      clearXrAimEyes();
    };

  const drawXR = (time: number, frame: XRFrame) => {
    updateClock(time);
    v3set(touchInput, 0);
    xrSession.requestAnimationFrame(drawXR);
    const pose = frame.getViewerPose(space)!;
    const viewPos = pose.transform.position;
    v3copy(viewer, viewPos);
    setButtonAnchor(viewPos.y, 0.01);
    setXrAimEyes(
      pose.views[0].transform.position,
      pose.views[1]?.transform.position,
    );
    clearXRInputs();
    setControllerWeapon(false);
    clearControllerFlight();
    for (const input of xrSession.inputSources) {
      const side = input.handedness == "right" ? 1 : 0;
      if (input.hand) {
        const start = hands.length;
        handSides.push(side);
        handBlobs.push(0);
        const palm = [0, 0, 0];
        for (let i = 0; i < 5; i++) {
          const tip = frame.getJointPose!(input.hand.get(tips[i])!, space)!
            .transform.position;
          hands.push(tip.x, tip.y, tip.z);
          const p = frame.getJointPose!(input.hand.get(palms[i])!, space)!
            .transform.position;
          palm[0] += p.x;
          palm[1] += p.y;
          palm[2] += p.z;
        }
        hands.push(palm[0] / 5, palm[1] / 5, palm[2] / 5);
      } else if (input.gamepad && (input.gripSpace || input.targetRaySpace)) {
        const p = frame.getPose!(
          input.gripSpace || input.targetRaySpace!,
          space,
        )!.transform.position;
        handSides.push(side);
        handBlobs.push(1);
        for (let i = 0; i < 5; i++) {
          const d = i - 2;
          hands.push(
            p.x + d * 0.02,
            p.y + 0.04 - d * d * 0.007,
            p.z - 0.03 + d * d * 0.004,
          );
        }
        hands.push(p.x, p.y, p.z);
        if (side) setControllerWeapon(!!input.gamepad.buttons[0]?.pressed);
        else {
          const axes = input.gamepad.axes;
          let x = 0,
            y = 0;
          for (let i = 0; i < axes.length; i += 2)
            if (abs(axes[i]) + abs(axes[i + 1]) > abs(x) + abs(y))
              ((x = axes[i]), (y = axes[i + 1]));
          setControllerFlight(x, -y);
        }
      }
    }
    updateVrFlightControl(viewPos);
    updateStartButton();
    updateLevel();
    gl.bindFramebuffer(GL.FRAMEBUFFER, layer.framebuffer);
    gl.depthMask(true);
    gl.clear(GL.COLOR_BUFFER_BIT | GL.DEPTH_BUFFER_BIT);
    for (const view of pose.views) {
      const viewport = layer.getViewport(view)!;
      gl.viewport(viewport.x, viewport.y, viewport.width, viewport.height);
      drawView(view.projectionMatrix, view.transform.inverse.matrix);
    }
  };
  xrSession.requestAnimationFrame(drawXR);
};
