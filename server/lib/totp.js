// The 6-digit codes that authenticator apps show (TOTP, RFC 6238).
//
// The app and the server share one secret. Every 30 seconds both work out
// HMAC(secret, number of 30-second steps since 1970) and shorten it to 6 digits.
// Same secret and same clock give the same code, with nothing sent between them.
// The tests check this file against the official RFC test values.
import { createHmac, randomBytes, randomInt } from 'node:crypto';

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;

// Authenticator apps expect the secret in base32: letters and 2-7 only.
export function base32Encode(buffer) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of text.replace(/=+$/, '').toUpperCase()) {
    const index = ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Not base32');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

// One code for one counter value (HOTP, RFC 4226).
export function hotp(key, counter, digits = 6) {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const hash = createHmac('sha1', key).update(message).digest();
  // "Dynamic truncation": the last 4 bits pick where to read 4 bytes from.
  const offset = hash[hash.length - 1] & 0xf;
  const number = (hash.readUInt32BE(offset) & 0x7fffffff) % 10 ** digits;
  return String(number).padStart(digits, '0');
}

export function stepAt(timeMs) {
  return Math.floor(timeMs / 1000 / STEP_SECONDS);
}

// 20 random bytes, the size the RFC recommends for SHA-1.
export function newTotpSecret() {
  return base32Encode(randomBytes(20));
}

// Checks a code against the current step and one step either side, because
// phone clocks drift and people type slowly. Returns the matching step, or null.
// Steps at or before lastStep are refused, so an overheard code can't be used twice.
export function verifyTotp(secret, code, { lastStep = 0, timeMs = Date.now() } = {}) {
  const key = base32Decode(secret);
  const now = stepAt(timeMs);
  for (const step of [now - 1, now, now + 1]) {
    if (step > lastStep && hotp(key, step) === code) return step;
  }
  return null;
}

// What the QR code holds. Authenticator apps read the issuer and account to label the entry.
export function otpauthUrl({ secret, issuer, account }) {
  const label = encodeURIComponent(`${issuer}:${account}`);
  const params = new URLSearchParams({ secret, issuer, algorithm: 'SHA1', digits: '6', period: String(STEP_SECONDS) });
  return `otpauth://totp/${label}?${params}`;
}

// Recovery codes for a lost phone. No 0/o or 1/l, so they're easy to read back.
const RECOVERY_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';

export function newRecoveryCodes(count = 8) {
  const pick = () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return Array.from({ length: count }, () => {
    const chars = Array.from({ length: 10 }, pick).join('');
    return `${chars.slice(0, 5)}-${chars.slice(5)}`;
  });
}
