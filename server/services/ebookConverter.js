const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const { spawn } = require('child_process');
const which = require('which');

const SUPPORTED_INPUTS = new Set(['epub', 'mobi', 'azw3', 'pdf', 'txt', 'html']);
const SUPPORTED_OUTPUTS = new Set(['epub', 'pdf', 'mobi', 'txt']);

function ext(p) { return path.extname(p).replace(/^\./, '').toLowerCase(); }
async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }

async function findEbookConvert(customPath) {
  const candidates = [];
  if (customPath) candidates.push(customPath);
  // Windows typical install paths
  candidates.push('ebook-convert');
  candidates.push('C:/Program Files/Calibre2/ebook-convert.exe');
  candidates.push('C:/Program Files/Calibre/ebook-convert.exe');
  candidates.push('C:/Program Files (x86)/Calibre2/ebook-convert.exe');
  candidates.push('C:/Program Files (x86)/Calibre/ebook-convert.exe');
  for (const c of candidates) {
    try {
      const resolved = c === 'ebook-convert' ? which.sync(c) : (await fsp.stat(c).then(() => c).catch(() => null));
      if (resolved) return resolved;
    } catch {}
  }
  throw new Error('Calibre ebook-convert not found. Please install Calibre and ensure ebook-convert is in PATH.');
}

function pushArg(args, key, value) {
  if (value === undefined || value === null || value === '') return;
  args.push(`--${key}`);
  if (value !== true) args.push(String(value));
}

/**
 * @param {string} inputPath
 * @param {'epub'|'pdf'|'mobi'|'txt'} outputFormat
 * @param {{
 *  outputDir?: string,
 *  outputBasename?: string,
 *  calibrePath?: string,
 *  // metadata
 *  title?: string,
 *  author?: string,
 *  cover?: string, // path to image
 *  // TOC and structure
 *  tocTitle?: string,
 *  level1Toc?: string, // xpath or pattern
 *  level2Toc?: string,
 *  level3Toc?: string,
 *  chapter?: string, // regex to split chapters
 *  // fonts
 *  embedFonts?: string[], // file paths
 *  // formatting
 *  marginTop?: string,
 *  marginRight?: string,
 *  marginBottom?: string,
 *  marginLeft?: string,
 *  baseFontSize?: string,
 *  lineHeight?: string,
 * }} options
 */
async function convertEbook(inputPath, outputFormat, options = {}) {
  const {
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename,
    calibrePath,
    title,
    author,
    cover,
    tocTitle,
    level1Toc,
    level2Toc,
    level3Toc,
    chapter,
    embedFonts,
    marginTop,
    marginRight,
    marginBottom,
    marginLeft,
    baseFontSize,
    lineHeight,
  } = options;

  if (!inputPath || typeof inputPath !== 'string') throw new Error('Invalid inputPath');
  const inAbs = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const st = await fsp.stat(inAbs).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Input not found: ${inAbs}`);

  const inExt = ext(inAbs);
  if (!SUPPORTED_INPUTS.has(inExt)) throw new Error(`Unsupported input format .${inExt}`);
  const outFmt = String(outputFormat || '').toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(outFmt)) throw new Error(`Unsupported output format ${outputFormat}`);

  const ebookConvert = await findEbookConvert(calibrePath);

  await ensureDir(outputDir);
  const base = outputBasename || path.basename(inAbs, path.extname(inAbs));
  const outPath = path.join(outputDir, `${base}.${outFmt}`);
  try { await fsp.unlink(outPath); } catch {}

  const args = [inAbs, outPath];

  // Metadata
  pushArg(args, 'title', title);
  pushArg(args, 'authors', author);
  pushArg(args, 'cover', cover);

  // TOC
  pushArg(args, 'toc-title', tocTitle);
  pushArg(args, 'level1-toc', level1Toc);
  pushArg(args, 'level2-toc', level2Toc);
  pushArg(args, 'level3-toc', level3Toc);

  // Chapter splitting
  pushArg(args, 'chapter', chapter);

  // Font embedding (Calibre uses --embed-font-family? It supports --extra-css; for fonts, embed via CSS @font-face)
  let tmpCssPath = null;
  if (Array.isArray(embedFonts) && embedFonts.length > 0) {
    const cssParts = [];
    for (const fp of embedFonts) {
      const abs = path.isAbsolute(fp) ? fp : path.resolve(process.cwd(), fp);
      const exists = await fsp.stat(abs).then(() => true).catch(() => false);
      if (!exists) continue;
      const family = path.basename(abs, path.extname(abs)).replace(/[^A-Za-z0-9_-]/g, '_');
      cssParts.push(`@font-face{font-family:"${family}";src:url("${abs.replace(/\\/g,'/')}") format("${path.extname(abs).slice(1)}");font-weight:normal;font-style:normal}`);
      // Prefer using this family as base
      pushArg(args, 'font-family', family);
    }
    if (cssParts.length) {
      tmpCssPath = path.join(outputDir, `${base}.embed-fonts.css`);
      await fsp.writeFile(tmpCssPath, cssParts.join('\n'));
      pushArg(args, 'extra-css', tmpCssPath);
    }
  }

  // Format-specific options
  pushArg(args, 'margin-top', marginTop);
  pushArg(args, 'margin-right', marginRight);
  pushArg(args, 'margin-bottom', marginBottom);
  pushArg(args, 'margin-left', marginLeft);
  pushArg(args, 'base-font-size', baseFontSize);
  pushArg(args, 'line-height', lineHeight);

  // Cover image conversion implicitly handled by Calibre; nothing explicit required beyond --cover

  // Execute ebook-convert
  await new Promise((resolve, reject) => {
    const child = spawn(ebookConvert, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => { stderr += d.toString(); });
    child.on('error', reject);
    child.on('close', code => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`ebook-convert exited with code ${code}: ${stderr}`));
    });
  });

  // Clean up temp css if created
  if (tmpCssPath) {
    try { await fsp.unlink(tmpCssPath); } catch {}
  }

  return { outputPath: outPath, format: outFmt };
}

module.exports = {
  convertEbook,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
  findEbookConvert,
};
