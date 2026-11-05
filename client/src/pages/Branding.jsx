import { useEffect, useState } from 'react';
import { api, useApi } from '../api.js';
import { useSession } from '../session.jsx';
import { Loader, PageTitle } from '../components/ui.jsx';
import { STUDIO_URL } from '../links.js';

export function Branding() {
  const { refresh } = useSession();
  const state = useApi('/brand');
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [message, setMessage] = useState({ text: '', error: false });

  useEffect(() => {
    if (state.data) {
      setName(state.data.brand.name);
      setColor(state.data.brand.color);
    }
  }, [state.data]);

  async function handleSubmit(event) {
    event.preventDefault();
    try {
      await api('/brand', { method: 'PUT', body: { name, color } });
      await refresh();
      setMessage({ text: 'Saved. Your clients now see this brand.', error: false });
    } catch (err) {
      setMessage({ text: err.message, error: true });
    }
  }

  return (
    <>
      <PageTitle
        title="Branding"
        intro="The portal carries the agency's name and colour, so clients only ever see the agency."
      />
      <Loader state={state}>
        {({ colors }) => (
          <form className="card stack-small narrow" onSubmit={handleSubmit}>
            <label>
              Agency name
              <input maxLength={40} required value={name} onChange={(event) => setName(event.target.value)} />
            </label>
            <fieldset className="swatches">
              <legend>Colour</legend>
              {colors.map((option) => (
                <label key={option} className="swatch">
                  <input type="radio" name="color" value={option} checked={color === option} onChange={() => setColor(option)} />
                  <span className="swatch-color" style={{ backgroundColor: option }} />
                  <span className="visually-hidden">{option}</span>
                </label>
              ))}
            </fieldset>
            <div><button type="submit" className="button">Save</button></div>
            {message.text && (
              <p className={`notice ${message.error ? 'notice-error' : ''}`} role="status">{message.text}</p>
            )}
          </form>
        )}
      </Loader>
      <p className="muted small">Agencies can have work like this built under their own brand. <a href={STUDIO_URL}>How that works</a>.</p>
    </>
  );
}
