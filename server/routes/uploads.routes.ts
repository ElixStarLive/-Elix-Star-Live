import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { config } from '../config.js';
import { authMiddleware } from '../http/authMiddleware.js';

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

export const uploadsRouter = Router();

uploadsRouter.post('/uploads', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!config.BUNNY_API_KEY || !config.BUNNY_STORAGE_ZONE) {
    return res.status(503).json({ code: 'not_configured', message: 'Bunny Storage is not configured.' });
  }

  const file = req.file;
  if (!file) {
    return res.status(400).json({ code: 'invalid_request', message: 'No file uploaded.' });
  }

  const region = config.BUNNY_REGION ?? 'ny';
  const path = `${crypto.randomUUID()}-${file.originalname.replace(/[^a-zA-Z0-9.]/g, '_')}`;
  const uploadUrl = `https://${region}.storage.bunnycdn.com/${config.BUNNY_STORAGE_ZONE}/${path}`;

  const response = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      AccessKey: config.BUNNY_API_KEY,
      'Content-Type': file.mimetype,
    },
    body: file.buffer,
  });

  if (!response.ok) {
    const text = await response.text();
    return res.status(502).json({ code: 'storage_error', message: `Bunny upload failed: ${text}` });
  }

  const cdnHost = `${config.BUNNY_STORAGE_ZONE}.b-cdn.net`;
  const publicUrl = `https://${cdnHost}/${path}`;

  return res.json({
    url: publicUrl,
    path,
  });
});
