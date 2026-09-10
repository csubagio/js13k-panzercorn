import { clamp, setDelta } from "./math";

export const clock = { tim: 0, dlta: 0 };

export const updateClock = (tim: number) => {
  const seconds = (tim / 1000) % 999;
  clock.dlta = clamp(seconds - clock.tim, 0, 0.1);
  setDelta(clock.dlta);
  clock.tim = seconds;
};
