const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const sharp = require('sharp');
let pngToIco;
try { pngToIco = require('png-to-ico'); } catch { pngToIco = null; }

const SUPPORTED_INPUTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'svg', 'ico', 'heic'
]);

const SUPPORTED_OUTPUTS = new Set([
  'jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'tif', 'tiff', 'ico', 'avif'
]);

function normalizeFormat(fmt) { return String(fmt || '').trim().toLowerCase(); }
function requiresAlphaFlatten(format) {
  const f = normalizeFormat(format);
  return f === 'jpg' || f === 'jpeg' || f === 'bmp' || f === 'tif' || f === 'tiff' || f === 'ico';
}
function outputExt(format) { const f = normalizeFormat(format); if (f === 'jpeg') return 'jpg'; if (f === 'tif') return 'tiff'; return f; }
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }
function isBatch(inputPath) { return Array.isArray(inputPath); }
function getOutputPath(outputDir, inputFile, outputFormat, outputBasename) {
  const base = outputBasename ? outputBasename : path.basename(inputFile, path.extname(inputFile));
  return path.join(outputDir, `${base}.${outputExt(outputFormat)}`);
}
function validateFormats(inputPath, outputFormat) {
  const out = normalizeFormat(outputFormat);
  if (!SUPPORTED_OUTPUTS.has(out)) throw new Error(`Unsupported output format "${outputFormat}". Supported: ${[...SUPPORTED_OUTPUTS].join(', ')}`);
  const inputs = isBatch(inputPath) ? inputPath : [inputPath];
  for (const p of inputs) {
    const ext = path.extname(String(p)).replace(/^\./, '').toLowerCase();
    if (!SUPPORTED_INPUTS.has(ext)) throw new Error(`Unsupported input format ".${ext}" for file "${p}". Supported: ${[...SUPPORTED_INPUTS].join(', ')}`);
  }
}
function pickNumber(n, min, max) { if (typeof n !== 'number' || !Number.isFinite(n)) return undefined; if (min!=null && n<min) return min; if (max!=null && n>max) return max; return n; }

