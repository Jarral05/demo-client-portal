// Password rules, shared by the server and the browser.
//
// The browser uses them for the live strength meter. The server uses the same
// rules to refuse bad passwords, because the browser can be bypassed.
//
// The approach follows NIST SP 800-63B (US government guidance):
// - length matters most, so the minimum is 10 characters
// - well-known and easily guessed passwords are refused
// - there are NO rules like "must contain a symbol": they make people pick
//   predictable passwords such as "Password1!"
// A real portal would also check against a full breach list (for example the
// Pwned Passwords service). This demo uses a short hand-picked list instead.

export const MIN_LENGTH = 10;
export const MAX_LENGTH = 200;

// Base words that top the public lists of leaked passwords. "password123" and
// "Welcome2026!" are caught because the check removes digits and symbols first.
const COMMON_WORDS = [
  'password', 'passw0rd', 'qwerty', 'qwertyuiop', 'asdfghjkl', 'zxcvbnm', 'letmein', 'welcome', 'iloveyou',
  'admin', 'administrator', 'login', 'monkey', 'dragon', 'football', 'baseball', 'basketball', 'soccer',
  'sunshine', 'princess', 'superman', 'batman', 'starwars', 'trustno', 'master', 'shadow', 'michael',
  'jennifer', 'charlie', 'computer', 'internet', 'whatever', 'freedom', 'pakistan', 'changeme', 'secret',
  'default', 'abc', 'abcd', 'test', 'tester', 'guest', 'user', 'hello', 'loveyou', 'manchester',
  'liverpool', 'chelsea', 'arsenal', 'playstation', 'pokemon', 'cricket', 'portal', 'demoportal',
];

// Keyboard rows, the alphabet and digits, so "1234567890" or "qwertyuiop" are caught.
const SEQUENCES = ['abcdefghijklmnopqrstuvwxyz', '01234567890', 'qwertyuiopasdfghjklzxcvbnm', '1q2w3e4r5t6y7u8i9o0p'];

function isSequence(value) {
  return SEQUENCES.some((run) => run.includes(value) || [...run].reverse().join('').includes(value));
}

// Words from the person's own name and email address, 3 letters or more. That
// includes the company part of the address, such as "alderfinch", which attackers
// try early. "example" is left out: every address in this demo ends with it.
function personalWords({ name = '', email = '' }) {
  return [...name.split(/\s+/), ...email.split(/[^a-z\d]+/i)]
    .map((word) => word.toLowerCase())
    .filter((word) => word.length >= 3 && word !== 'example');
}

// Returns { score 0-4, label, ok, problem, tips }.
// ok is false only for passwords the server refuses. A "Weak" password is still
// allowed, but the meter suggests how to make it stronger.
export function checkPassword(password, person = {}) {
  const value = password ?? '';
  const lower = value.toLowerCase();
  const core = lower.replace(/[^a-z]/g, '');
  const tips = [];

  let problem = '';
  if (value.length < MIN_LENGTH) {
    problem = `Use at least ${MIN_LENGTH} characters. You have ${value.length}.`;
  } else if (value.length > MAX_LENGTH) {
    problem = `Keep it under ${MAX_LENGTH} characters.`;
  } else if (/^(.)\1+$/.test(value) || isSequence(lower)) {
    problem = 'That pattern is one of the first things attackers try. Pick something less predictable.';
  } else if (COMMON_WORDS.includes(core) || COMMON_WORDS.includes(lower)) {
    problem = 'That is one of the most common passwords, even with numbers added. Pick something less predictable.';
  } else if (personalWords(person).some((word) => lower.includes(word))) {
    problem = "Don't use your name or email address in your password.";
  }

  if (problem) return { score: 0, label: 'Too weak', ok: false, problem, tips: [] };

  // What's left is a matter of degree: longer and more varied is stronger.
  let score = 1;
  if (value.length >= 14) score += 1;
  if (value.length >= 18) score += 1;
  const kinds = [/[a-z]/, /[A-Z]/, /\d/, /[^a-zA-Z\d]/].filter((kind) => kind.test(value)).length;
  if (kinds >= 3) score += 1;
  score = Math.min(score, 4);

  if (value.length < 14) tips.push('Longer is stronger: try 3 or 4 random words, like "river-candle-orbit-mango".');
  if (kinds < 3 && value.length < 18) tips.push('Mixing in capitals, numbers or symbols helps if you keep it short.');

  const label = ['Too weak', 'Weak', 'Okay', 'Strong', 'Very strong'][score];
  return { score, label, ok: true, problem: '', tips };
}
