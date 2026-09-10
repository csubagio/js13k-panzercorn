# Panzercorn

A Space Harrier-alike game designed primarily for WebXR but playable on desktop and mobile browsers, created for the js13kGames 2026 13KB game jam.

This is a paraphrase of my other entry, Uniphony (if I can finish it!), where I took all the assets I had created for that narrative-musical game and remixed them into an action game instead. Because, you know, sometimes you get the itch.

# Construction

This game is written in TypeScript, with a now fairly standard build pipeline of _Rollup_ (w/ TypeScript, to transpile and combine everything into a single file) => _Terser_ (standard minification) => [some custom automated golfing, mostly turning const into let] => _Roadroller_ (crazy golfing minification) => _zip_. Like Uniphony, the two (relatively, I think) unique dev strategies I focused on were a single-shader WebXR renderer and an audio worklet sound system.

## General golfing tips

Because it's never not fun to talk about golfing in general, here are a few standard things that worked out for this game:

- Religiously avoiding un-mangle-able keywords. Practically, that means a range of things from using `()=>{}` instead of `function(){}`, to reversing early out conditions, so it's `()=>{if(!out){}}` rather than `()=>{if(out)return;}`. Also: no classes means no unmangleable `this.`! In the end, I added a histogram generator to the build so I could look for words that survived Terser that shouldn't have, then truncated names like `height` to `heig` and `state` to `stat`.
- Aliasing the remaining keywords, if you use them more than once. Yes, both Roadroller and zip help reduce the cost of redundant statements, but locality affects both of them, so declaring `const sin=Math.sin;` once and then using just `sin` everywhere does make a difference! I also ended up looking up all the WebGL numeric constants and making my own enum of them so I could avoid their names.
- For data that is specified often, that is to say it shows up in many places, switch your units so that you can use small whole integers. For example, instead of specifying angles from `0-360`, why not accept values from `0-99` and then do a single expansion in the function that applies the rotation, i.e. `angle/99*PI*2` (don't worry, Terser will collapse static math).
- You don't have to give up type safety, legibility, or file organization when you're golfing. Rollup and Terser will combine everything into a single file, and then systematically do things like inline const values, remove function calls that resolve into short single statements, etc. Even before minification gets rid of trivial bytes like extra white space.
- It's OK to run out of space, I was out of space on day 2. Make it exist first, then you'll know how to make it good! A lot of golfing may or may not work depending on the context of your whole game, so it's good to do some obvious things up front, but keep the intensive golfing for after you have a lot of code to experiment with.

One thing that came up a few times was that using arrays instead of objects made declaring or manipulating some things terser in code. One TypeScript construct that I found super useful for keeping things in sync is this guy:

```ts
type SafeArray<E, T> = { [K in E]: T } & { length: keyof typeof E };
```

That lets you declare an array whose keys are an enum, which gives you type checking when you use it and also a compile error if your array declaration doesn't have enough members.

```ts
enum Type {
  cat,
  dog,
  chair,
}
const angerLevel: SafeArray<Type, number> = [5, 5000, 0]; // array must have at least 3 members
const anger1 = angerLevel[9]; // NOPE!
const anger2 = angerLevel[Type.dog]; // yup!
const howAngry = (t: Type) => {
  return angerLevel[t];
}; // yay!
const anger3 = howAngry(7); // NOPE!
interface Rage {
  type: Type;
};
const obj: Rage = { type: Type.cat };
const anger4 = howAngry(obj.type); // yup
```

## Graphics

The WebXR category this year allows importing the three.js library outside of your 13KB budget. I'm a huge three.js fan, I use it on my other game projects, but sticking with the spirit of JS13k, for the shits and giggles, I really only wanted to use what the browser standards gave me. So Panzercorn uses a tiny little raw WebXR renderer. Due to the performance constraints of XR, the actual scene needed to be computationally simple: no buffer effects, no ray marching, none of the fun bandwidth- or pixel-shader-intensive stuff—just good old basic geometry transforms and lighting! Here's what I did:

- In WebGL2 you don't _have_ to bind buffers to get valid draw calls, so instead of writing all the buffer filling and binding code in JS, I abuse the built-ins `gl_VertexID` and `gl_InstanceID` to generate repeating integer patterns on the GPU, which I then fold into grids and such.
- It takes a lot of code overhead to create a shader and pin down its uniform locations, and you usually end up with quite a bit of shared code across shaders. Instead of orchestrating all that, I just have one shader for everything. To make that work, I pass in an integer uniform that runs an if/else chain in the shader to create different things, e.g. the terrain, the flying carpet, trails, particles, and text.
- I did a really ugly little hash for noise, sampled fractally, to get the terrain, and then recycled that for the rocks and splashes. One deviation from the common height field: I displaced the terrain both vertically and horizontally to get the nice jagged and sheer walls.
- For lighting I just sort of handwaved a gradient using the pre-world-transform vertex positions as normals. Looks... OK!

Blurry text in VR is notoriously a turn off, so I generate a 2K font atlas using canvas, and then render all text as quads which index that texture. The Quest 2 was having trouble with an uncompressed 2K texture, so I'm using a luminance-only texture with a hard alpha cutoff. A little crunchy around the edges, but at least it's nice and sharp!

One place I was a little lavish in terms of space is that all my colors are specified in OKLab rather than RGB, so the very last step in the fragment shader is the big ol' OKLab to sRGB conversion. I think this ultimately paid off for a couple of reasons:

- I think color interpolation looks so much nicer in OKLab, so all the gradients feel fresh to me, without dipping into grays. Super easy to do a vibrant rainbow too; it's just sine waves through the `a` and `b` terms.
- All my actual color data is specified in OKLCH, which is luminance, saturation, and hue. The conversion between them is just a sin/cos, but that format is super intuitive to use and makes compressing the numeric representations really easy. I ended up using single digit integers for luminance and saturation, and double digits for hue. Bear in mind that these are still continuous values, interpolating between them still makes sense, you can still do overbright or oversaturated values, it's just that in the code, your colors can be as simple as `[7,7,6]` for a nice vibrant orange.
- I use truncated terms for the conversion, only three decimal places as opposed to the original seven or so. Makes hardly any difference here.

For the creatures I ended up, err golfing I suppose, a single primitive to use for almost everything. I'm calling it a capsulite. I think they worked out great, and they're very cheap to store. They're also innately LOD-able, and modelling with them gives you a natural animation hierarchy too. The downside of the way I've hacked them together here, though, is that each one is its own draw call. Yikes! Lots of opportunity to golf/optimize that. Anyway, the capsulite breaks down like this:

- It is effectively two hemispheres joined by a cylinder, so a capsule, but you can specify the start and end radius separately, and that value is interpolated pole to pole, so it's a _tapered_ capsule. Hey look, we already have a unicorn horn!
- The circular cross section is calculated in the squircle form, and the power is variable, so you can dial that up to get a rounded square capsule.
- There is an aspect value that scales it locally to squash the whole thing along the diameter of the hemispheres, so 3D capsule turns into 2D capsule. This is always local, so it's useful as a modelling tool separate from mesh scaling, because it happens before transformation and doesn't get inherited by children.

I mirrored the capsulite code in Blender using Geometry Nodes. This let me model my meshes in the Blender viewports, with all the lovely tools in there, and then just export the transform and primitive numbers with a little Python script. Super handy. One neat trick: I exported the data as a TypeScript file, as flat arrays, but I also exported const enum values with the bone names, so I could use those in the code to animate with! Nice names in code that just disappear into numbers for the final build.

The reflection is just the traditional "render stuff upside down" thing. The terrain itself doesn't need to be clipped; it only goes down to the water line, but it also has the water surface built into it as alpha fading at that level. The rocks have the mirroring built into their displacement: they are whole spheres that feed the absolute value of their y position into the noise, so when they're at water level, they mirror.

Aside from the capsulites, the terrain and flying carpet are basically the same tessellated displaced grids. The icebergs are displaced spheres using the same aforementioned fractal noise as the terrain. Rainbow weapons expand their trails in view space on the GPU, and the splash effects use point sprites with most of their motion calculated in the shader. The text is a little weird: to fit the attributeless hack, it is also a tessellated grid, and the data for the letters is actually passed in as a uniform array. Sorry not sorry :)

