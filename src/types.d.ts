declare module "worklet:source" {
  const source: string;
  export default source;
}

declare module "*.glsl" {
  const source: string;
  export default source;
}

declare const sampleRate: number;
declare const __DEV__: boolean;
declare const __DESKTOP__: boolean;
declare const __VR__: boolean;
declare function registerProcessor(
  name: string,
  processor: new (options: AudioWorkletNodeOptions) => AudioWorkletProcessor,
): void;
declare class AudioWorkletProcessor {
  readonly port: MessagePort;
}

type SafeArray<E, T> = { [K in E]: T } & { length: keyof typeof E };
