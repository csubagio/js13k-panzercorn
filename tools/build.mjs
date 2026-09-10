import fs from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { rollup } from "rollup";
import ts from "typescript";
import { tokenizer } from "acorn";
import { protectedProperties } from "./protected-properties.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "src");
const buildDir = path.join(root, ".build");
const distDir = path.join(root, "dist");
const marker = "<!--GAME-->";
const workletId = "worklet:source";
const limit = Number(process.env.JS13K_LIMIT || 13 * 1024);
const epoch = new Date("2000-01-01T00:00:00Z");

const bytes = (text) => Buffer.byteLength(text, "utf8");
const wordHistogram = (code) => {
  const counts = {};
  for (const word of code
    .replace(/\\(?:u\w{4}|x\w{2}|.)/g, " ")
    .match(/[A-Za-z_$][\w$]{3,}/g) || [])
    counts[word] = (counts[word] || 0) + 1;
  return Object.fromEntries(
    Object.entries(counts)
      .filter(([, count]) => count > 1)
      .sort(([a, ac], [b, bc]) => bc - ac || a.localeCompare(b)),
  );
};

// Terser retains const even when an immutable binding is not useful to output.
// Tokenizing keeps literals (including the embedded worklet) intact.
const demoteConstants = (source) => {
  const positions = [];
  for (const token of tokenizer(source, { ecmaVersion: 2022 }))
    if (token.type.label === "const") positions.push(token.start);
  for (let index = positions.length; index--; ) {
    const position = positions[index];
    source = source.slice(0, position) + "let" + source.slice(position + 5);
  }
  return source;
};

async function compileSource(checkTypes, development, target) {
  const configFile = ts.readConfigFile(
    path.join(root, "tsconfig.json"),
    ts.sys.readFile,
  );
  if (configFile.error)
    throw new Error(ts.formatDiagnostic(configFile.error, diagnosticHost));
  const config = ts.parseJsonConfigFileContent(configFile.config, ts.sys, root);
  const program = ts.createProgram(config.fileNames, config.options);
  const output = new Map();
  const emitted = program.emit(
    undefined,
    (filename, data, _bom, _errors, sources) => {
      if (filename.endsWith(".js") && sources?.length === 1)
        output.set(
          sources[0].fileName,
          data
            .replaceAll("__DEV__", String(development))
            .replaceAll("__DESKTOP__", String(target !== "vr"))
            .replaceAll("__VR__", String(target !== "desktop")),
        );
    },
  );
  const diagnostics = [
    ...config.errors,
    ...(checkTypes
      ? ts.getPreEmitDiagnostics(program)
      : program.getSyntacticDiagnostics()),
    ...emitted.diagnostics,
  ];
  if (diagnostics.length) {
    throw new Error(
      ts.formatDiagnosticsWithColorAndContext(diagnostics, diagnosticHost),
    );
  }
  return {
    name: "compiled-typescript",
    resolveId(id, importer) {
      if (!importer || !id.startsWith(".")) return null;
      const resolved = path.resolve(path.dirname(importer), id);
      for (const candidate of [
        `${resolved}.ts`,
        path.join(resolved, "index.ts"),
      ]) {
        if (output.has(candidate)) return candidate;
      }
      return null;
    },
    load: (id) => output.get(id) || null,
  };
}

const diagnosticHost = {
  getCanonicalFileName: (filename) => filename,
  getCurrentDirectory: () => root,
  getNewLine: () => "\n",
};

async function bundleSource(input, compiler, plugins = [], compact = true) {
  const bundle = await rollup({
    input: path.join(sourceDir, input),
    plugins: [...plugins, compiler],
  });
  const generated = await bundle.generate({ format: "es", compact });
  await bundle.close();
  return generated.output.find((file) => file.type === "chunk").code;
}

const workletSource = (source) => ({
  name: "worklet-source",
  resolveId: (id) => (id === workletId ? `\0${workletId}` : null),
  load: (id) =>
    id === `\0${workletId}` ? `export default ${JSON.stringify(source)}` : null,
});

const compactGlsl = (source) =>
  source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .split("\n")
    .map((line) =>
      line
        .trim()
        .replace(/\s+/g, " ")
        .replace(/\s*([{}()[\],;?:])\s*/g, "$1")
        .replace(/\s*([+*=\/<>])\s*/g, "$1"),
    )
    .filter(Boolean)
    .join("\n");

