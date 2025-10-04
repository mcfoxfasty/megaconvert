const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const fontkit = require('fontkit');
const opentype = require('opentype.js');
const { Font, woff2, woff, eot, ttf } = require('fonteditor-core');

const SUPPORTED_INPUTS = new Set(['ttf', 'otf', 'woff', 'woff2', 'eot']);
const SUPPORTED_OUTPUTS = new Set(['ttf', 'otf', 'woff', 'woff2']);

function ext(p) { return path.extname(p).replace(/^\./, '').toLowerCase(); }
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

function loadFontBuffer(filePath) {
  return fs.readFileSync(filePath);
}

function toSubsetUnicodeList(chars = '') {
  if (!chars || typeof chars !== 'string') return null;
  const set = new Set();
  for (const ch of [...chars]) set.add(ch.codePointAt(0));
  return Array.from(set);
}

function fonteditorTypeForExt(format) {
  const f = String(format).toLowerCase();
  if (f === 'ttf') return 'ttf';
  if (f === 'otf') return 'otf';
  if (f === 'woff') return 'woff';
  if (f === 'woff2') return 'woff2';
  return 'ttf';
}

function extractMetadataWithFontkit(buffer) {
  let name = undefined, family = undefined, subfamily = undefined;
  try {
    const fk = fontkit.create(buffer);
    family = fk.familyName;
    subfamily = fk.subfamilyName;
    name = fk.fullName || [family, subfamily].filter(Boolean).join(' ');
  } catch {}
  return { name, family, style: subfamily };
}

function generatePreviewSVG(text, fontPath) {
  try {
    const font = opentype.loadSync(fontPath);
    const fontSize = 64;
    const pathObj = font.getPath(text || 'AaBbCc 123', 0, fontSize, fontSize);
    const svgPath = pathObj.toSVG(2);
    const width = Math.max(300, Math.round(pathObj.getBoundingBox().x2 + 10));
    const height = Math.max(100, Math.round(pathObj.getBoundingBox().y2 + 10));
    return `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><g transform="translate(10,0)">${svgPath}</g></svg>`;
  } catch (e) {
    return null;
  }
}

/**
 * @param {string} inputPath
 * @param {'ttf'|'otf'|'woff'|'woff2'} outputFormat
 * @param {{ outputDir?: string, outputBasename?: string, subset?: string, previewText?: string }} options
 */
async function convertFont(inputPath, outputFormat, options = {}) {
  const { outputDir = path.resolve(process.cwd(), 'server', 'converted'), outputBasename, subset, previewText } = options;

  if (!inputPath || typeof inputPath !== 'string') throw new Error('Invalid inputPath');
  const inAbs = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const st = await fsp.stat(inAbs).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Input not found: ${inAbs}`);

  const inExt = ext(inAbs);
  if (!SUPPORTED_INPUTS.has(inExt)) throw new Error(`Unsupported input format .${inExt}`);
  const outFmt = String(outputFormat || '').toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(outFmt)) throw new Error(`Unsupported output format ${outputFormat}`);

  await ensureDir(outputDir);
  const base = outputBasename || path.basename(inAbs, path.extname(inAbs));
  const outPath = path.join(outputDir, `${base}.${outFmt}`);
  try { await fsp.unlink(outPath); } catch {}

  // Read font via fonteditor-core
  const buffer = loadFontBuffer(inAbs);
  const type = fonteditorTypeForExt(inExt);
  const font = Font.create(buffer, { type });

  // Optional subsetting
  const unicodes = toSubsetUnicodeList(subset);
  if (unicodes && unicodes.length > 0) {
    font.setGlyf(font.find({ unicode: unicodes }));
  }

  // Write target format
  const targetType = fonteditorTypeForExt(outFmt);
  const outBuffer = font.write({
    type: targetType,
    hinting: true,
    deflate: targetType === 'woff' ? require('pako').deflate : undefined,
  });
  await fsp.writeFile(outPath, Buffer.from(outBuffer));

  // Metadata and preview
  const metadata = extractMetadataWithFontkit(buffer);
  let previewSVG = generatePreviewSVG(previewText || 'AaBbCc 0123', inAbs);

  return { outputPath: outPath, format: outFmt, metadata, previewSVG };
}

module.exports = {
  convertFont,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
};
