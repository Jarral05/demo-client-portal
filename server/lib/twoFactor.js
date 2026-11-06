// Checks the second step: a code from the authenticator app, or a recovery code.
import { User } from '../models.js';
import { hashToken } from './tokens.js';
import { verifyTotp } from './totp.js';

// Returns 'app' or 'recovery' when the code is right, otherwise null.
//
// Both updates only succeed if the code is still unused, and MongoDB applies each
// one in a single step. So two requests racing with the same code can't both pass.
export async function checkSecondFactor(user, code) {
  if (/^\d{6}$/.test(code)) {
    const step = verifyTotp(user.totpSecret, code, { lastStep: user.totpLastStep ?? 0 });
    if (step === null) return null;
    const result = await User.updateOne(
      { _id: user._id, totpLastStep: { $lt: step } },
      { $set: { totpLastStep: step } },
    );
    return result.modifiedCount === 1 ? 'app' : null;
  }

  // Each recovery code works once: a match removes it.
  const hash = hashToken(code);
  const result = await User.updateOne(
    { _id: user._id, recoveryCodeHashes: hash },
    { $pull: { recoveryCodeHashes: hash } },
  );
  return result.modifiedCount === 1 ? 'recovery' : null;
}
