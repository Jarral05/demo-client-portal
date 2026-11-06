// The signed-in person's own security settings: two-step sign-in.
import { Router } from 'express';
import QRCode from 'qrcode';
import { User, Workspace } from '../models.js';
import { audit, HttpError } from '../lib/access.js';
import { hashToken } from '../lib/tokens.js';
import { checkSecondFactor } from '../lib/twoFactor.js';
import { newRecoveryCodes, newTotpSecret, otpauthUrl, verifyTotp } from '../lib/totp.js';
import { parse, secondFactorBody, totpCodeBody } from '../lib/validate.js';
import { loginLimiter } from '../middleware/security.js';

export const accountRoutes = Router();

accountRoutes.get('/account/security', (req, res) => {
  res.json({
    twoFactor: req.user.totpEnabled,
    recoveryCodesLeft: req.user.recoveryCodeHashes?.length ?? 0,
  });
});

// Step 1: a new secret, shown as a QR code. Nothing is switched on yet.
accountRoutes.post('/account/two-factor/setup', async (req, res) => {
  if (req.user.totpEnabled) throw new HttpError(409, 'Two-step sign-in is already on.');

  const secret = newTotpSecret();
  req.user.totpPendingSecret = secret;
  await req.user.save();

  const workspace = await Workspace.findById(req.user.workspaceId);
  const url = otpauthUrl({ secret, issuer: `${workspace.brand.name} demo`, account: req.user.email });
  // A data: image, which the Content Security Policy allows. No outside QR service sees the secret.
  const qr = await QRCode.toDataURL(url, { margin: 1, width: 220 });
  res.json({ secret, qr });
});

// Step 2: switched on only after a real code proves the app was set up correctly.
// Otherwise a mistyped secret would lock the person out.
accountRoutes.post('/account/two-factor/enable', loginLimiter, async (req, res) => {
  const { code } = parse(totpCodeBody, req.body);
  const secret = req.user.totpPendingSecret;
  if (!secret) throw new HttpError(400, 'Start again: scan a new QR code first.');

  const step = verifyTotp(secret, code);
  if (step === null) throw new HttpError(400, 'That code is not right. Check the time on your phone, and use the newest code.');

  const recoveryCodes = newRecoveryCodes();
  await User.updateOne(
    { _id: req.user._id },
    {
      $set: {
        totpEnabled: true,
        totpSecret: secret,
        totpLastStep: step,
        recoveryCodeHashes: recoveryCodes.map(hashToken),
      },
      $unset: { totpPendingSecret: 1 },
    },
  );
  await audit(req, 'auth.two_factor_on', 'Turned on two-step sign-in');
  // Shown once. Only their hashes are kept.
  res.json({ recoveryCodes });
});

// Turning it off needs a code too, so someone at an unlocked computer can't do it.
accountRoutes.post('/account/two-factor/disable', loginLimiter, async (req, res) => {
  const { code } = parse(secondFactorBody, req.body);
  if (!req.user.totpEnabled) throw new HttpError(409, 'Two-step sign-in is already off.');
  if (!(await checkSecondFactor(req.user, code))) throw new HttpError(400, 'That code is not right.');

  await User.updateOne(
    { _id: req.user._id },
    {
      $set: { totpEnabled: false, totpLastStep: 0 },
      $unset: { totpSecret: 1, totpPendingSecret: 1, recoveryCodeHashes: 1 },
    },
  );
  await audit(req, 'auth.two_factor_off', 'Turned off two-step sign-in');
  res.json({ ok: true });
});
