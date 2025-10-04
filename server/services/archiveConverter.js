const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const seven = require('node-7z');
const which = require('which');

const SUPPORTED_INPUTS = new Set([
  'zip', '7z', 'rar', 'tar', 'gz', 'bz2', 'xz'
]);

const SUPPORTED_OUTPUTS = new Set([
  'zip', '7z', 'tar', 'gz', 'bz2', 'xz'
]);

async function find7zBinary() {
  if (process.env.SEVEN_ZIP_PATH && fs.existsSync(process.env.SEVEN_ZIP_PATH)) return process.env.SEVEN_ZIP_PATH;
  try {
    return which.sync(process.platform === 'win32' ? '7z.exe' : '7z');
  } catch {
    // common Windows installs
    const candidates = [
      'C:/Program Files/7-Zip/7z.exe',
      'C:/Program Files (x86)/7-Zip/7z.exe'
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
    return null;
  }
}

function extOf(p) { return path.extname(p).replace(/^\./, '').toLowerCase(); }

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

function parseOutputPath(outputDir, inputPath, outputFormat, outputBasename) {
  const base = outputBasename || path.basename(inputPath, path.extname(inputPath));
  return path.join(outputDir, `${base}.${outputFormat}`);
}

/**
 * Convert/extract/compress archives using 7-Zip.
 *
 * @param {string|string[]} inputPath - file(s) to process. For compression, pass an array of file/dir paths.
 * @param {('zip'|'7z'|'tar'|'gz'|'bz2'|'xz')} outputFormat
 * @param {{
 *   mode?: 'auto'|'extract'|'compress'|'convert',
 *   outputDir?: string,
 *   outputBasename?: string,
 *   password?: string,
 *   level?: 0|1|2|3|4|5|6|7|8|9,
 *   onProgress?: (percent:number)=>void,
 *   cleanup?: boolean
 * }} options
 */
async function convertArchive(inputPath, outputFormat, options = {}) {
  const {
    mode = 'auto',
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename,
    password,
    level = 5,
    onProgress,
    cleanup = false,
  } = options;

  const sevenBin = await find7zBinary();
  if (!sevenBin) {
    throw new Error('7-Zip binary not found. Please install 7-Zip and/or set SEVEN_ZIP_PATH env var.');
  }

  await ensureDir(outputDir);

  const isArrayInput = Array.isArray(inputPath);
  const inputs = isArrayInput ? inputPath : [inputPath];
  for (const p of inputs) {
    const abs = path.isAbsolute(p) ? p : path.resolve(process.cwd(), p);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st) throw new Error(`Input not found: ${abs}`);
  }

  const outFmt = String(outputFormat || '').toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(outFmt)) {
    throw new Error(`Unsupported output format "${outputFormat}". Supported: ${[...SUPPORTED_OUTPUTS].join(', ')}`);
  }

  // Decide action
  let action = mode;
  if (mode === 'auto') {
    action = isArrayInput ? 'compress' : 'extract';
  }

  // Progress mapping: 7z gives file-based progress; we map to a rough percentage
  const report = (p) => { if (typeof onProgress === 'function') { try { onProgress(p); } catch {} } };

  if (action === 'extract') {
    const input = path.isAbsolute(inputs[0]) ? inputs[0] : path.resolve(process.cwd(), inputs[0]);
    const inExt = extOf(input);
    if (!SUPPORTED_INPUTS.has(inExt)) {
      throw new Error(`Unsupported archive input ".${inExt}". Supported: ${[...SUPPORTED_INPUTS].join(', ')}`);
    }

    const outDir = path.join(outputDir, path.basename(input, path.extname(input)));
    await ensureDir(outDir);

    await new Promise((resolve, reject) => {
      const stream = seven.extractFull(input, outDir, {
        $bin: sevenBin,
        password,
      });
      stream.on('progress', (p) => {
        if (p && p.percent) report(Math.min(100, Math.max(0, Math.round(p.percent))));
      });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    if (cleanup) { try { await fsp.unlink(input); } catch {} }
    return outDir;
  }

  if (action === 'compress') {
    const baseName = outputBasename || (isArrayInput ? 'archive' : path.basename(inputs[0]));
    const outPath = path.join(outputDir, `${baseName}.${outFmt}`);
    await fsp.unlink(outPath).catch(() => {});
    const args = { $bin: sevenBin };
    if (password) args.password = password;
    if (typeof level === 'number') args.method = [ `-mx=${Math.max(0, Math.min(9, level))}` ];

    await new Promise((resolve, reject) => {
      const stream = seven.add(outPath, inputs, args);
      stream.on('progress', (p) => { if (p && p.percent) report(Math.min(100, Math.max(0, Math.round(p.percent)))); });
      stream.on('end', resolve);
      stream.on('error', reject);
    });

    return outPath;
  }

  if (action === 'convert') {
    // Implemented as extract -> re-compress to new format
    const input = path.isAbsolute(inputs[0]) ? inputs[0] : path.resolve(process.cwd(), inputs[0]);
    const tempDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'archive-'));
    try {
      await new Promise((resolve, reject) => {
        const stream = seven.extractFull(input, tempDir, { $bin: sevenBin, password });
        stream.on('progress', (p) => { if (p && p.percent) report(Math.min(100, Math.max(0, Math.round(p.percent * 0.5)))); });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      const outBase = outputBasename || path.basename(input, path.extname(input));
      const outPath = path.join(outputDir, `${outBase}.${outFmt}`);
      await fsp.unlink(outPath).catch(() => {});

      await new Promise((resolve, reject) => {
        const stream = seven.add(outPath, [path.join(tempDir, '*')], { $bin: sevenBin, method: [ `-mx=${Math.max(0, Math.min(9, level))}` ] });
        stream.on('progress', (p) => { if (p && p.percent) report(50 + Math.min(50, Math.round(p.percent * 0.5))); });
        stream.on('end', resolve);
        stream.on('error', reject);
      });

      if (cleanup) { try { await fsp.unlink(input); } catch {} }
      return outPath;
    } finally {
      try {
        const files = await fsp.readdir(tempDir).catch(() => []);
        await Promise.all(files.map(f => fsp.rm(path.join(tempDir, f), { recursive: true, force: true })));
        await fsp.rmdir(tempDir).catch(() => {});
      } catch {}
    }
  }

  throw new Error(`Unsupported mode: ${mode}. Use 'extract', 'compress', or 'convert'.`);
}

module.exports = {
  convertArchive,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
};
