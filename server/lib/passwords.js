// The server's side of the password rules in shared/password.js.
// Used wherever someone chooses a password: sign-up, reset, invitation, profile.
import bcrypt from 'bcryptjs';
import { checkPassword } from '../../shared/password.js';
import { HttpError } from './access.js';

export function checkNewPassword(password, person, field = 'password') {
  const result = checkPassword(password, person);
  if (!result.ok) throw new HttpError(400, result.problem, field);
}

// 10 rounds: slow enough to make guessing expensive, fast enough for a sign-in.
export function hashPassword(password) {
  return bcrypt.hash(password, 10);
}
