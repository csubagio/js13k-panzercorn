import { lerp } from "./math";

export const hands: number[] = [];
export const handSides: number[] = [];
export const handBlobs: number[] = [];

export let buttonAnchor = 1.4;
export const setButtonAnchor = (b: number, l: number) => {
  buttonAnchor = lerp(buttonAnchor, b, l);
};

export const clearXRInputs = () => {
  hands.length = 0;
  handSides.length = 0;
  handBlobs.length = 0;
};

export const handRadius = 0.01;
