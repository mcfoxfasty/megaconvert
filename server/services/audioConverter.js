const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');

const SUPPORTED_INPUTS = new Set([
  'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'wma', 'aiff', 'opus'
]);

const SUPPORTED_OUTPUTS = new Set([
  'mp3', 'wav', 'ogg', 'm4a', 'flac', 'aac', 'opus'
]);

const SUPPORTED_BITRATES = new Set(['128k', '192k', '256k', '320k']);
const SUPPORTED_SAMPLE_RATES = new Set([44100, 48000]);

if (process.env.FFMPEG_PATH) ffmpeg.setFfmpegPath(process.env.FFMPEG_PATH);
if (process.env.FFPROBE_PATH) ffmpeg.setFfprobePath(process.env.FFPROBE_PATH);

function getCodecForFormat(format) {
  const f = String(format).toLowerCase();
  switch (f) {
    case 'mp3': return 'libmp3lame';
    case 'aac':
    case 'm4a': return 'aac';
    case 'ogg': return 'libvorbis';
    case 'opus': return 'libopus';
    case 'flac': return 'flac';
    case 'wav': return 'pcm_s16le';
    default: return 'copy';
  }
}

function timemarkToSeconds(mark) {
  const parts = String(mark).split(':').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return 0;
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
}

async function convertAudio(inputPath, outputFormat, options = {}) {
  const {
    bitrate,
    sampleRate,
    onProgress,
    cleanup = true,
    outputDir = path.resolve(process.cwd(), 'server', 'converted'),
    outputBasename
  } = options;

  if (!inputPath || typeof inputPath !== 'string') {
    throw new Error('Invalid inputPath: expected a file path string');
  }
  const resolvedInput = path.isAbsolute(inputPath) ? inputPath : path.resolve(process.cwd(), inputPath);
  const stat = await fsp.stat(resolvedInput).catch(() => null);
  if (!stat || !stat.isFile()) throw new Error(`Input file not found: ${resolvedInput}`);

  const inExt = path.extname(resolvedInput).replace(/^\./, '').toLowerCase();
  if (!SUPPORTED_INPUTS.has(inExt)) {
    throw new Error(`Unsupported input format .${inExt}. Supported: ${[...SUPPORTED_INPUTS].join(', ')}`);
  }

  const fmt = String(outputFormat || '').toLowerCase();
  if (!SUPPORTED_OUTPUTS.has(fmt)) {
    throw new Error(`Unsupported output format ${outputFormat}. Supported: ${[...SUPPORTED_OUTPUTS].join(', ')}`);
  }

  if (bitrate && !SUPPORTED_BITRATES.has(String(bitrate))) {
    throw new Error(`Unsupported bitrate ${bitrate}. Supported: ${[...SUPPORTED_BITRATES].join(', ')}`);
  }
  if (sampleRate && !SUPPORTED_SAMPLE_RATES.has(Number(sampleRate))) {
    throw new Error(`Unsupported sampleRate ${sampleRate}. Supported: ${[...SUPPORTED_SAMPLE_RATES].join(', ')}`);
  }

  await fsp.mkdir(outputDir, { recursive: true });
  const base = outputBasename || path.basename(resolvedInput, path.extname(resolvedInput));
  const outputPath = path.join(outputDir, `${base}.${fmt}`);
  await fsp.unlink(outputPath).catch(() => {});

  const metadata = await new Promise((resolve, reject) => {
    ffmpeg.ffprobe(resolvedInput, (err, data) => {
      if (err) return reject(new Error(`ffprobe failed: ${err.message}`));
      resolve(data);
    });
  });

  const duration = metadata?.format?.duration;

  const result = await new Promise((resolve, reject) => {
    let lastPercent = 0;
    const cmd = ffmpeg(resolvedInput)
      .audioCodec(getCodecForFormat(fmt))
      .format(fmt);

    if (bitrate) cmd.audioBitrate(String(bitrate));
    if (sampleRate) cmd.audioFrequency(Number(sampleRate));

    if (fmt === 'opus') cmd.outputOptions(['-vbr on', '-compression_level 10']);
    if (fmt === 'aac' || fmt === 'm4a') cmd.outputOptions(['-movflags +faststart']);

    cmd.on('start', (cl) => console.log(`[audioConverter] ffmpeg start: ${cl}`))
      .on('progress', (progress) => {
        let percent = progress.percent;
        if (typeof percent !== 'number' && typeof progress.timemark === 'string' && duration) {
          const t = timemarkToSeconds(progress.timemark);
          percent = Math.min(100, Math.max(0, (t / duration) * 100));
        }
        if (typeof percent === 'number' && Number.isFinite(percent)) {
          const p = Math.max(0, Math.min(100, Math.round(percent)));
          if (p !== lastPercent) {
            lastPercent = p;
            if (typeof onProgress === 'function') {
              try { onProgress(p); } catch {}
            }
          }
        }
      })
      .on('error', async (err, _stdout, stderr) => {
        console.error('[audioConverter] ffmpeg error:', err?.message);
        if (stderr) console.error('[audioConverter] stderr:', stderr);
        try { await fsp.unlink(outputPath); } catch {}
        reject(new Error(`Conversion failed: ${err?.message || 'Unknown ffmpeg error'}`));
      })
      .on('end', async () => {
        const outStat = await fsp.stat(outputPath).catch(() => null);
        resolve({ outputPath, format: fmt, duration, sizeBytes: outStat?.size });
      })
      .save(outputPath);
  });

  if (cleanup) {
    try { await fsp.unlink(resolvedInput); } catch (e) { console.warn('[audioConverter] cleanup warning:', e.message); }
  }

  return result;
}

module.exports = {
  convertAudio,
  SUPPORTED_INPUTS,
  SUPPORTED_OUTPUTS,
  SUPPORTED_BITRATES,
  SUPPORTED_SAMPLE_RATES,
};
