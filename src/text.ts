import { gl } from "./canvas";
import { GL } from "./gl";
import { floor, forMap } from "./math";

const labelCanvas = document.createElement("canvas");
labelCanvas.width = 2048;
labelCanvas.height = 2048;
const context = labelCanvas.getContext("2d")!;
context.font = "bold 88px monospace";
context.textAlign = "center";
context.textBaseline = "middle";
forMap(256, (i) => {
  let c = String.fromCharCode(i);
  let y = floor(i / 16);
  let x = i - y * 16;
  x = x * 128 + 64;
  y = y * 128 + 64;
  context.fillStyle = "#333";
  context.fillText(c, x + 2, y + 2);
  context.fillStyle = "#fff";
  context.fillText(c, x - 4, y - 4);
});
gl.bindTexture(GL.TEXTURE_2D, gl.createTexture());
gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MAG_FILTER, GL.NEAREST);
gl.texParameteri(GL.TEXTURE_2D, GL.TEXTURE_MIN_FILTER, GL.NEAREST);

gl.texImage2D(GL.TEXTURE_2D, 0, GL.R8, GL.RED, GL.UNSIGNED_BYTE, labelCanvas);
