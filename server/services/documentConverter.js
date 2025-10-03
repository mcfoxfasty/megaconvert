// server/services/documentConverter.js
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');
const { PDFDocument } = require('pdf-lib');
const mammoth = require('mammoth');

const SUPPORTED_INPUTS = new Set([
  'pdf', 'docx', 'doc', 'txt', 'rtf', 'odt', 'html', 'htm', 'epub'
]);

const SUPPORTED_OUTPUTS = new Set([
  'pdf', 'docx', 'txt', 'html', 'epub'
]);

let cachedLOPath = null;

function normalizeExt(p) {
  return path.extname(p).replace(/^\./, '').toLowerCase();
}

function ensureOutputExt(format) {
  const f = String(format || '').trim().toLowerCase();
  if (f === 'htm') return 'html';
  if (f === 'jpeg') return 'jpg';
  return f;
}

function isArray(val) {
  return Array.isArray(val);
}

async function ensureDir(dir) {
  await fsp.mkdir(dir, { recursive: true });
}

function execFileAsync(file, args, options = {}) {
  return new Promise((resolve, reject) => {
    execFile(file, args, { ...options }, (err, stdout, stderr) => {
      if (err) {
        const e = new Error(`Command failed: ${file} ${args.join(' ')} - ${err.message}`);
        e.stdout = stdout;
        e.stderr = stderr;
        return reject(e);
      }
      resolve({ stdout, stderr });
    });
  });
}

async function locateLibreOffice() {
  if (cachedLOPath) return cachedLOPath;

  const envPath = process.env.LIBREOFFICE_PATH || process.env.SOFFICE_PATH;
  if (envPath && fs.existsSync(envPath)) {
    cachedLOPath = envPath;
    return cachedLOPath;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    candidates.push(
      'C:\\Program Files\\LibreOffice\\program\\soffice.exe',
      'C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe'
    );
    try {
      const { stdout } = await execFileAsync('where', ['soffice.exe']);
      stdout.split(/\r?\n/).forEach(p => {
        const s = p.trim();
        if (s) candidates.push(s);
      });
    } catch {}
  } else {
    candidates.push('/usr/bin/soffice', '/usr/local/bin/soffice');
    try {
      const { stdout } = await execFileAsync('which', ['soffice']);
      stdout.split(/\r?\n/).forEach(p => {
        const s = p.trim();
        if (s) candidates.push(s);
      });
    } catch {}
  }

  for (const c of candidates) {
    if (c && fs.existsSync(c)) {
      cachedLOPath = c;
      return cachedLOPath;
    }
  }
  return null;
}

function parsePageRange(rangeStr, totalPages) {
  const set = new Set();
  if (!rangeStr || !String(rangeStr).trim()) return [];
  const chunks = String(rangeStr).split(',').map(s => s.trim()).filter(Boolean);
  for (const chunk of chunks) {
    const m = chunk.match(/^(\d+)\s*-\s*(\d+)$/);
    if (m) {
      let start = parseInt(m[1], 10);
      let end = parseInt(m[2], 10);
      if (start > end) [start, end] = [end, start];
      for (let p = start; p <= end; p++) {
        if (p >= 1 && (!totalPages || p <= totalPages)) set.add(p);
      }
    } else {
      const p = parseInt(chunk, 10);
      if (Number.isFinite(p) && p >= 1 && (!totalPages || p <= totalPages)) set.add(p);
    }
  }
  return Array.from(set).sort((a, b) => a - b);
}

async function getPdfPageCount(pdfPath) {
  const data = await fsp.readFile(pdfPath);
  const doc = await PDFDocument.load(data);
  return doc.getPageCount();
}

