import { createContext, useContext } from 'react';
import { Badge } from '../shared/ui.jsx';

// Shared by the /whatsapp pages: the status loaded once by the shell (the
// connection, languages, automation triggers), template helpers that match
// the server's (backend lib/whatsapp/templates.js), the phone preview and the
// editor that says where each variable's value comes from.

export const WaContext = createContext({ status: null, reloadStatus: () => {} });
export const useWa = () => useContext(WaContext);

export const STATUS_TONE = { DRAFT: 'info', APPROVED: 'good', PENDING: 'warn', IN_APPEAL: 'warn', PAUSED: 'warn', REJECTED: 'bad', DISABLED: 'bad', DELETED: 'muted' };
export const TemplateStatus = ({ status }) => <Badge tone={STATUS_TONE[status] || 'neutral'}>{String(status || '').toLowerCase().replace(/_/g, ' ') || 'unknown'}</Badge>;
export const CATEGORY = { MARKETING: 'Marketing', UTILITY: 'Utility', AUTHENTICATION: 'Authentication' };

export const variablesIn = (text = '') => [...String(text).matchAll(/\{\{\s*(\d+)\s*\}\}/g)].map((m) => Number(m[1]));

// What a template needs filled in to send (same as the server's slotsOf).
export function slotsOf(t) {
  const comps = t?.components || [];
  const header = comps.find((c) => c.type === 'HEADER');
  const body = comps.find((c) => c.type === 'BODY');
  const buttons = comps.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const auth = t?.category === 'AUTHENTICATION';
  return {
    auth,
    header: !header ? null : header.format === 'TEXT' ? (variablesIn(header.text).length ? { kind: 'text' } : null) : { kind: header.format.toLowerCase() },
    body: auth ? 1 : new Set(variablesIn(body?.text)).size,
    buttons: buttons
      .map((b, index) => {
        if (b.type === 'URL' && variablesIn(b.url).length) return { index, kind: 'url', text: b.text };
        if (b.type === 'COPY_CODE') return { index, kind: 'copy_code', text: 'Copy code' };
        if (b.type === 'OTP') return { index, kind: 'otp', text: b.text };
        return null;
      })
      .filter(Boolean),
  };
}

// The form of the template builder as Meta's components, for the preview
// (the server builds and checks the real thing).
export function componentsFromForm(f) {
  if (f.category === 'AUTHENTICATION') {
    return [
      { type: 'BODY', text: `{{1}} is your verification code.${f.auth?.securityNote !== false ? ' For your security, do not share this code.' : ''}` },
      ...(f.auth?.expiresMinutes ? [{ type: 'FOOTER', text: `This code expires in ${f.auth.expiresMinutes} minutes.` }] : []),
      { type: 'BUTTONS', buttons: [{ type: 'OTP', text: f.auth?.buttonText || 'Copy code' }] },
    ];
  }
  const out = [];
  if (f.header?.type === 'text' && f.header.text) out.push({ type: 'HEADER', format: 'TEXT', text: f.header.text });
  else if (['image', 'video', 'document'].includes(f.header?.type)) out.push({ type: 'HEADER', format: f.header.type.toUpperCase(), previewUrl: f.header.previewUrl });
  out.push({ type: 'BODY', text: f.body?.text || '' });
  if (f.footer?.text) out.push({ type: 'FOOTER', text: f.footer.text });
  const buttons = (f.buttons || []).map((b) => ({ type: { quick_reply: 'QUICK_REPLY', url: 'URL', phone: 'PHONE_NUMBER', copy_code: 'COPY_CODE' }[b.type], text: b.type === 'copy_code' ? 'Copy offer code' : b.text, url: b.url }));
  if (buttons.length) out.push({ type: 'BUTTONS', buttons });
  return out;
}

