const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const which = require('which');
const { execFile } = require('child_process');
const JSZip = require('jszip');

const SUPPORTED_INPUTS = new Set(['pptx', 'ppt', 'odp', 'key', 'pdf']);
const SUPPORTED_OUTPUTS = new Set(['pptx', 'pdf', 'odp', 'html']);

async function locateLibreOffice() {
  const envPath = process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) return envPath;
  try {
    return which.sync(process.platform === 'win32' ? 'soffice.exe' : 'soffice');
  } catch {}
  if (process.platform === 'win32') {
    const candidates = [
      'C:/Program Files/LibreOffice/program/soffice.exe',
      'C:/Program Files (x86)/LibreOffice/program/soffice.exe',
    ];
    for (const c of candidates) if (fs.existsSync(c)) return c;
  }
  return null;
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options }, (err, stdout, stderr) => {
      if (err) return reject(Object.assign(new Error(`Command failed: ${file} ${args.join(' ')}`), { stdout, stderr }));
      resolve({ stdout, stderr });
    });
  });
}

async function ensureDir(dir) { await fsp.mkdir(dir, { recursive: true }); }
function ext(p) { return path.extname(p).replace(/^\./, '').toLowerCase(); }

async function runLOConvert(lo, inputFile, targetExt, outDir, filter) {
  await ensureDir(outDir);
  const convertArg = filter ? `${targetExt}:${filter}` : targetExt;
  const args = ['--headless', '--convert-to', convertArg, '--outdir', outDir, inputFile];
  await execFileAsync(lo, args, { timeout: 120000 });
  const base = path.basename(inputFile, path.extname(inputFile));
  const files = await fsp.readdir(outDir);
  const expectedExt = targetExt === 'htm' ? 'html' : targetExt;
  const match = files.find(f => f.toLowerCase().startsWith(base.toLowerCase() + '.') && f.toLowerCase().endsWith('.' + expectedExt));
  if (!match) throw new Error(`LibreOffice did not produce ${expectedExt} for ${base}`);
  return path.join(outDir, match);
}

async function extractNotesFromPptx(pptxPath) {
  // Best-effort notes extraction from PPTX (Office Open XML): notesSlides/notesSlide*.xml
  const data = await fsp.readFile(pptxPath);
  const zip = await JSZip.loadAsync(data);
  const notes = [];
  const entries = Object.keys(zip.files).filter(n => n.startsWith('ppt/notesSlides/notesSlide'));
  for (const name of entries) {
    const xml = await zip.files[name].async('string');
    const text = xml
      .replace(/<\/?a:t[^>]*>/g, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .trim();
    if (text) notes.push({ file: name, text });
  }
  return notes;
}

async function pdfToImagesViaLibreOffice(lo, inputPdf, outDir, format = 'png') {
  await ensureDir(outDir);
  // LO: convert-to png will create one image per page with suffix
  const produced = await runLOConvert(lo, inputPdf, format, outDir);
  // Sometimes LO writes a single file when 1 page; when multiple, names may vary.
  // Collect all images with base name prefix.
  const base = path.basename(inputPdf, '.pdf').toLowerCase();
  const files = await fsp.readdir(outDir);
  const imgs = files
    .filter(f => f.toLowerCase().startsWith(base + '.') || f.toLowerCase().startsWith(base + '_') || f.toLowerCase().includes(base))
    .filter(f => f.toLowerCase().endsWith('.' + format));
  if (imgs.length === 0) return [produced];
  return imgs.map(f => path.join(outDir, f));
}

/**
 * @param {string} inputPath
 * @param {'pptx'|'pdf'|'odp'|'html'} outputFormat
 * @param {{
 *   outputDir?: string,
 *   outputBasename?: string,
 *   preserveAnimations?: boolean,
 *   pdfQuality?: 'low'|'medium'|'high',
 *   pdfToImages?: boolean,
 *   imageFormat?: 'png'|'jpg'|'jpeg',
 *   extractNotes?: boolean
 * }} options
 */
async function convertPresentation(inputPath, outputFormat, options = {}) {
  const {
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename,
    preserveAnimations = false,
    pdfQuality = 'high',
    pdfToImages = false,
    imageFormat = 'png',
    extractNotes = false,
  } = options;

  const lo = await locateLibreOffice();
  if (!lo) throw new Error('LibreOffice not found. Please install it or set LIBREOFFICE_PATH.');

  const inAbs = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const st = await fsp.stat(inAbs).catch(() => null);
  if (!st || !st.isFile()) throw new Error(`Input not found: ${inAbs}`);

  const inExt = ext(inAbs);
  if (!SUPPORTED_INPUTS.has(inExt)) throw new Error(`Unsupported input format .${inExt}`);
  const outFmt = String(outputFormat || '').toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(outFmt)) throw new Error(`Unsupported output format ${outputFormat}`);

  await ensureDir(outputDir);
  const base = outputBasename || path.basename(inAbs, path.extname(inAbs));

  // Prepare export filter for PDF quality (LibreOffice Impress filter: impress_pdf_Export)
  const pdfFilter = (() => {
    const qualityMap = { low: '75', medium: '90', high: '100' };
    const q = qualityMap[pdfQuality] || '100';
    // Filter options are limited; we use a generic quality parameter where supported.
    return `impress_pdf_Export:quality=${q}`;
  })();

  // KEY input: convert via LO (if supported) else error
  // LO can import some KEY files via filters; best-effort attempt

  let producedPath;

  if (outFmt === 'html') {
    // HTML slide deck
    producedPath = await runLOConvert(lo, inAbs, 'html', outputDir);
  } else if (outFmt === 'pdf') {
    producedPath = await runLOConvert(lo, inAbs, 'pdf', outputDir, pdfFilter);
    if (pdfToImages) {
      const imgDir = path.join(outputDir, `${base}_slides_${imageFormat}`);
      const images = await pdfToImagesViaLibreOffice(lo, producedPath, imgDir, imageFormat);
      return { pdfPath: producedPath, images };
    }
  } else if (outFmt === 'pptx' || outFmt === 'odp') {
    producedPath = await runLOConvert(lo, inAbs, outFmt, outputDir);
  } else {
    throw new Error(`Unsupported conversion path: .${inExt} -> ${outFmt}`);
  }

  let notes = [];
  if (extractNotes) {
    try {
      if (inExt === 'pptx') {
        notes = await extractNotesFromPptx(inAbs);
      } else if (producedPath && ext(producedPath) === 'pptx') {
        notes = await extractNotesFromPptx(producedPath);
      }
    } catch (e) {
      console.warn('[presentationConverter] Notes extraction warning:', e.message);
    }
  }

  return { outputPath: producedPath, notes: extractNotes ? notes : undefined, preserveAnimations };
}

module.exports = {
  convertPresentation,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
};