## Audio

A few years ago I made [Robin of Thirteensley](https://js13kgames.com/2023/games/robin-of-thirteensley), a js13k entry where I wanted to do something unique with the sound, so I implemented a little Karplus-Strong guitar simulator in an audio worklet. That lets you just skip most of the WebAudio node graph and write directly to the output buffers. (Bonus, this means you have very few un-mangle-able WebAudio names.) It sounded so good (at least to me!) that to this day I continue to tinker with the idea, playing with various kinds of audio generators, instruments, and effects in a worklet. Once you've paid for the overhead of setting up the worklet, the code in the update loop is generally pretty simple!

For Panzercorn I stripped that collection back into a little synthwave band and a compact set of arcade sound effects. I ended up with:

- Lush four-voice synth pads
- A DX7-ish lead
- A kick, snare, and cymbals
- A ping-pong delay (standing in for reverb)
- Rising lock-on tones, laser pews, impact booms, and a low rumble for the larger enemy attacks

From 10,000 feet, the worklet is like an independent synth program, operating in its own thread, with its own state. It contains a tiny tracker where songs are arrangements of reusable two-measure parts. The chord data, lead, and drums all share the audio clock, while the main thread only sends compact commands for song changes and sound effects. In the actual audio processing loop, everything is basically either a random noise generator or oscillator of some kind, being fed and attenuated into a bunch of accumulators that are summed to generate the audio.

## Build

Install the dependencies and create the combined release:

```sh
npm install
npm run build
```

The build writes the standalone game to `dist/index.html` and the submission archive to `dist/game.zip`.
