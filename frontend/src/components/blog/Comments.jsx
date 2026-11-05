import { useState } from 'react';
import { sendComment } from '../../lib/api.js';
import { Stars, postDate } from './PostMain.jsx';

// The approved comments under a post, and the form to leave one. A comment
// waits for approval in the dashboard before it shows here.
export default function Comments({ slug, data, isRecipe }) {
  const [form, setForm] = useState({ name: '', email: '', text: '', rating: 0, website: '' });
  const [hover, setHover] = useState(0);
  const [status, setStatus] = useState({ state: 'idle' }); // idle | sending | sent | error
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });

  const submit = async (e) => {
    e.preventDefault();
    setStatus({ state: 'sending' });
    try {
      await sendComment(slug, form);
      setStatus({ state: 'sent' });
      setForm({ name: '', email: '', text: '', rating: 0, website: '' });
    } catch (error) {
      setStatus({ state: 'error', message: error.message, fields: error.fields || {} });
    }
  };
  const fieldError = (key) => status.state === 'error' && status.fields?.[key];
  const comments = data?.comments || [];

  return (
    <section className="comments" id="comments">
      {comments.length > 0 && (
        <>
          <h2>
            {comments.length} {comments.length === 1 ? 'comment' : 'comments'}
          </h2>
          <ul className="comments__list">
            {comments.map((c) => (
              <li key={c.id}>
                <span className="comments__avatar" aria-hidden="true">
                  {c.name.charAt(0).toUpperCase()}
                </span>
                <div>
                  <strong>{c.name}</strong> <small>{postDate(c.createdAt)}</small>
                  {c.rating && <Stars value={c.rating} />}
                  <p>{c.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Leave a reply</h2>
      {status.state === 'sent' ? (
        <p className="comments__sent" role="status">
          Thank you! Your comment will appear here once it has been approved.
        </p>
      ) : (
        <form className="comments__form" onSubmit={submit}>
          <p className="comments__note">Your email address will not be published.</p>
          <fieldset className="comments__rating" onMouseLeave={() => setHover(0)}>
            <legend>{isRecipe ? 'Rate this recipe' : 'Your rating'} (optional)</legend>
            {[1, 2, 3, 4, 5].map((n) => (
              <button
                key={n}
                type="button"
                className={n <= (hover || form.rating) ? 'is-on' : ''}
                onMouseEnter={() => setHover(n)}
                onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })}
                aria-label={`${n} out of 5`}
                aria-pressed={form.rating === n}
              >
                ★
              </button>
            ))}
          </fieldset>
          <div className="comments__row">
            <label>
              Your name
              <input required maxLength={80} autoComplete="name" value={form.name} onChange={set('name')} />
              {fieldError('name') && <span className="comments__error">{fieldError('name')}</span>}
            </label>
            <label>
              Email address
              <input required type="email" maxLength={160} autoComplete="email" value={form.email} onChange={set('email')} />
              {fieldError('email') && <span className="comments__error">{fieldError('email')}</span>}
            </label>
          </div>
          {/* Hidden from people; only robots fill this in. */}
          <label className="comments__trap" aria-hidden="true">
            Website
            <input tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} />
          </label>
          <label>
            Your comment
            <textarea required rows={5} maxLength={1500} value={form.text} onChange={set('text')} />
            {fieldError('text') && <span className="comments__error">{fieldError('text')}</span>}
          </label>
          {status.state === 'error' && (
            <p className="comments__error" role="alert">
              {status.message}
            </p>
          )}
          <button type="submit" className="btn btn--primary" disabled={status.state === 'sending'}>
            {status.state === 'sending' ? 'Sending…' : 'Post comment'}
          </button>
        </form>
      )}
    </section>
  );
}
