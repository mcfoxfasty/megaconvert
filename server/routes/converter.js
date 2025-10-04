const express = require('express');
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const multer = require('multer');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

// Services
const audio = require('../services/audioConverter');
const image = require('../services/imageConverter');
const document = require('../services/documentConverter');
const archive = require('../services/archiveConverter');
const presentation = require('../services/presentationConverter');
const font = require('../services/fontConverter');
const ebook = require('../services/ebookConverter');

const router = express.Router();

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 200, // max requests per window per IP
  standardHeaders: true,
  legacyHeaders: false,
});
router.use(limiter);

// Storage for uploads (500MB limit)
const uploadDir = path.resolve(process.cwd(), 'server', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const safe = file.originalname.replace(/[^A-Za-z0-9._-]/g, '_');
    cb(null, `${unique}-${safe}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 500 * 1024 * 1024 }, // 500MB
});

// In-memory job store (for demo). Replace with Redis/DB for production.
const jobs = new Map();

function newJob(meta = {}) {
  const id = crypto.randomUUID();
  const job = {
    id,
    status: 'queued', // queued | running | completed | failed | cancelled
    progress: 0,
    etaSeconds: null,
    inputPath: null,
    outputPath: null,
    error: null,
    meta,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  return job;
}

function ext(p) { return path.extname(p).replace(/^\./, '').toLowerCase(); }

// Supported formats endpoint
router.get('/api/formats', (_req, res) => {
  res.json({
    audio: { inputs: [...audio.SUPPORTED_INPUTS], outputs: [...audio.SUPPORTED_OUTPUTS] },
    image: { inputs: [...image.SUPPORTED_INPUTS], outputs: [...image.SUPPORTED_OUTPUTS] },
    document: { inputs: [...document.SUPPORTED_INPUTS], outputs: [...document.SUPPORTED_OUTPUTS] },
    archive: { inputs: [...archive.SUPPORTED_INPUTS], outputs: [...archive.SUPPORTED_OUTPUTS] },
    presentation: { inputs: [...presentation.SUPPORTED_INPUTS], outputs: [...presentation.SUPPORTED_OUTPUTS] },
    font: { inputs: [...font.SUPPORTED_INPUTS], outputs: [...font.SUPPORTED_OUTPUTS] },
    ebook: { inputs: [...ebook.SUPPORTED_INPUTS], outputs: [...ebook.SUPPORTED_OUTPUTS] },
  });
});

// Main conversion endpoint
router.post('/api/convert', upload.single('file'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded. Use field name "file".' });
  const outputFormat = String(req.body.outputFormat || '').toLowerCase();
  const options = req.body.options ? JSON.parse(req.body.options) : {};
  const inputPath = req.file.path;
  const category = detectCategory(inputPath);

  const job = newJob({ category, outputFormat });
  job.inputPath = inputPath;

  res.json({ jobId: job.id });

  // Process async
  process.nextTick(() => runConversionJob(job.id, category, inputPath, outputFormat, options).catch(() => {}));
});

// Batch conversion endpoint
router.post('/api/batch', upload.array('files', 20), async (req, res) => {
  const files = req.files;
  if (!files || !Array.isArray(files) || files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded. Use field name "files".' });
  }
  const outputFormat = String(req.body.outputFormat || '').toLowerCase();
  const options = req.body.options ? JSON.parse(req.body.options) : {};

  const batchId = crypto.randomUUID();
  const fileJobs = [];
  for (const f of files) {
    const category = detectCategory(f.path);
    const job = newJob({ category, outputFormat, batchId });
    job.inputPath = f.path;
    fileJobs.push(job.id);
    process.nextTick(() => runConversionJob(job.id, category, f.path, outputFormat, options).catch(() => {}));
  }
  res.json({ batchId, jobs: fileJobs });
});

// Job status endpoint
router.get('/api/status/:jobId', (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  res.json({ id: job.id, status: job.status, progress: job.progress, etaSeconds: job.etaSeconds, error: job.error, outputPath: job.outputPath });
});

// Download endpoint
router.get('/api/download/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status !== 'completed' || !job.outputPath) return res.status(400).json({ error: 'Job not completed' });
  const out = job.outputPath;
  const filename = path.basename(out);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('Content-Type', 'application/octet-stream');
  const stream = fs.createReadStream(out);
  stream.on('close', async () => {
    // Cleanup output and input after download
    try { await fsp.unlink(out); } catch {}
    try { if (job.inputPath) await fsp.unlink(job.inputPath); } catch {}
    jobs.delete(job.id);
  });
  stream.pipe(res);
});

// Cancel endpoint
router.delete('/api/cancel/:jobId', async (req, res) => {
  const job = jobs.get(req.params.jobId);
  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'completed' || job.status === 'failed') return res.status(400).json({ error: 'Job already finished' });
  job.status = 'cancelled';
  try { if (job.inputPath) await fsp.unlink(job.inputPath); } catch {}
  try { if (job.outputPath) await fsp.unlink(job.outputPath); } catch {}
  res.json({ id: job.id, status: job.status });
});

// Helpers
function detectCategory(filePath) {
  const e = ext(filePath);
  if (audio.SUPPORTED_INPUTS.has(e)) return 'audio';
  if (image.SUPPORTED_INPUTS.has(e)) return 'image';
  if (document.SUPPORTED_INPUTS.has(e)) return 'document';
  if (archive.SUPPORTED_INPUTS.has(e)) return 'archive';
  if (presentation.SUPPORTED_INPUTS.has(e)) return 'presentation';
  if (font.SUPPORTED_INPUTS.has(e)) return 'font';
  if (ebook.SUPPORTED_INPUTS.has(e)) return 'ebook';
  return 'unknown';
}

async function runConversionJob(jobId, category, inputPath, outputFormat, options) {
  const job = jobs.get(jobId);
  if (!job || job.status === 'cancelled') return;
  job.status = 'running';
  job.progress = 0;
  const started = Date.now();

  const progress = (p) => {
    if (!jobs.has(jobId)) return;
    const j = jobs.get(jobId);
    j.progress = Math.max(0, Math.min(100, Number(p) || 0));
    const elapsed = (Date.now() - started) / 1000;
    const rate = j.progress > 0 ? elapsed / (j.progress / 100) : null;
    j.etaSeconds = rate ? Math.max(0, Math.round(rate - elapsed)) : null;
  };

  try {
    let result;
    switch (category) {
      case 'audio':
        result = await audio.convertAudio(inputPath, outputFormat, { ...options, onProgress: progress });
        break;
      case 'image':
        // image converter doesn't support progress natively; simulate coarse progress
        progress(10);
        result = await image.convertImage(inputPath, outputFormat, options);
        progress(100);
        break;
      case 'document':
        progress(5);
        result = await document.convertDocument(inputPath, outputFormat, options);
        progress(100);
        break;
      case 'archive':
        result = await archive.convertArchive(inputPath, outputFormat, { ...options, onProgress: progress });
        break;
      case 'presentation':
        progress(5);
        result = await presentation.convertPresentation(inputPath, outputFormat, options);
        progress(100);
        break;
      case 'font':
        progress(10);
        result = await font.convertFont(inputPath, outputFormat, options);
        progress(100);
        break;
      case 'ebook':
        progress(5);
        result = await ebook.convertEbook(inputPath, outputFormat, options);
        progress(100);
        break;
      default:
        throw new Error('Unsupported file type');
    }

    if (job.status === 'cancelled') return; // cancelled mid-process
    job.outputPath = typeof result === 'string' ? result : result?.outputPath || result?.pdfPath || null;
    job.status = 'completed';
    job.progress = 100;
    job.etaSeconds = 0;
  } catch (e) {
    if (!jobs.has(jobId)) return;
    const j = jobs.get(jobId);
    j.status = 'failed';
    j.error = e?.message || 'Conversion failed';
    j.etaSeconds = null;
  }
}

module.exports = router;