const glslSource = () => ({
  name: "glsl-source",
  resolveId: (id, importer) =>
    importer && id.endsWith(".glsl")
      ? path.resolve(path.dirname(importer), id)
      : null,
  async load(id) {
    if (!id.endsWith(".glsl")) return null;
    return `export default ${JSON.stringify(compactGlsl(await fs.readFile(id, "utf8")))}`;
  },
});

async function minifySource(source, booleansAsIntegers = true) {
  const { minify } = await import("terser");
  const nameCache = {};
  const result = await minify(source, {
    ecma: 2022,
    toplevel: true,
    compress: {
      passes: 2,
      booleans_as_integers: booleansAsIntegers,
      unsafe_arrows: true,
      unsafe_methods: true,
      pure_getters: true,
      drop_console: true,
    },
    mangle: {
      toplevel: true,
      properties: {
        builtins: false,
        reserved: protectedProperties,
      },
    },
    format: { comments: false, ecma: 2022 },
    nameCache,
  });
  if (!result.code) throw new Error("Terser produced no code");
  const mangledProperties = nameCache.props?.props || {};
  for (const name of protectedProperties) {
    if (`$${name}` in mangledProperties)
      throw new Error(`Terser mangled protected property: ${name}`);
  }
  return { code: demoteConstants(result.code), nameCache };
}

async function roadroll(code) {
  const { Packer } = await import("roadroller");
  let seed = [...code].reduce(
    (hash, char) => Math.imul(hash ^ char.charCodeAt(), 16777619),
    2166136261,
  );
  const random = Math.random;
  Math.random = () =>
    (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0) / 2 ** 32;
  try {
    const options = {
      allowFreeVars: false,
      modelRecipBaseCount: 20,
      modelMaxCount: 4,
      dynamicModels: 0,
      numAbbreviations: 0,
      sparseSelectors: [0, 1, 2, 3, 7, 13, 14, 21, 42, 113, 177, 449],
      precision: 14,
      recipLearningRate: 1333,
    };
    const packer = new Packer(
      [{ data: code, type: "js", action: "eval" }],
      options,
    );
    const { firstLine, secondLine } = packer.makeDecoder();
    return { code: firstLine + secondLine, options };
  } finally {
    Math.random = random;
  }
}

function makeHtml(template, code) {
  if (template.split(marker).length !== 2) {
    throw new Error(`HTML template must contain exactly one ${marker}`);
  }
  return template.replace(
    marker,
    `<script>${code.replaceAll("</script", "<\\/script")}</script>`,
  );
}

async function jsZip(html) {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("index.html", html, { date: epoch, createFolders: false });
  return Buffer.from(
    await zip.generateAsync({
      type: "uint8array",
      compression: "DEFLATE",
      compressionOptions: { level: 9 },
      platform: "DOS",
    }),
  );
}

async function systemZip(html, label, temporaryDir) {
  if (!existsSync("/usr/bin/zip")) return;
  const dir = path.join(temporaryDir, label);
  const output = path.join(temporaryDir, `${label}.zip`);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, "index.html"), html);
  await fs.utimes(path.join(dir, "index.html"), epoch, epoch);
  const result = spawnSync(
    "/usr/bin/zip",
    ["-q", "-9", "-X", output, "index.html"],
    { cwd: dir },
  );
  if (result.status) throw new Error(`zip failed: ${result.stderr}`);
  return fs.readFile(output);
}

async function packCandidate(label, code, template, temporaryDir) {
  const html = makeHtml(template, code);
  const archives = [
    { packer: "jszip", data: await jsZip(html) },
    { packer: "zip", data: await systemZip(html, label, temporaryDir) },
  ].filter((candidate) => candidate.data);
  const best = archives.sort((a, b) => a.data.length - b.data.length)[0];
  return { label, code, html, zip: best.data, zipper: best.packer };
}

async function validate(candidate, enforceLimit) {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(candidate.zip);
  const files = Object.values(zip.files).filter((file) => !file.dir);
  if (files.length !== 1 || !zip.file("index.html")) {
    throw new Error("ZIP must contain only root index.html");
  }
  if ((await zip.file("index.html").async("string")) !== candidate.html) {
    throw new Error("ZIP contents differ from dist/index.html");
  }
  if (enforceLimit && candidate.zip.length > limit) {
    // throw new Error(`ZIP is ${candidate.zip.length - limit} bytes over the ${limit} byte limit`);
  }
}

async function writeAtomic(filename, data) {
  const temporary = `${filename}.tmp`;
  await fs.writeFile(temporary, data);
  await fs.rename(temporary, filename);
}

