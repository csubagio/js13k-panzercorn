import { clock } from "./clock";

export let scrollSpeed = 1.5;
export let worldDistance = 0;
export let scroll = 0;
export const worldSpeed = 47;

export const setScrollSpeed = (speed: number) => {
  scrollSpeed = speed;
};

export const updateWorld = () =>
  (worldDistance += scroll = clock.dlta * worldSpeed * scrollSpeed);