async function subsetPdf(inputPdf, outputPdf, pages) {
  const srcBytes = await fsp.readFile(inputPdf);
  const srcDoc = await PDFDocument.load(srcBytes);
  const dstDoc = await PDFDocument.create();

  const total = srcDoc.getPageCount();
  const selected = pages && pages.length ? pages : Array.from({ length: total }, (_, i) => i + 1);

  const zeroBased = selected.map(p => p - 1).filter(i => i >= 0 && i < total);

  const copied = await dstDoc.copyPages(srcDoc, zeroBased);
  copied.forEach(p => dstDoc.addPage(p));

  const saved = await dstDoc.save({ useObjectStreams: true });
  await ensureDir(path.dirname(outputPdf));
  await fsp.writeFile(outputPdf, saved);
  return outputPdf;
}

async function mergePdfs(inputs, outputPdf) {
  const dstDoc = await PDFDocument.create();
  for (const inPath of inputs) {
    const bytes = await fsp.readFile(inPath);
    const src = await PDFDocument.load(bytes);
    const copied = await dstDoc.copyPages(src, src.getPageIndices());
    copied.forEach(p => dstDoc.addPage(p));
  }
  const saved = await dstDoc.save({ useObjectStreams: true });
  await ensureDir(path.dirname(outputPdf));
  await fsp.writeFile(outputPdf, saved);
  return outputPdf;
}

async function splitPdf(inputPdf, ranges, outDir, base) {
  const total = await getPdfPageCount(inputPdf);
  const rangeList = Array.isArray(ranges) ? ranges : String(ranges || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!rangeList.length) throw new Error('split: no ranges provided');

  await ensureDir(outDir);
  const outputs = [];
  let idx = 1;
  for (const r of rangeList) {
    const pages = parsePageRange(r, total);
    if (!pages.length) continue;
    const outPath = path.join(outDir, `${base || path.basename(inputPdf, '.pdf')}_part${idx++}.pdf`);
    await subsetPdf(inputPdf, outPath, pages);
    outputs.push(outPath);
  }
  return outputs;
}

async function runLibreOfficeConvert(loPath, inputFile, targetExt, outDir, filterOptions) {
  await ensureDir(outDir);
  const convertArg = filterOptions ? `${targetExt}:${filterOptions}` : targetExt;
  const args = ['--headless', '--convert-to', convertArg, '--outdir', outDir, inputFile];

  console.log(`[documentConverter] LO convert: ${loPath} ${args.join(' ')}`);
  const { stderr } = await execFileAsync(loPath, args, { timeout: 120000 }).catch(err => {
    console.error('[documentConverter] LibreOffice conversion error:', err.stderr || err.message);
    throw new Error(`LibreOffice conversion failed: ${err.message}`);
  });

  const base = path.basename(inputFile, path.extname(inputFile));
  const expectedExt = ensureOutputExt(targetExt);
  const outCandidates = await fsp.readdir(outDir);
  const match = outCandidates.find(f => f.toLowerCase().startsWith(base.toLowerCase() + '.') && f.toLowerCase().endsWith('.' + expectedExt));
  if (!match) {
    const any = outCandidates.find(f => f.toLowerCase().startsWith(base.toLowerCase() + '.'));
    if (any) return path.join(outDir, any);
    throw new Error(`LibreOffice did not produce expected output for ${base}.${expectedExt}. stderr: ${stderr || 'n/a'}`);
  }
  return path.join(outDir, match);
}

async function pdfToImagesViaLibreOffice(loPath, inputPdf, outDir, imageFormat = 'png', concurrency = 4) {
  const total = await getPdfPageCount(inputPdf);
  const tmpDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'pdfpages-'));

  try {
    const singles = [];
    for (let p = 1; p <= total; p++) {
      const singleOut = path.join(tmpDir, `page-${p}.pdf`);
      await subsetPdf(inputPdf, singleOut, [p]);
      singles.push({ page: p, file: singleOut });
    }

    const results = new Array(singles.length);
    let next = 0;
    let active = 0;
    await new Promise((resolve, reject) => {
      const launch = () => {
        while (active < concurrency && next < singles.length) {
          const i = next++;
          active++;
          (async () => {
            const { page, file } = singles[i];
            const produced = await runLibreOfficeConvert(loPath, file, imageFormat, outDir).catch(reject);
            if (!produced) return;
            const target = path.join(outDir, `${path.basename(inputPdf, '.pdf')}_page-${page}.${ensureOutputExt(imageFormat)}`);
            await fsp.rename(produced, target).catch(async () => {
              await fsp.copyFile(produced, target);
              await fsp.unlink(produced).catch(() => {});
            });
            results[i] = target;
            active--;
            if (next >= singles.length && active === 0) resolve();
            else launch();
          })().catch(reject);
        }
      };
      launch();
    });

    return results;
  } finally {
    try {
      const files = await fsp.readdir(tmpDir);
      await Promise.all(files.map(f => fsp.unlink(path.join(tmpDir, f)).catch(() => {})));
      await fsp.rmdir(tmpDir).catch(() => {});
    } catch {}
  }
}