export async function build({
  development = false,
  outputDir = distDir,
  temporaryDir = buildDir,
  label = development ? "preview" : "release",
  target = process.env.TARGET || "both",
} = {}) {
  if (!["desktop", "vr", "both"].includes(target))
    throw new Error(`Unknown target: ${target}`);
  outputDir = path.resolve(outputDir);
  temporaryDir = path.resolve(temporaryDir);
  const started = performance.now();
  const timings = {};
  const timed = async (label, action) => {
    const stageStarted = performance.now();
    try {
      return await action();
    } finally {
      timings[label] = Math.round(performance.now() - stageStarted);
    }
  };
  await timed("setup", async () => {
    await fs.rm(temporaryDir, { recursive: true, force: true });
    await fs.mkdir(temporaryDir, { recursive: true });
    await fs.mkdir(outputDir, { recursive: true });
  });

  const template = await timed("template", () =>
    fs.readFile(path.join(sourceDir, "index.html"), "utf8"),
  );
  const compiler = await timed("typescript", () =>
    compileSource(!development, development, target),
  );
  const workletBundle = await timed("bundleWorklet", () =>
    bundleSource("worklet.ts", compiler),
  );
  const worklet = development
    ? { code: workletBundle, nameCache: {} }
    : await timed("minifyWorklet", () => minifySource(workletBundle, false));
  const bundled = await timed("bundleGame", () =>
    bundleSource("main.ts", compiler, [
      workletSource(worklet.code),
      glslSource(),
    ]),
  );
  const minified = development
    ? { code: bundled, nameCache: {} }
    : await timed("minifyGame", () => minifySource(bundled));
  const previousFile = path.join(outputDir, "report.json");
  const previousReport = existsSync(previousFile)
    ? JSON.parse(await fs.readFile(previousFile, "utf8"))
    : null;
  const rolled = development
    ? null
    : await timed("roadroller", () => roadroll(minified.code));
  const best = development
    ? { label: "preview", code: bundled, html: makeHtml(template, bundled) }
    : (
        await timed("zipCandidates", () =>
          Promise.all([
            packCandidate("terser", minified.code, template, temporaryDir),
            packCandidate("roadroller", rolled.code, template, temporaryDir),
          ]),
        )
      ).sort((a, b) => a.zip.length - b.zip.length)[0];
  if (!development) await timed("validate", () => validate(best, true));

  const previous = previousReport?.zip ?? best.zip?.length;
  const report = {
    workletBundle: bytes(workletBundle),
    worklet: bytes(worklet.code),
    bundle: bytes(bundled),
    terser: development ? null : bytes(minified.code),
    roadroller: development ? null : bytes(rolled.code),
    html: bytes(best.html),
    zip: development ? null : best.zip.length,
    remaining: development ? null : limit - best.zip.length,
    delta: development ? null : best.zip.length - previous,
    code: best.label,
    zipper: best.zipper,
    wordHistogram: development ? null : wordHistogram(minified.code),
    roadrollerOptions: rolled?.options,
    development,
    target,
    timings,
  };

  await timed("write", async () => {
    await writeAtomic(path.join(outputDir, "index.html"), best.html);
    if (!development) {
      await writeAtomic(path.join(outputDir, "game.zip"), best.zip);
      await writeAtomic(path.join(outputDir, "minified.js"), minified.code);
      await writeAtomic(
        path.join(outputDir, "name-cache.json"),
        JSON.stringify(
          {
            main: minified.nameCache,
            worklet: worklet.nameCache,
          },
          null,
          2,
        ),
      );
    }
    await writeAtomic(previousFile, JSON.stringify(report, null, 2));
    await fs.rm(temporaryDir, { recursive: true, force: true });
  });

  const duration = `${((performance.now() - started) / 1000).toFixed(2)}s`;
  const sizes = [
    `audio   ${report.worklet}`,
    `main    ${report.bundle}`,
    ...(development
      ? []
      : [
          //`terser  ${report.terser}`,
          //`roller  ${report.roadroller}`
        ]),
    //`html ${report.html}`,
    ...(development
      ? []
      : [
          `zip     ${report.remaining > 0 ? "+" : ""}${report.remaining} | ${report.zip}/${limit}`,
          //`${report.code}+${report.zipper}`
        ]),
    //`timing ${Object.entries(timings).map(([name, duration]) => `${name}:${duration}ms`).join(' ')}`
  ];
  console.log(`[${label}] ${duration}\n  ${sizes.join("\n  ")}`);
  return report;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  build().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
