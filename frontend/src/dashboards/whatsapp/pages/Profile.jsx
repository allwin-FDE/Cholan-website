import { useEffect, useRef, useState } from 'react';
import { useDash } from '../../shared/context.js';
import { Card, Icon, Loading, PageHead } from '../../shared/ui.jsx';
import { wa } from '../api.js';
import { useWa } from '../shared.jsx';

// The business profile customers see when they open the number's info in
// WhatsApp: picture, About, description, address, email, websites and
// category. Admins change it here (it goes straight to Meta); everyone else
// sees it. The display name is changed in WhatsApp Manager, with Meta's review.
const LIMITS = { about: 139, description: 512, address: 256, email: 128 };

export default function Profile() {
  const { allowed } = useDash();
  const { status } = useWa();
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ busy: '', message: '', tone: '' });
  const [loadError, setLoadError] = useState('');
  const fileRef = useRef(null);
  const canEdit = allowed('admin');
  const ready = status?.connection?.ready;

  const load = () =>
    wa
      .profile()
      .then((d) => {
        setData(d);
        setForm(d.profile);
        setLoadError('');
      })
      .catch((e) => setLoadError(e.message));
  useEffect(() => {
    if (ready) load();
  }, [ready]);

  if (!status) return <div className="dash-page"><Loading /></div>;
  if (!ready) {
    return (
      <div className="dash-page">
        <PageHead title="Business profile" range={false} />
        <div className="dash-error">WhatsApp isn’t connected yet, so the profile can’t be read. See Settings.</div>
      </div>
    );
  }

  const set = (field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => ({ ...e, [field]: undefined }));
    setState({ busy: '', message: '', tone: '' });
  };
  const changed = data && form && JSON.stringify(form) !== JSON.stringify(data.profile);

  const save = async (event) => {
    event.preventDefault();
    setState({ busy: 'save', message: '', tone: '' });
    setErrors({});
    try {
      const { pictureUrl: _p, ...fields } = form;
      const d = await wa.saveProfile(fields);
      setData((x) => ({ ...x, profile: d.profile }));
      setForm(d.profile);
      setState({ busy: '', message: 'Saved. Customers see the new profile now (WhatsApp may take a few minutes to refresh it on their phones).', tone: 'good' });
    } catch (e) {
      if (e.fields) setErrors(e.fields);
      setState({ busy: '', message: e.message, tone: 'bad' });
    }
  };

  const pickPicture = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png'].includes(file.type)) return setState({ busy: '', message: 'Choose a JPG or PNG picture.', tone: 'bad' });
    if (file.size > 5 * 1024 * 1024) return setState({ busy: '', message: 'The picture must be 5 MB or smaller.', tone: 'bad' });
    const size = await imageSize(file).catch(() => null);
    if (size && (size.w < 192 || size.h < 192)) return setState({ busy: '', message: `The picture is ${size.w} × ${size.h} pixels; WhatsApp needs at least 192 × 192 (640 × 640 square is best).`, tone: 'bad' });
    setState({ busy: 'picture', message: '', tone: '' });
    try {
      const d = await wa.uploadProfilePicture(file);
      setData((x) => ({ ...x, profile: { ...x.profile, pictureUrl: d.profile.pictureUrl } }));
      setForm((f) => ({ ...f, pictureUrl: d.profile.pictureUrl }));
      setState({ busy: '', message: 'Picture changed.', tone: 'good' });
    } catch (e) {
      setState({ busy: '', message: e.message, tone: 'bad' });
    }
  };

  const phone = status.phone || {};
  const vertical = data?.verticals?.find(([k]) => k === form?.vertical)?.[1] || '';

  return (
    <div className="dash-page">
      <PageHead
        title="Business profile"
        intro="What customers see when they open your WhatsApp number’s info. Changes go straight to WhatsApp."
        range={false}
        actions={
          <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={load}>
            <Icon name="refresh" /> Reload
          </button>
        }
      />
      {loadError && <div className="dash-error">{loadError}</div>}
      {!form && !loadError && <Loading />}
      {form && (
        <div className="wa-profile">
          <form className="wa-profile__form" onSubmit={save}>
            <Card title="Picture and name">
              <div className="wa-profile__pic">
                <div className="wa-profile__avatar">{form.pictureUrl ? <img src={form.pictureUrl} alt="Current WhatsApp profile picture" /> : <Icon name="image" />}</div>
                <div>
                  {canEdit && (
                    <>
                      <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => fileRef.current?.click()} disabled={Boolean(state.busy) || !data?.canUploadPicture}>
                        <Icon name="image" /> {state.busy === 'picture' ? 'Uploading…' : 'Change picture'}
                      </button>
                      <input ref={fileRef} type="file" accept="image/jpeg,image/png" hidden onChange={pickPicture} />
                    </>
                  )}
                  <p className="dash-muted dash-small">Square JPG or PNG, at least 192 × 192 (640 × 640 is best), up to 5 MB. WhatsApp shows it in a circle.</p>
                </div>
              </div>
              <dl className="dash-facts">
                <div>
                  <dt>Display name</dt>
                  <dd>
                    {phone.verified_name || '—'}
                    {phone.name_status && <span className="dash-muted dash-small"> ({String(phone.name_status).toLowerCase().replace(/_/g, ' ')})</span>}
                    <small className="dash-muted dash-block">
                      The name is changed in{' '}
                      <a href="https://business.facebook.com/wa/manage/phone-numbers/" target="_blank" rel="noopener">
                        WhatsApp Manager
                      </a>{' '}
                      → Phone numbers → the number → Profile → Display name. Meta reviews every new name.
                    </small>
                  </dd>
                </div>
                <div>
                  <dt>Number</dt>
                  <dd>{phone.display_phone_number || '—'}</dd>
                </div>
              </dl>
            </Card>

            <Card title="About and details">
              <div className="biz-form">
                <Field label="About" hint="One line under your name, e.g. “Pure goodness, always.”" count={form.about.length} max={LIMITS.about} error={errors.about} wide>
                  <input value={form.about} onChange={(e) => set('about', e.target.value)} maxLength={LIMITS.about} disabled={!canEdit} required />
                </Field>
                <Field label="Description" hint="What you sell and how people can buy." count={form.description.length} max={LIMITS.description} error={errors.description} wide>
                  <textarea className="dash-textarea" rows={4} value={form.description} onChange={(e) => set('description', e.target.value)} maxLength={LIMITS.description} disabled={!canEdit} />
                </Field>
                <Field label="Address" count={form.address.length} max={LIMITS.address} error={errors.address} wide>
                  <textarea className="dash-textarea" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} maxLength={LIMITS.address} disabled={!canEdit} />
                </Field>
                <Field label="Email" error={errors.email}>
                  <input type="email" value={form.email} onChange={(e) => set('email', e.target.value)} maxLength={LIMITS.email} disabled={!canEdit} />
                </Field>
                <Field label="Category" error={errors.vertical}>
                  <select value={form.vertical} onChange={(e) => set('vertical', e.target.value)} disabled={!canEdit}>
                    <option value="">Not set</option>
                    {(data?.verticals || []).map(([k, label]) => (
                      <option key={k} value={k}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Website 1" error={errors.websites}>
                  <input value={form.websites[0]} onChange={(e) => set('websites', [e.target.value, form.websites[1]])} placeholder="https://www.cholanrice.in" disabled={!canEdit} />
                </Field>
                <Field label="Website 2">
                  <input value={form.websites[1]} onChange={(e) => set('websites', [form.websites[0], e.target.value])} placeholder="Optional" disabled={!canEdit} />
                </Field>
              </div>
              {canEdit ? (
                <div className="wa-profile__save">
                  <button type="submit" className="dash-btn" disabled={!changed || Boolean(state.busy)}>
                    {state.busy === 'save' ? 'Saving…' : 'Save profile'}
                  </button>
                  {changed && (
                    <button type="button" className="dash-btn dash-btn--ghost" onClick={() => (setForm(data.profile), setErrors({}))} disabled={Boolean(state.busy)}>
                      Undo changes
                    </button>
                  )}
                </div>
              ) : (
                <p className="dash-muted dash-small">Only admins can change the profile.</p>
              )}
              {state.message && <p className={`dash-small wa-profile__msg wa-profile__msg--${state.tone}`} role={state.tone === 'bad' ? 'alert' : 'status'}>{state.message}</p>}
            </Card>
          </form>

          <aside className="wa-profile__preview" aria-label="How it looks in WhatsApp">
            <p className="dash-muted dash-small">How it looks in WhatsApp</p>
            <div className="wa-prof-card">
              <div className="wa-prof-card__avatar">{form.pictureUrl ? <img src={form.pictureUrl} alt="" /> : <Icon name="user" />}</div>
              <strong className="wa-prof-card__name">{phone.verified_name || 'Your business'}</strong>
              <span className="wa-prof-card__num">{phone.display_phone_number}</span>
              {form.about && <p className="wa-prof-card__about">{form.about}</p>}
              <ul className="wa-prof-card__rows">
                {form.description && <li>{form.description}</li>}
                {vertical && <li><span>Category</span>{vertical}</li>}
                {form.address && <li><span>Address</span>{form.address}</li>}
                {form.email && <li><span>Email</span>{form.email}</li>}
                {form.websites.filter(Boolean).map((w) => (
                  <li key={w}><span>Website</span>{w}</li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, count, max, error, wide, children }) {
  return (
    <label className={`dash-field${wide ? ' biz-wide' : ''}`}>
      <span className="dash-field__label">
        {label}
        {max != null && <span className={`wa-profile__count${count > max ? ' is-over' : ''}`}>{count}/{max}</span>}
      </span>
      {children}
      {hint && !error && <small className="dash-muted">{hint}</small>}
      {error && <small className="wa-profile__error">{error}</small>}
    </label>
  );
}

// The picture's size in pixels, read in the browser before uploading.
function imageSize(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('unreadable'));
    };
    img.src = url;
  });
}
