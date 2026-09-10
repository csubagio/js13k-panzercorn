import { AudioCommand, Song, Sound } from "./audio-protocol";

const rate = sampleRate;
const midi = (note: number) => 440 * 2 ** ((note - 69) / 12);
const { sin, exp, tanh } = Math;

// Signed roots encode minor chords
// Strings are two measures of 16th-notes
type Part = [string, string, string?, string?, string?];
type Track = [number, string, string, string];
const silent = "................................";
const parts: Part[] = [
  ["yy55<<77", "....2.4.5...4.2.....0.2.4...2..."],
  ["yy775544", "....2.4.5.7.5.4.2...1.2.0......."],
  ["rr..5500", "0...4.2...0.2.5.0.4...2.3...5.2."],
  ["rr00..04", "0.4.7...2...5.4.1...5.3.0.....4."],
  ["yy55rr44", "....4...2.......1...0..........."],
  ["yy775544", "....2...1.......0.......0......."],
  [
    "ww..00--",
    "0..2.4..5...4.2.7..5.4..2...1...",
    "x..x..x.x...x...",
    "....x.......x...",
    "x.x.x.x.x.x.x.x.",
  ],
  [
    "rrrr....",
    silent,
    "x...............",
    "............x...",
    "..x...x...x...x.",
  ],
  [
    "55550000",
    silent,
    "x...............",
    "............x...",
    "..x...x...x...x.",
  ],
  [
    "rr..00--",
    "....0...2...4...5.4.2.0.2.4.5.7.",
    "x...x...x.x.x.x.",
    "....x.......x...",
    "..x...x.x.x.x.x.",
  ],
  ["tt007722", "0...2.4...5.4...2...4.5...7.5..."],
  ["tt2200//", "7...5.4...2.....0...2...4.5.4.2."],
];

// tempo, part order, default kick and snare.
const songs: Track[] = [
  [94, "0101", "x.......x.......", "....x.......x..."],
  [156, "23236:;:;789", "x...x...x...x...", "....x.......x..."],
  [72, "4545", "x.......x.......", "............x..."],
];

let song = Song.None,
  pendingSong = Song.None,
  sampleTime = 0,
  lastStep = -1,
  songBpm = 0;
let padLfo = 0,
  padLow = 0;
const padPhases = [0.12, 0.31, 0.53, 0.77],
  padPhases2 = [0.67, 0.43, 0.21, 0.05],
  padTargets = [57, 60, 64, 67].map(midi),
  padFrequencies = [...padTargets];
let leadPhase = 0,
  leadModPhase = 0,
  leadFrequency = 0,
  leadLevel = 0;
let kickAge = rate,
  snareAge = rate,
  hatAge = rate,
  noise = 1,
  snareLow = 0;
let aimPhase = 0,
  aimLfo = 0,
  aimLevel = 0,
  aimTarget = 0,
  aimFrequency = midi(48),
  aimPitch = aimFrequency,
  locks = 0;
let pewAge = rate,
  pewPhase = 0,
  pewPitch = 800,
  pews = 0;
let boomAge = rate,
  boomPhase = 0,
  boomPitch = 70,
  boomLow = 0;
const delayLength = rate >> 1,
  delayBuffers = [new Float32Array(delayLength), new Float32Array(delayLength)],
  delayTaps = [0, 0],
  delayLows = [0, 0];
let delayWrite = 0;

let chordRoot = 57,
  minor = 1;
const intervals = [0, 2, 4, 5, 7, 9, 11],
  chordDegrees = [0, 2, 4, 6];
const lockPitches = [52, 55, 60, 67, 72];
const interval = (degree: number) =>
  intervals[degree] - minor * +(degree === 2 || degree > 4);
const selectChord = (part: Part, row: number) => {
  const chord = part[0].charCodeAt(row >> 2);
  minor = +(chord > 90);
  chordRoot = chord - minor * 64;
  for (let voice = 0; voice < 4; voice++)
    padTargets[voice] = midi(chordRoot + interval(chordDegrees[voice]));
};
const note = (pattern: string, row: number, octave: number) => {
  const degree = pattern.charCodeAt(row) - 48;
  return degree < 0
    ? 0
    : midi(
        chordRoot + interval(degree % 7) + 12 * (octave + ((degree / 7) | 0)),
      );
};

class PanzercornTracker extends AudioWorkletProcessor {
  constructor() {
    super();
    this.port.onmessage = (event) => {
      const next = event.data as number;
      if (next >= AudioCommand.Tempo) {
        songBpm = next - AudioCommand.Tempo;
        sampleTime = 0;
        lastStep = -1;
        return;
      }
      if (next >= Sound.Aim) {
        if (next === Sound.Aim) {
          locks = 0;
          aimTarget = 0.088;
          aimPitch = midi(48);
        }
        if (next === Sound.Lock) {
          aimPhase = 0;
          aimLevel = 0.176;
          aimFrequency = aimPitch = midi(lockPitches[locks < 5 ? locks++ : 4]);
        }
        if (next === Sound.Stop) aimTarget = 0;
        if (next === Sound.Pew) pews++;
        if (next >= Sound.Boom) {
          boomAge = boomPhase = 0;
          boomPitch =
            next === Sound.Boom
              ? 60 + noise * 35
              : next === Sound.Hurt
                ? ((kickAge = 0), 45)
                : 270;
        }
        return;
      }
      if (next < Song.None || next > Song.Defeat) return;
      songBpm = 0;
      if (next === Song.None || song === Song.None) {
        song = pendingSong = next;
        sampleTime = 0;
        lastStep = -1;
      } else pendingSong = next;
    };
  }