function validateIO(inputPath, outputFormat) {
  const out = String(outputFormat || '').trim().toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(out)) {
    throw new Error(`Unsupported output format "${outputFormat}". Supported: ${[...SUPPORTED_OUTPUTS].join(', ')}`);
  }
  const inputs = isArray(inputPath) ? inputPath : [inputPath];
  for (const p of inputs) {
    const ext = normalizeExt(String(p));
    if (!SUPPORTED_INPUTS.has(ext)) {
      throw new Error(`Unsupported input format ".${ext}" for file "${p}". Supported: ${[...SUPPORTED_INPUTS].join(', ')}`);
    }
  }
}

function defaultOutputPath(outputDir, inputFile, outputFormat, outputBasename) {
  const base = outputBasename ? outputBasename : path.basename(inputFile, path.extname(inputFile));
  return path.join(outputDir, `${base}.${ensureOutputExt(outputFormat)}`);
}

async function convertDocxToHtmlWithMammoth(inputDocx, outPath) {
  const { value: html, messages } = await mammoth.convertToHtml({ path: inputDocx });
  if (messages && messages.length) {
    console.log('[documentConverter] mammoth messages:', messages.map(m => m.message).join(' | '));
  }
  await ensureDir(path.dirname(outPath));
  await fsp.writeFile(outPath, html, 'utf8');
  return outPath;
}

async function compressPdfLossless(inputPdf, outPdf) {
  const bytes = await fsp.readFile(inputPdf);
  const doc = await PDFDocument.load(bytes);
  const saved = await doc.save({ useObjectStreams: true });
  await ensureDir(path.dirname(outPdf));
  await fsp.writeFile(outPdf, saved);
  return outPdf;
}

