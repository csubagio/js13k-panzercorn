import workletSource from "worklet:source";
import { AudioCommand, Song, Sound } from "./audio-protocol";

let context: AudioContext;
let tracker: Promise<AudioWorkletNode>;

const createTracker = async () => {
  const url = URL.createObjectURL(
    new Blob([workletSource], { type: "text/javascript" }),
  );
  await context.audioWorklet.addModule(url);
  const node = new AudioWorkletNode(context, "P", { outputChannelCount: [2] });
  node.connect(context.destination);
  return node;
};

export const initializeAudio = () => {
  context ||= new AudioContext();
  context.resume();
  return (tracker ||= createTracker());
};

export const setSong = async (song: Song) => {
  const node = await initializeAudio();
  node.port.postMessage(song);
};

export const setTempo = async (bpm: number) => {
  const node = await initializeAudio();
  node.port.postMessage(AudioCommand.Tempo + bpm);
};

export const playSound = async (sound: Sound) => {
  const node = await initializeAudio();
  node.port.postMessage(sound);
};