  process(_inputs: Float32Array[][], outputs: Float32Array[][]) {
    const out = outputs[0];
    for (let i = 0; i < out[0].length; i++, sampleTime++) {
      let sample = 0;
      if (song !== Song.None) {
        const current = songs[song - 1];
        const bpm = songBpm || current[0];
        const stepDuration = (rate * 60) / bpm / 4;
        const step = (sampleTime / stepDuration) | 0;
        if (step !== lastStep) {
          lastStep = step;
          const row = step & 31;
          if (!(step & 15) && step && pendingSong !== song) {
            song = pendingSong;
            sampleTime = 0;
            lastStep = -1;
            continue;
          }
          const order = current[1],
            part = parts[order.charCodeAt((step >> 5) % order.length) - 48];
          if (!(row & 3)) selectChord(part, row);
          const lead = note(part[1], row, 1);
          if (lead) {
            leadFrequency = lead;
            leadLevel = 0.18;
          }
          if ((part[2] || current[2])[row & 15] === "x") kickAge = 0;
          if ((part[3] || current[3])[row & 15] === "x") snareAge = 0;
          if (part[4] ? part[4][row & 15] === "x" : current[0] > 100 || row & 1)
            hatAge = 0;
        }

        padLfo = (padLfo + 0.25 / rate) % 1;
        let pad = 0;
        for (let voice = 0; voice < 4; voice++) {
          padFrequencies[voice] +=
            (padTargets[voice] - padFrequencies[voice]) * 0.0015;
          padPhases[voice] =
            (padPhases[voice] + padFrequencies[voice] / rate) % 1;
          padPhases2[voice] =
            (padPhases2[voice] +
              (padFrequencies[voice] * (1 + (voice - 1.5) * 0.0015)) / rate) %
            1;
          const phase = padPhases[voice];
          pad +=
            (phase + padPhases2[voice] - 1) * 0.35 + sin(phase * 6.283) * 0.45;
        }
        padLow += (pad * 0.25 - padLow) * (0.016 + sin(padLfo * 6.283) * 0.004);
        sample = padLow * 1.2;

        if (leadFrequency) {
          leadPhase = (leadPhase + leadFrequency / rate) % 1;
          leadModPhase = (leadModPhase + (leadFrequency * 2.01) / rate) % 1;
          leadLevel *= 0.99988;
          sample +=
            sin((leadPhase + sin(leadModPhase * 6.283) * 0.18) * 6.283) *
            leadLevel;
        }
        if (kickAge < rate * 0.35) {
          const time = kickAge++ / rate;
          sample +=
            sin(time * (150 - time * 260) * 6.283) * exp(-time * 14) * 0.65;
        }
        if (snareAge < rate * 0.22) {
          const time = snareAge++ / rate;
          snareLow += (noise - 0.5 - snareLow) * 0.18;
          sample += snareLow * exp(-time * 18) * 0.5;
        }
        if (hatAge < rate * 0.045)
          sample += (noise - 0.5) * exp(-(hatAge++ / rate) * 80) * 0.12;
      }
      noise = (noise * 1.73) % 1;
      aimLevel += (aimTarget - aimLevel) * 0.003;
      aimFrequency += (aimPitch - aimFrequency) * 0.003;
      aimLfo = (aimLfo + (12 + locks * 2) / rate) % 1;
      const wobble = sin(aimLfo * 6.283);
      aimPhase = (aimPhase + (aimFrequency * (1 + wobble * 0.04)) / rate) % 1;
      const aim = sin(aimPhase * 6.283) * aimLevel * (0.8 + wobble * 0.2);
      if (pews && pewAge > rate * 0.07) {
        pews--;
        pewAge = pewPhase = 0;
        pewPitch = 1750 + noise * 100;
      }
      if (pewAge < rate * 0.16) {
        const time = pewAge++ / rate;
        pewPhase += (pewPitch * (1 - time * 3)) / rate;
        sample += sin(pewPhase * 6.283) * exp(-time * 24) * 0.3;
      }
      if (boomAge < rate * (boomPitch > 100 ? 1 : 0.5)) {
        const time = boomAge++ / rate;
        boomPhase += ((boomPitch % 150) * (1 - time)) / rate;
        boomLow += (noise - 0.5 - boomLow) * 0.08;
        sample +=
          (sin(boomPhase * 6.283) * (boomPitch > 100 ? 1.5 : 0.35) +
            boomLow * +(boomPitch < 100)) *
          exp(-time * (boomPitch > 100 ? 3 : 8)) *
          1.04;
      }
      for (let channel = 0; channel < 2; channel++) {
        const tap = (delayTaps[channel] =
          delayBuffers[channel][
            ((delayWrite - rate * (0.36 + channel * 0.12) + delayLength) %
              delayLength) |
              0
          ]);
        delayLows[channel] += (tap - delayLows[channel]) * 0.02;
        delayBuffers[channel][delayWrite] =
          sample + (delayTaps[1 - channel] - delayLows[1 - channel]) * 0.62;
        out[channel][i] = tanh(sample * 0.46 + tap * 0.18 + aim);
      }
      delayWrite = ++delayWrite % delayLength;
    }
    return true;
  }
}
registerProcessor("P", PanzercornTracker);