async function convertDocument(inputPath, outputFormat, options = {}) {
  const {
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename,
    preserveFormatting = false,
    pageRange,
    split,
    merge,
    compress = false,
    pdfToImages = false,
    imageFormat = 'png',
    concurrency = 4,
    cleanup = false
  } = options;

  validateIO(inputPath, outputFormat);
  await ensureDir(outputDir);

  const inputs = isArray(inputPath) ? inputPath : [inputPath];
  for (const inFile of inputs) {
    const abs = path.isAbsolute(inFile) ? inFile : path.resolve(process.cwd(), inFile);
    const st = await fsp.stat(abs).catch(() => null);
    if (!st || !st.isFile()) {
      throw new Error(`Input file not found: ${abs}`);
    }
  }

  const outFmt = ensureOutputExt(outputFormat);

  if (merge) {
    const allPdf = inputs.every(f => normalizeExt(f) === 'pdf');
    if (!allPdf) throw new Error('merge option requires all inputs to be PDF files.');
    const outPath = defaultOutputPath(outputDir, inputs[0], 'pdf', outputBasename || 'merged');
    console.log(`[documentConverter] Merging ${inputs.length} PDF(s) -> ${outPath}`);
    const result = await mergePdfs(inputs, outPath);
    if (cleanup) for (const f of inputs) await fsp.unlink(f).catch(() => {});
    return result;
  }

  const input = inputs[0];
  const inputExt = normalizeExt(input);
  const absInput = path.isAbsolute(input) ? input : path.resolve(process.cwd(), input);

  const loPath = await locateLibreOffice();

  if (inputExt === 'pdf') {
    if (split) {
      const base = outputBasename || path.basename(absInput, '.pdf');
      const outputs = await splitPdf(absInput, split, outputDir, base);
      if (cleanup) await fsp.unlink(absInput).catch(() => {});
      return outputs;
    }

    if (outFmt === 'pdf') {
      const tempOut = defaultOutputPath(outputDir, absInput, 'pdf', outputBasename || path.basename(absInput, '.pdf'));
      const total = await getPdfPageCount(absInput);
      const pages = pageRange ? parsePageRange(pageRange, total) : [];
      if (pages.length) {
        console.log(`[documentConverter] Creating PDF subset pages [${pages.join(', ')}]`);
        await subsetPdf(absInput, tempOut, pages);
      } else {
        await fsp.copyFile(absInput, tempOut);
      }

      if (compress) {
        const compressed = defaultOutputPath(outputDir, absInput, 'pdf', (outputBasename || path.basename(absInput, '.pdf')) + '_compressed');
        console.log('[documentConverter] Compressing PDF (lossless re-save)');
        await compressPdfLossless(tempOut, compressed);
        await fsp.unlink(tempOut).catch(() => {});
        if (cleanup) await fsp.unlink(absInput).catch(() => {});
        return compressed;
      } else {
        if (cleanup) await fsp.unlink(absInput).catch(() => {});
        return tempOut;
      }
    }

    if (pdfToImages) {
      if (!loPath) throw new Error('LibreOffice not found. PDF to images requires LibreOffice.');
      console.log('[documentConverter] Extracting PDF pages to images via LibreOffice');
      const images = await pdfToImagesViaLibreOffice(loPath, absInput, outputDir, imageFormat, concurrency);
      if (cleanup) await fsp.unlink(absInput).catch(() => {});
      return images;
    }

    if (!loPath) {
      throw new Error(`LibreOffice not found. Cannot convert PDF -> ${outFmt} without LibreOffice.`);
    }
    const out = await runLibreOfficeConvert(loPath, absInput, outFmt, outputDir);
    if (cleanup) await fsp.unlink(absInput).catch(() => {});
    return out;
  }

  if (inputExt === 'docx' && outFmt === 'html') {
    const outPath = defaultOutputPath(outputDir, absInput, 'html', outputBasename);
    console.log('[documentConverter] DOCX -> HTML via mammoth');
    const produced = await convertDocxToHtmlWithMammoth(absInput, outPath, preserveFormatting);
    if (cleanup) await fsp.unlink(absInput).catch(() => {});
    return produced;
  }

  if ((inputExt === 'html' || inputExt === 'htm') && outFmt === 'pdf') {
    if (!loPath) throw new Error('LibreOffice not found. HTML -> PDF requires LibreOffice.');
    const out = await runLibreOfficeConvert(loPath, absInput, 'pdf', outputDir);
    if (cleanup) await fsp.unlink(absInput).catch(() => {});
    return out;
  }

  if (['docx', 'doc', 'rtf', 'odt', 'txt', 'html', 'htm', 'epub'].includes(inputExt)) {
    if (outFmt === 'html' && inputExt !== 'docx') {
      if (!loPath) throw new Error(`LibreOffice not found. ${inputExt} -> HTML requires LibreOffice.`);
      const out = await runLibreOfficeConvert(loPath, absInput, 'html', outputDir);
      if (cleanup) await fsp.unlink(absInput).catch(() => {});
      return out;
    }

    if (outFmt === 'pdf' || outFmt === 'docx' || outFmt === 'txt' || outFmt === 'epub') {
      if (!loPath) throw new Error(`LibreOffice not found. ${inputExt} -> ${outFmt} requires LibreOffice.`);
      const out = await runLibreOfficeConvert(loPath, absInput, outFmt, outputDir);
      if (cleanup) await fsp.unlink(absInput).catch(() => {});
      return out;
    }
  }

  throw new Error(`Unsupported conversion path: ${inputExt} -> ${outFmt}`);
}

module.exports = {
  convertDocument,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS
};
