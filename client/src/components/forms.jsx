// Form pieces used on the sign-in, sign-up, reset, invitation and profile pages.
import { useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { checkPassword } from '../../../shared/password.js';

// A labelled box with its error message underneath.
// aria-invalid and aria-describedby let screen readers announce the error with the box.
export function Field({ label, error, hint, children }) {
  const id = useId();
  const messageId = `${id}-message`;
  const describedBy = error || hint ? messageId : undefined;
  return (
    <div className={`field${error ? ' field-error' : ''}`}>
      <label htmlFor={id}>{label}</label>
      {children({ id, 'aria-invalid': error ? true : undefined, 'aria-describedby': describedBy })}
      {error && <p id={messageId} className="field-message" role="alert">{error}</p>}
      {!error && hint && <p id={messageId} className="field-hint">{hint}</p>}
    </div>
  );
}

// A password box with a Show/Hide button.
// The button only changes what the browser displays. The password is never sent anywhere else.
export function PasswordInput({ value, onChange, autoComplete, ...rest }) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="password-box">
      <input
        {...rest}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        // Phones would otherwise "correct" a visible password.
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
      />
      <button
        type="button"
        className="password-toggle"
        aria-pressed={visible}
        aria-label={visible ? 'Hide password' : 'Show password'}
        onClick={() => setVisible((shown) => !shown)}
      >
        {visible ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        <span>{visible ? 'Hide' : 'Show'}</span>
      </button>
    </div>
  );
}

// The live strength meter. It uses exactly the rules the server uses (shared/password.js),
// so "Okay" here can never be refused there.
export function StrengthMeter({ password, person }) {
  if (!password) return null;
  const { score, label, problem, tips } = checkPassword(password, person);
  return (
    <div className={`strength strength-${score}`} aria-live="polite">
      <div className="strength-bars" aria-hidden="true">
        {[1, 2, 3, 4].map((step) => <span key={step} className={step <= Math.max(score, 1) ? 'on' : ''} />)}
      </div>
      <p className="strength-label">Strength: <strong>{label}</strong></p>
      {problem && <p className="strength-tip">{problem}</p>}
      {!problem && tips[0] && <p className="strength-tip">{tips[0]}</p>}
    </div>
  );
}

// Splits a server error into "belongs to this box" and "general".
export function errorFor(error, field) {
  return error?.field === field ? error.message : '';
}

export function generalError(error, fields) {
  return error && !fields.includes(error.field) ? error.message : '';
}
