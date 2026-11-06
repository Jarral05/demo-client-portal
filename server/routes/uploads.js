// Private file uploads on a project.
//
// Uploads are where web apps most often get hurt, so this route trusts nothing
// the browser says about the file:
// - the type comes from the file's first bytes, and the name must agree with it
// - size, count per visitor and total storage are all capped
// - downloads go through the same access check as everything else, and are always
//   saved to disk, never opened as a page on this site
import path from 'node:path';
import express, { Router } from 'express';
import { Project, UploadedFile } from '../models.js';
import { audit, findOr404, HttpError } from '../lib/access.js';
import { uploadLimiter } from '../middleware/security.js';
import { config } from '../config.js';

export const uploadRoutes = Router();

// "Magic numbers": every PDF starts with %PDF-, every PNG and JPEG with fixed bytes.
// A renamed .exe or .html file fails here, whatever it's called.
const TYPES = [
  { mime: 'application/pdf', extensions: ['.pdf'], magic: Buffer.from('%PDF-') },
  { mime: 'image/png', extensions: ['.png'], magic: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]) },
  { mime: 'image/jpeg', extensions: ['.jpg', '.jpeg'], magic: Buffer.from([0xff, 0xd8, 0xff]) },
];

export function detectType(data) {
  return TYPES.find((type) => data.subarray(0, type.magic.length).equals(type.magic)) ?? null;
}

// Keeps letters, digits and a few safe marks, drops any folder part, and keeps the
// end of a long name so the extension survives.
export function cleanFileName(raw) {
  let name = '';
  try {
    name = decodeURIComponent(raw ?? '');
  } catch {
    name = '';
  }
  name = path.posix.basename(name.replaceAll('\\', '/'));
  name = name.replace(/[^\w.() -]/g, '_').replace(/^[.\s]+/, '').slice(-100).trim();
  return name || 'file';
}

const WRONG_TYPE = 'Only PDF, PNG and JPG files can be uploaded, and the file must really be one.';

uploadRoutes.post(
  '/projects/:id/uploads',
  uploadLimiter,
  // Reads the raw bytes. Anything over the limit is refused before it's all read.
  express.raw({ type: () => true, limit: config.uploadMaxBytes }),
  async (req, res) => {
    const project = await findOr404(Project, req, req.params.id, 'a project');
    const data = req.body;
    if (!Buffer.isBuffer(data) || data.length === 0) throw new HttpError(400, 'Choose a file first.');

    const fileName = cleanFileName(req.get('x-file-name'));
    const type = detectType(data);
    if (!type || !type.extensions.includes(path.extname(fileName).toLowerCase())) {
      throw new HttpError(415, WRONG_TYPE);
    }

    const { workspaceId } = req.user;
    const [inCopy, [totals]] = await Promise.all([
      UploadedFile.countDocuments({ workspaceId }),
      UploadedFile.aggregate([{ $group: { _id: null, bytes: { $sum: '$size' } } }]),
    ]);
    if (inCopy >= config.uploadsPerCopy) {
      throw new HttpError(409, `This demo keeps ${config.uploadsPerCopy} uploads per visit. Delete one to add another.`);
    }
    if ((totals?.bytes ?? 0) + data.length > config.uploadTotalBytes) {
      throw new HttpError(503, 'The demo has no room for uploads right now. Please try again later.');
    }

    // clientId comes from the project in the database, never from the request.
    const file = await UploadedFile.create({
      workspaceId,
      expiresAt: req.user.expiresAt,
      clientId: project.clientId,
      projectId: project._id,
      fileName,
      mime: type.mime,
      size: data.length,
      data,
      uploadedById: req.user._id,
      uploadedByName: req.user.name,
    });
    await audit(req, 'upload.added', `Uploaded "${fileName}" to ${project.name}`, project.clientId);
    res.status(201).json(file);
  },
);

uploadRoutes.get('/uploads/:id', async (req, res) => {
  const file = await findOr404(UploadedFile, req, req.params.id, 'an uploaded file');
  await audit(req, 'upload.downloaded', `Downloaded "${file.fileName}"`, file.clientId);

  // attachment: the browser saves the file instead of showing it on this site.
  // The sandbox policy is a second lock in case a browser shows it anyway.
  res.set('Content-Security-Policy', "default-src 'none'; sandbox");
  res.attachment(file.fileName);
  res.type(file.mime);
  res.send(file.data);
});

// The person who uploaded a file can delete it, and so can staff.
uploadRoutes.delete('/uploads/:id', async (req, res) => {
  const file = await findOr404(UploadedFile, req, req.params.id, 'an uploaded file');
  const isOwner = String(file.uploadedById) === String(req.user._id);
  if (req.user.role !== 'staff' && !isOwner) {
    await audit(req, 'access.denied', `Tried to delete "${file.fileName}" uploaded by ${file.uploadedByName}`, file.clientId);
    throw new HttpError(403, 'Only the person who uploaded this, or staff, can delete it.');
  }
  await file.deleteOne();
  await audit(req, 'upload.deleted', `Deleted "${file.fileName}"`, file.clientId);
  res.json({ ok: true });
});
