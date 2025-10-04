import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import fileUpload from 'express-fileupload';
import path from 'path';
import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// File uploads
app.use(fileUpload({
  useTempFiles: true,
  tempFileDir: path.resolve(process.cwd(), 'server', 'uploads'),
  createParentPath: true,
  limits: { fileSize: 1024 * 1024 * 1024 } // 1GB
}));

// Health check
app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok' });
});

// Conversion routes (JS router wired into TS server)
// eslint-disable-next-line @typescript-eslint/no-var-requires
const converterRouter = require('../routes/converter.js');
app.use(converterRouter);

// Upload endpoint (stores in /server/uploads via express-fileupload)
app.post('/api/upload', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const files = (req as any).files;
    if (!files || !files.file) {
      return res.status(400).json({ error: 'No file uploaded. Expect field name "file".' });
    }

    const uploaded = Array.isArray(files.file) ? files.file : [files.file];
    const targets: string[] = [];

    for (const f of uploaded) {
      const uploadDir = path.resolve(process.cwd(), 'server', 'uploads');
      fs.mkdirSync(uploadDir, { recursive: true });
      const dest = path.join(uploadDir, f.name);
      await f.mv(dest);
      targets.push(dest);
    }

    res.json({ uploaded: targets });
  } catch (err) {
    next(err);
  }
});

// Error handler
app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  console.error('[server] Error:', err?.message || err);
  res.status(500).json({ error: err?.message || 'Internal Server Error' });
});

const PORT = Number(process.env.PORT || 5001);
app.listen(PORT, () => {
  console.log(`[server] listening on port ${PORT}`);
});