async function convertOne(inputPath, outputFormat, options) {
  const {
    quality,
    resize,
    png,
    jpeg,
    webp,
    avif,
    tiff,
    gif,
    preserveMetadata,
    background,
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename,
    cleanup = false
  } = options || {};

  const resolvedInput = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const st = await fsp.stat(resolvedInput).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Input file not found: ${resolvedInput}`);

  await ensureDir(outputDir);
  const outPath = getOutputPath(outputDir, resolvedInput, outputFormat, outputBasename);
  const fmt = normalizeFormat(outputFormat);

  const meta = await sharp(resolvedInput, { failOnError: false }).metadata();
  let pipeline = sharp(resolvedInput, { failOnError: false });
  if (preserveMetadata) pipeline = pipeline.withMetadata();
  if (background && requiresAlphaFlatten(fmt)) {
    const bg = { r: background.r ?? 255, g: background.g ?? 255, b: background.b ?? 255, alpha: background.alpha == null ? 1 : background.alpha };
    pipeline = pipeline.flatten({ background: bg });
  }

  if (resize && (resize.percent || resize.width || resize.height)) {
    let targetWidth; let targetHeight;
    if (resize.percent) {
      const percent = pickNumber(resize.percent, 1, 10000);
      if (!meta.width || !meta.height) throw new Error('Cannot apply percentage resize: source dimensions unavailable');
      if (resize.lockAspectRatio === false) {
        targetWidth = Math.max(1, Math.round((meta.width * percent) / 100));
        targetHeight = Math.max(1, Math.round((meta.height * percent) / 100));
      } else {
        targetWidth = Math.max(1, Math.round((meta.width * percent) / 100));
      }
    } else {
      if (resize.lockAspectRatio === false) {
        targetWidth = pickNumber(resize.width, 1);
        targetHeight = pickNumber(resize.height, 1);
      } else {
        targetWidth = pickNumber(resize.width, 1);
        targetHeight = pickNumber(resize.height, 1);
      }
    }
    pipeline = pipeline.resize({ width: targetWidth, height: targetHeight, fit: resize.fit || 'cover', withoutEnlargement: !!resize.withoutEnlargement });
  }

  const q = pickNumber(quality, 1, 100);
  if (fmt === 'jpg' || fmt === 'jpeg') {
    pipeline = pipeline.jpeg({ quality: q ?? 80, progressive: !!(jpeg && jpeg.progressive) });
  } else if (fmt === 'png') {
    const compressionLevel = png && typeof png.compressionLevel === 'number' ? Math.max(0, Math.min(9, png.compressionLevel)) : 6;
    const palette = png && typeof png.palette === 'boolean' ? png.palette : undefined;
    const pngQuality = png && typeof png.quality === 'number' ? pickNumber(png.quality, 1, 100) : undefined;
    pipeline = pipeline.png({ compressionLevel, palette, quality: pngQuality });
  } else if (fmt === 'webp') {
    pipeline = pipeline.webp({ quality: q ?? 80, lossless: !!(webp && webp.lossless) });
  } else if (fmt === 'avif') {
    pipeline = pipeline.avif({ quality: q ?? 50, lossless: !!(avif && avif.lossless), chromaSubsampling: (avif && avif.chromaSubsampling) || '4:2:0' });
  } else if (fmt === 'gif') {
    if (!sharp.format.gif || !sharp.format.gif.output) throw new Error('GIF output not supported by current sharp/libvips build.');
    const effort = gif && typeof gif.effort === 'number' ? Math.max(1, Math.min(10, gif.effort)) : 7;
    const colours = gif && typeof gif.colours === 'number' ? Math.max(2, Math.min(256, gif.colours)) : 256;
    pipeline = pipeline.gif({ effort, colours });
  } else if (fmt === 'tif' || fmt === 'tiff') {
    pipeline = pipeline.tiff({ quality: q ?? 80, compression: (tiff && tiff.compression) || 'lzw' });
  } else if (fmt === 'bmp') {
    pipeline = pipeline.bmp();
  } else if (fmt === 'ico') {
    if (!pngToIco) throw new Error('ICO output requires "png-to-ico" package.');
    const sizes = (options.ico && Array.isArray(options.ico.sizes) && options.ico.sizes.length) ? options.ico.sizes : [16,24,32,48,64,128,256];
    const pngBuffers = [];
    for (const size of sizes) {
      let img = sharp(resolvedInput, { failOnError: false });
      if (preserveMetadata) img = img.withMetadata();
      if (background && requiresAlphaFlatten('ico')) {
        const bg = { r: background.r ?? 255, g: background.g ?? 255, b: background.b ?? 255, alpha: background.alpha == null ? 1 : background.alpha };
        img = img.flatten({ background: bg });
      }
      img = img.resize({ width: size, height: size, fit: 'cover' }).png();
      const buf = await img.toBuffer();
      pngBuffers.push(buf);
    }
    const icoBuffer = await pngToIco(pngBuffers);
    await ensureDir(path.dirname(outPath));
    await fsp.writeFile(outPath, icoBuffer);
    const outStat = await fsp.stat(outPath).catch(() => null);
    if (cleanup) { try { await fsp.unlink(resolvedInput); } catch (e) { console.warn('[imageConverter] Cleanup warning:', e.message); } }
    return { outputPath: outPath, format: 'ico', width: Math.max(...sizes), height: Math.max(...sizes), sizeBytes: outStat?.size };
  }

  console.log(`[imageConverter] Converting "${resolvedInput}" -> ${outputFormat}`);
  const info = await pipeline.toFile(outPath).catch(async (err) => {
    console.error('[imageConverter] Conversion error:', err?.message || err);
    try { await fsp.unlink(outPath); } catch {}
    throw new Error(`Image conversion failed: ${err?.message || 'Unknown error'}`);
  });

  if (cleanup) { try { await fsp.unlink(resolvedInput); } catch (e) { console.warn('[imageConverter] Cleanup warning:', e.message); } }

  return { outputPath: outPath, format: outputExt(outputFormat), width: info?.width, height: info?.height, sizeBytes: info?.size };
}

async function runLimited(items, limit, mapper) {
  const results = new Array(items.length);
  let next = 0; let active = 0;
  return new Promise((resolve, reject) => {
    const launch = () => {
      while (active < limit && next < items.length) {
        const idx = next++;
        active++;
        Promise.resolve().then(() => mapper(items[idx], idx)).then((res) => {
          results[idx] = res; active--; if (next >= items.length && active === 0) resolve(results); else launch();
        }).catch((err) => reject(err));
      }
    };
    launch();
  });
}

async function convertImage(inputPath, outputFormat, options = {}) {
  validateFormats(inputPath, outputFormat);
  if (isBatch(inputPath)) {
    const inputs = inputPath;
    const concurrency = options.concurrency && Number.isFinite(options.concurrency) ? Math.max(1, options.concurrency) : 4;
    console.log(`[imageConverter] Batch converting ${inputs.length} file(s) with concurrency ${concurrency}`);
    const results = await runLimited(inputs, concurrency, (p) => convertOne(p, outputFormat, options));
    return results;
  } else {
    const result = await convertOne(inputPath, outputFormat, options);
    return result;
  }
}

module.exports = { convertImage, SUPPORTED_INPUTS, SUPPORTED_OUTPUTS };
