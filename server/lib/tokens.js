// One-time links: password resets and invitations.
//
// The link carries a long random token. The database keeps only its SHA-256 hash,
// so someone who reads the database still can't use a link. A plain hash is enough
// here, unlike passwords: 32 random bytes can't be guessed, however fast the guessing.
import { createHash, randomBytes } from 'node:crypto';

export function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

export function newToken() {
  const token = randomBytes(32).toString('hex');
  return { token, hash: hashToken(token) };
}