// WhatsApp's own formatting: *bold*, _italic_, ~strike~, ```mono```.
function formatted(text) {
  const parts = [];
  const re = /(\*[^*\n]+\*|_[^_\n]+_|~[^~\n]+~|```[^`]+```)/g;
  let last = 0;
  let m;
  let k = 0;
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    const s = m[0];
    if (s.startsWith('```')) parts.push(<code key={k++}>{s.slice(3, -3)}</code>);
    else if (s[0] === '*') parts.push(<strong key={k++}>{s.slice(1, -1)}</strong>);
    else if (s[0] === '_') parts.push(<em key={k++}>{s.slice(1, -1)}</em>);
    else parts.push(<s key={k++}>{s.slice(1, -1)}</s>);
    last = m.index + s.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
const fill = (text, list) => String(text || '').replace(/\{\{\s*(\d+)\s*\}\}/g, (all, n) => (list?.[Number(n) - 1] ? list[Number(n) - 1] : all));

// A message as it looks in WhatsApp. `values` fills the variables
// ({ header, body: [] }); without them the {{n}} show.
export function PhonePreview({ components = [], values = {}, title = 'Cholan Rice' }) {
  const header = components.find((c) => c.type === 'HEADER');
  const body = components.find((c) => c.type === 'BODY');
  const footer = components.find((c) => c.type === 'FOOTER');
  const buttons = components.find((c) => c.type === 'BUTTONS')?.buttons || [];
  const media = header && header.format !== 'TEXT' ? header.format : null;
  return (
    <div className="wa-phone" aria-label="Preview">
      <div className="wa-phone__bar">
        <span className="wa-phone__avatar">
          <img src="/images/cholan-logo.png" alt="" />
        </span>
        <span>
          <strong>
            {title}{' '}
            <svg className="wa-verified" viewBox="0 0 24 24" aria-label="Verified business">
              <path d="M12 2l2.4 2.1 3.2-.3.9 3.1 2.8 1.6-1.1 3 1.1 3-2.8 1.6-.9 3.1-3.2-.3L12 22l-2.4-2.1-3.2.3-.9-3.1-2.8-1.6 1.1-3-1.1-3 2.8-1.6.9-3.1 3.2.3z" />
              <path d="M8.5 12.2l2.3 2.3 4.7-4.8" fill="none" />
            </svg>
          </strong>
          <small>Business account</small>
        </span>
      </div>
      <div className="wa-phone__chat">
        <div className="wa-bubble">
          {media && (
            <div className={`wa-bubble__media wa-bubble__media--${media.toLowerCase()}`}>
              {media === 'IMAGE' && (values.headerLink || header.previewUrl) ? <img src={values.headerLink || header.previewUrl} alt="" /> : <span>{media === 'IMAGE' ? '🖼 Image' : media === 'VIDEO' ? '▶ Video' : '📄 Document'}</span>}
            </div>
          )}
          {header?.format === 'TEXT' && <p className="wa-bubble__head">{fill(header.text, values.header ? [values.header] : [])}</p>}
          <p className="wa-bubble__body">{body?.text ? formatted(fill(body.text, values.body)) : <span className="wa-faint">Your message shows here.</span>}</p>
          {footer?.text && <p className="wa-bubble__foot">{footer.text}</p>}
          <span className="wa-bubble__time">10:24</span>
        </div>
        {buttons.map((b, i) => (
          <div key={i} className="wa-bubble__button">
            {b.type === 'URL' ? '↗ ' : b.type === 'PHONE_NUMBER' ? '📞 ' : b.type === 'COPY_CODE' || b.type === 'OTP' ? '⧉ ' : '↩ '}
            {b.text || (b.type === 'COPY_CODE' ? 'Copy offer code' : 'Button')}
          </div>
        ))}
      </div>
    </div>
  );
}

export const FIELDS = { first_name: 'First name', name: 'Full name', phone: 'Phone number' };

// Where one value comes from: typed (the same for everyone), or one of the
// contact's details with a fallback when it's empty.
function ValueSource({ label, value = { source: 'static', value: '' }, onChange, fields }) {
  return (
    <div className="wa-map">
      <span className="wa-map__label">{label}</span>
      <select value={value.source === 'field' ? value.field : '__static'} onChange={(e) => onChange(e.target.value === '__static' ? { source: 'static', value: value.value || '' } : { source: 'field', field: e.target.value, fallback: value.fallback || '' })} aria-label={`${label}: where from`}>
        <option value="__static">Type a value</option>
        {Object.entries(fields).map(([k, l]) => (
          <option key={k} value={k}>
            Contact: {l}
          </option>
        ))}
      </select>
      {value.source === 'field' ? (
        <input value={value.fallback || ''} onChange={(e) => onChange({ ...value, fallback: e.target.value })} placeholder="If empty, use…" aria-label={`${label}: fallback`} />
      ) : (
        <input value={value.value || ''} onChange={(e) => onChange({ ...value, value: e.target.value })} placeholder="Value" aria-label={`${label}: value`} />
      )}
    </div>
  );
}

// The editor for all of a template's values. `extraFields` adds the
// contact details from imports (city, product…) or an event's details.
export function ValueMapper({ template, mapping, onChange, extraFields = {}, onUpload }) {
  const slots = slotsOf(template);
  const fields = { ...FIELDS, ...extraFields };
  const set = (patch) => onChange({ ...mapping, ...patch });
  if (!template) return null;
  const none = !slots.header && !slots.body && !slots.buttons.length;
  return (
    <div className="wa-maps">
      {none && <p className="dash-muted dash-small">This template has nothing to fill in: it goes as written.</p>}
      {slots.header?.kind === 'text' && <ValueSource label="Header {{1}}" value={mapping.header} onChange={(v) => set({ header: v })} fields={fields} />}
      {slots.header && slots.header.kind !== 'text' && (
        <div className="wa-map">
          <span className="wa-map__label">Header {slots.header.kind}</span>
          <input value={mapping.headerLink || ''} onChange={(e) => set({ headerLink: e.target.value })} placeholder="https://… link to the file" aria-label="Header file link" />
          {onUpload && (
            <label className="dash-btn dash-btn--ghost dash-btn--sm" style={{ cursor: 'pointer' }}>
              Upload
              <input
                type="file"
                hidden
                accept={slots.header.kind === 'image' ? 'image/jpeg,image/png' : slots.header.kind === 'video' ? 'video/mp4' : 'application/pdf'}
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  e.target.value = '';
                  if (file) set({ headerLink: await onUpload(file), ...(slots.header.kind === 'document' ? { headerFilename: file.name } : {}) });
                }}
              />
            </label>
          )}
        </div>
      )}
      {Array.from({ length: slots.body }, (_, i) => (
        <ValueSource
          key={i}
          label={slots.auth ? 'The code' : `Message {{${i + 1}}}`}
          value={mapping.body?.[i]}
          onChange={(v) => {
            const body = [...(mapping.body || [])];
            body[i] = v;
            set({ body });
          }}
          fields={fields}
        />
      ))}
      {!slots.auth &&
        slots.buttons.map((b) => (
          <ValueSource key={b.index} label={b.kind === 'url' ? `“${b.text}” link end` : 'Offer code'} value={mapping.buttons?.[b.index]} onChange={(v) => set({ buttons: { ...(mapping.buttons || {}), [b.index]: v } })} fields={fields} />
        ))}
    </div>
  );
}

// The values for the preview, from a mapping (fields show as their name).
export function previewValues(template, mapping = {}, contact = { name: 'Lakshmi Ramesh' }) {
  const slots = slotsOf(template);
  const one = (m) => {
    if (!m) return '';
    if (m.source === 'field') {
      const v = m.field === 'first_name' ? String(contact.name || '').split(' ')[0] : m.field === 'name' ? contact.name : contact.attributes?.[m.field];
      return v || m.fallback || `[${FIELDS[m.field] || m.field}]`;
    }
    return m.value || '';
  };
  return { header: one(mapping.header), headerLink: mapping.headerLink, body: Array.from({ length: slots.body }, (_, i) => one(mapping.body?.[i])) };
}

export const pct = (part, whole) => (whole ? `${Math.round((part / whole) * 100)}%` : '—');
