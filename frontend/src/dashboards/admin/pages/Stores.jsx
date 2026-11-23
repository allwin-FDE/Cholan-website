import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../../shared/api.js';
import { useDash } from '../../shared/context.js';
import { useUrl, useUrlSearch } from '../../shared/urlState.js';
import { Badge, Card, Drawer, Empty, ErrorNote, Icon, Loading, PageHead, Stat, downloadCsv, num, useLoad, when } from '../../shared/ui.jsx';
import { loadGoogleMaps, mapsAvailable } from '../../../lib/googleMaps.js';

// The stores behind the public store finder (/stores): upload the Excel list,
// place every store on the map with Google, and check or fix the pins Google
// could only place roughly. Customers see "approximate" for those until a
// person sets or confirms the pin here.

const STATUS = {
  verified: { label: 'Verified', tone: 'good', hint: 'Its own Google listing, a pin set or checked by staff, or coordinates from the sheet.' },
  address: { label: 'Street address', tone: 'info', hint: 'Google found the exact street address.' },
  approximate: { label: 'Approximate', tone: 'warn', hint: 'Only the road, area or pincode was found. Please check the pin.' },
  missing: { label: 'Not found', tone: 'bad', hint: 'Google found nothing. Set the pin by hand.' },
  pending: { label: 'Not placed yet', tone: 'muted', hint: 'Waiting to be placed on the map.' },
};
const SOURCE = { google_listing: 'Google listing', geocode: 'Address search', manual: 'Set by staff', checked: 'Checked by staff', sheet: 'From the sheet' };
const TABS = [
  ['check', 'To check'],
  ['all', 'All'],
  ['verified', 'Verified'],
  ['address', 'Street address'],
  ['hidden', 'Hidden'],
];
const statusOf = (s) => s.location?.status || 'pending';
const needsCheck = (s) => ['approximate', 'missing', 'pending'].includes(statusOf(s)) || /Possible Google listing/.test(s.location?.note || '');

export default function Stores() {
  const { allowed } = useDash();
  const { get, patch } = useUrl();
  const [q, setQ, committed] = useUrlSearch();
  const { data, loading, error, reload, setData } = useLoad(() => api.stores.list(), []);
  const [run, setRun] = useState(null); // placing progress
  const tab = get('show', 'check');
  const zone = get('zone');
  const open = get('store');

  const all = data?.stores || [];
  const zones = useMemo(() => [...new Set(all.map((s) => s.zone).filter(Boolean))].sort(), [all]);
  const list = useMemo(() => {
    const f = committed.trim().toLowerCase();
    return all.filter((s) => {
      if (tab === 'hidden' ? s.active !== false : s.active === false) return false;
      if (tab === 'check' && !needsCheck(s)) return false;
      if (['verified', 'address'].includes(tab) && statusOf(s) !== tab) return false;
      if (zone && s.zone !== zone) return false;
      return !f || `${s.code} ${s.name} ${s.area} ${s.taluk} ${s.pincode} ${s.manager}`.toLowerCase().includes(f);
    });
  }, [all, tab, zone, committed]);
  const c = data?.counts;
  const waiting = c ? (c.pending || 0) : 0;

  async function placeAll(codes = null) {
    setRun({ done: 0, left: codes ? codes.length : waiting, error: '' });
    try {
      let left = Infinity;
      let done = 0;
      while (left > 0) {
        const r = await api.stores.locate(codes ? { codes } : { limit: 15 });
        done += r.done.length;
        left = codes ? 0 : r.remaining;
        setRun({ done, left, error: '' });
        if (!r.done.length) break;
      }
      setRun(null);
      reload();
    } catch (e) {
      setRun((r) => ({ ...r, error: e.message }));
    }
  }

  const exportCsv = () =>
    downloadCsv('cholan-stores.csv', [
      ['Shop Code', 'Branch', 'Zone', 'Region', 'ASM', 'Door No.', 'Street', 'Area', 'Landmark', 'Taluk', 'District', 'Pincode', 'Phone', 'Latitude', 'Longitude', 'Location', 'How placed', 'Note', 'Shown'],
      ...list.map((s) => [s.code, s.name, s.zone, s.region, s.manager, s.doorNo, s.street, s.area, s.landmark, s.taluk, s.district || s.geoDistrict || "", s.pincode, s.phone, s.lat ?? '', s.lng ?? '', STATUS[statusOf(s)].label, SOURCE[s.location?.source] || '', s.location?.note || '', s.active === false ? 'Hidden' : 'Yes']),
    ]);

  const store = all.find((s) => s.code === open);
  const replace = (next) => setData({ ...data, stores: data.stores.map((s) => (s.code === next.code ? next : s)) });

  return (
    <div className="dash-page">
      <PageHead
        title="Stores"
        intro="The shops shown on the website’s store finder (/stores). Upload the Excel list, place the stores on the map, and check the pins Google could only place roughly."
        range={false}
        actions={
          <>
            <a className="dash-btn dash-btn--ghost" href="/stores" target="_blank" rel="noopener">
              <Icon name="external" /> Open store finder
            </a>
            <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
              <Icon name="download" /> Export
            </button>
            {allowed('admin') && (
              <button type="button" className="dash-btn" onClick={() => patch({ upload: 1 })}>
                <Icon name="file" /> Upload Excel
              </button>
            )}
          </>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {loading && !data && <Loading />}
      {data && (
        <>
          {!data.mapsConfigured && <div className="dash-error">Google Maps is not set up on the server, so stores can’t be placed yet.</div>}
          <div className="dash-stats">
            <Stat label="Stores shown" value={num(c.active)} sub={c.total > c.active ? `${num(c.total - c.active)} hidden` : 'all shown'} icon="pin" />
            <Stat label="Verified" value={num(c.verified)} sub="exact shop location" icon="check" />
            <Stat label="Street address" value={num(c.address)} sub="exact address" icon="target" />
            <Stat label="To check" value={num((c.approximate || 0) + (c.missing || 0) + (c.pending || 0))} sub={`${num(c.approximate)} approximate${c.missing ? `, ${num(c.missing)} not found` : ''}`} icon="flame" />
          </div>

          {(waiting > 0 || run) && (
            <Card title="Place stores on the map">
              {run ? (
                <>
                  <p className="dash-small">
                    Placed {run.done}… {run.left > 0 ? `${run.left} to go.` : 'finishing.'}
                  </p>
                  <div className="stores-progress">
                    <span style={{ width: `${Math.round((run.done / Math.max(1, run.done + run.left)) * 100)}%` }} />
                  </div>
                  {run.error && (
                    <p className="dash-error">
                      {run.error}{' '}
                      <button type="button" className="dash-link" onClick={() => placeAll()}>
                        Try again
                      </button>
                    </p>
                  )}
                </>
              ) : (
                <div className="dash-row">
                  <p className="dash-small" style={{ margin: 0 }}>
                    {num(waiting)} store{waiting === 1 ? ' is' : 's are'} not on the map yet. Google looks up each address and the shop’s own Google listing.
                  </p>
                  {allowed('editor') && data.mapsConfigured && (
                    <button type="button" className="dash-btn" onClick={() => placeAll()}>
                      Place {num(waiting)} on the map
                    </button>
                  )}
                </div>
              )}
            </Card>
          )}

          <div className="dash-toolbar stores-toolbar">
            <div className="dash-seg" role="group" aria-label="Show">
              {TABS.map(([key, label]) => (
                <button key={key} type="button" className={tab === key ? 'is-on' : ''} onClick={() => patch({ show: key === 'check' ? '' : key })}>
                  {label}
                </button>
              ))}
            </div>
            <select value={zone} onChange={(e) => patch({ zone: e.target.value }, { replace: true })} aria-label="Zone">
              <option value="">All zones</option>
              {zones.map((z) => (
                <option key={z}>{z}</option>
              ))}
            </select>
            <div className="dash-search">
              <Icon name="search" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Code, branch, area, pincode, ASM" aria-label="Search stores" />
            </div>
          </div>

          {list.length === 0 ? (
            <Empty icon="check" title={tab === 'check' ? 'Nothing to check' : 'No stores here'}>
              {tab === 'check' ? 'Every store has a verified or exact-address pin.' : all.length ? 'Try another filter.' : 'Upload the Excel list to add the stores.'}
            </Empty>
          ) : (
            <div className="dash-table-wrap">
              <table className="dash-table stores-table">
                <thead>
                  <tr>
                    <th>Store</th>
                    <th>Area</th>
                    <th>Zone · ASM</th>
                    <th>Location</th>
                  </tr>
                </thead>
                <tbody>
                  {list.map((s) => (
                    <tr key={s.code} className="dash-row-link" onClick={() => patch({ store: s.code })}>
                      <td>
                        <strong>{s.name}</strong>
                        <div className="dash-muted dash-small">{s.code}</div>
                      </td>
                      <td>
                        {s.area || s.taluk}
                        <div className="dash-muted dash-small">{s.pincode}</div>
                      </td>
                      <td>
                        {s.zone}
                        <div className="dash-muted dash-small">{s.manager}</div>
                      </td>
                      <td>
                        <Badge tone={STATUS[statusOf(s)].tone}>{STATUS[statusOf(s)].label}</Badge>
                        <div className="dash-muted dash-small stores-table__note">{s.location?.note}</div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="dash-muted dash-small">
            {num(list.length)} of {num(all.length)} stores.
            {data.usage && ` Google today: ${num(data.usage.routes || 0)} of ${num(data.usage.limits.routes)} road-distance searches, ${num(data.usage.geocodes || 0)} of ${num(data.usage.limits.geocodes)} place searches.`}
          </p>
        </>
      )}

      <Drawer open={Boolean(store)} onClose={() => patch({ store: '' })} title={store ? `${store.name} · ${store.code}` : ''} wide>
        {store && <StoreEditor key={store.code} store={store} canEdit={allowed('editor')} onSaved={replace} onRelocate={() => placeAll([store.code])} />}
      </Drawer>
      <Drawer open={get('upload') === '1'} onClose={() => patch({ upload: '' })} title="Upload the store list" wide>
        {get('upload') === '1' && (
          <Upload
            onDone={(placeNow) => {
              patch({ upload: '', show: '' });
              reload();
              if (placeNow) setTimeout(() => placeAll(), 300);
            }}
          />
        )}
      </Drawer>
    </div>
  );
}

// ---- One store ----

function StoreEditor({ store, canEdit, onSaved, onRelocate }) {
  const [form, setForm] = useState(() => ({
    name: store.name || '',
    phone: store.phone || '',
    doorNo: store.doorNo || '',
    street: store.street || '',
    area: store.area || '',
    landmark: store.landmark || '',
    taluk: store.taluk || '',
    district: store.district || '',
    pincode: store.pincode || '',
  }));
  const [pin, setPin] = useState(null); // a pin moved on the map, not saved yet
  const [paste, setPaste] = useState('');
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState(null);
  const [saved, setSaved] = useState('');
  const st = statusOf(store);
  const loc = store.location || {};

  async function save(body, label) {
    setBusy(label);
    setProblem(null);
    setSaved('');
    try {
      const { store: next } = await api.stores.update(store.code, body);
      onSaved(next);
      setPin(null);
      setPaste('');
      setSaved(label === 'details' ? 'Saved.' : 'Pin saved.');
    } catch (e) {
      setProblem(e);
    } finally {
      setBusy('');
    }
  }
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const changed = Object.keys(form).some((k) => String(form[k]) !== String(store[k] || ''));

  return (
    <div className="stores-editor">
      <section>
        <div className="stores-editor__status">
          <Badge tone={STATUS[st].tone}>{STATUS[st].label}</Badge>
          {loc.source && <span className="dash-muted dash-small">{SOURCE[loc.source]}</span>}
          {store.active === false && <Badge tone="muted">Hidden from the website</Badge>}
        </div>
        <p className="dash-small">{loc.note || STATUS[st].hint}</p>
        {loc.listingAddress && <p className="dash-small dash-muted">Google listing: {loc.listingAddress}</p>}
        {loc.addressMatch && <p className="dash-small dash-muted">Address match: {loc.addressMatch}</p>}
        {loc.checkedBy && <p className="dash-small dash-muted">Checked by {loc.checkedBy}, {when(loc.checkedAt)}</p>}

        {mapsAvailable && <PinMap lat={pin?.lat ?? store.lat} lng={pin?.lng ?? store.lng} onMove={canEdit ? setPin : null} approx={st !== 'verified'} />}
        {canEdit && (
          <div className="stores-editor__pin">
            {pin ? (
              <div className="dash-row">
                <span className="dash-small">
                  New pin: {pin.lat.toFixed(6)}, {pin.lng.toFixed(6)}
                </span>
                <button type="button" className="dash-btn" disabled={Boolean(busy)} onClick={() => save({ location: pin }, 'pin')}>
                  {busy === 'pin' ? 'Saving…' : 'Save this pin'}
                </button>
                <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setPin(null)}>
                  Undo
                </button>
              </div>
            ) : (
              <p className="dash-small dash-muted">{mapsAvailable ? 'Drag the pin (or click the map) to where the shop is, then save.' : ''}</p>
            )}
            <div className="dash-row">
              <input value={paste} onChange={(e) => setPaste(e.target.value)} placeholder="Or paste a Google Maps link, or “11.0168, 76.9558”" aria-label="Location" style={{ flex: 1, minWidth: 0 }} />
              <button type="button" className="dash-btn dash-btn--ghost" disabled={!paste.trim() || Boolean(busy)} onClick={() => save({ location: paste }, 'pin')}>
                Use this
              </button>
            </div>
            <div className="dash-row">
              {store.lat != null && st !== 'verified' && (
                <button type="button" className="dash-btn dash-btn--ghost" disabled={Boolean(busy)} onClick={() => save({ confirm: true }, 'pin')}>
                  <Icon name="check" /> The pin is right
                </button>
              )}
              {loc.source !== 'manual' && (
                <button type="button" className="dash-btn dash-btn--ghost" disabled={Boolean(busy)} onClick={onRelocate}>
                  <Icon name="refresh" /> Look up again
                </button>
              )}
              {store.lat != null && (
                <a className="dash-btn dash-btn--ghost" href={`https://www.google.com/maps/search/?api=1&query=${store.lat},${store.lng}`} target="_blank" rel="noopener">
                  <Icon name="external" /> Open in Google Maps
                </a>
              )}
            </div>
          </div>
        )}
      </section>

      <section>
        <h3>Details</h3>
        <div className="stores-editor__grid">
          {[
            ['name', 'Branch name'],
            ['phone', 'Phone (shown to customers)'],
            ['doorNo', 'Door no.'],
            ['street', 'Street'],
            ['area', 'Area'],
            ['landmark', 'Landmark'],
            ['taluk', 'Taluk / town'],
            ['district', 'District'],
            ['pincode', 'Pincode'],
          ].map(([k, label]) => (
            <label key={k} className={`dash-field${problem?.fields?.[k] ? ' has-error' : ''}${k === 'street' ? ' stores-editor__wide' : ''}`}>
              <span className="dash-field__label">{label}</span>
              <input value={form[k]} onChange={set(k)} disabled={!canEdit} inputMode={k === 'pincode' || k === 'phone' ? 'numeric' : undefined} />
              {problem?.fields?.[k] && <span className="dash-field-error">{problem.fields[k]}</span>}
            </label>
          ))}
        </div>
        <p className="dash-small dash-muted">
          Zone {store.zone || '—'} · Region {store.region || '—'} · ASM {store.manager || '—'} (staff only, never shown on the website). Changing the address sends the store to be placed again.
        </p>
        {problem && !problem.fields && <div className="dash-error">{problem.message}</div>}
        {problem?.fields && <div className="dash-error">{problem.message}</div>}
        {saved && <p className="dash-small" role="status">{saved}</p>}
        {canEdit && (
          <div className="dash-row">
            <button type="button" className="dash-btn" disabled={!changed || Boolean(busy)} onClick={() => save(form, 'details')}>
              {busy === 'details' ? 'Saving…' : 'Save details'}
            </button>
            <button type="button" className="dash-btn dash-btn--ghost" disabled={Boolean(busy)} onClick={() => save({ active: store.active === false }, 'details')}>
              {store.active === false ? 'Show on the website again' : 'Hide from the website'}
            </button>
          </div>
        )}
      </section>
    </div>
  );
}

// A small map with the store's pin; staff drag it (or click the map) to move it.
function PinMap({ lat, lng, onMove, approx }) {
  const box = useRef(null);
  const map = useRef(null);
  const marker = useRef(null);
  const [failed, setFailed] = useState(false);
  const has = lat != null && lng != null;

  useEffect(() => {
    let gone = false;
    loadGoogleMaps()
      .then((maps) => {
        if (gone || !box.current) return;
        const center = has ? { lat, lng } : { lat: 11.0, lng: 77.5 };
        map.current = new maps.Map(box.current, { center, zoom: has ? (approx ? 15 : 17) : 7, mapTypeControl: true, streetViewControl: false, clickableIcons: false });
        marker.current = new maps.Marker({ map: map.current, position: has ? center : null, draggable: Boolean(onMove) });
        if (onMove) {
          marker.current.addListener('dragend', (e) => onMove({ lat: e.latLng.lat(), lng: e.latLng.lng() }));
          map.current.addListener('click', (e) => {
            marker.current.setPosition(e.latLng);
            onMove({ lat: e.latLng.lat(), lng: e.latLng.lng() });
          });
        }
      })
      .catch(() => !gone && setFailed(true));
    return () => {
      gone = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A saved or undone pin moves the marker back.
  useEffect(() => {
    if (marker.current && has) marker.current.setPosition({ lat, lng });
  }, [lat, lng, has]);

  if (failed) return <p className="dash-small dash-muted">The map couldn’t load here. Paste a Google Maps link instead.</p>;
  return <div className="stores-pinmap" ref={box} />;
}

// ---- Uploading the Excel list ----

function Upload({ onDone }) {
  const [file, setFile] = useState(null);
  const [preview, setPreview] = useState(null);
  const [hideMissing, setHideMissing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [result, setResult] = useState(null);

  async function check(f) {
    setFile(f);
    setPreview(null);
    setResult(null);
    setProblem('');
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) {
      setProblem('That file is over 5 MB. Upload just the store list.');
      return;
    }
    setBusy(true);
    try {
      setPreview(await api.stores.importSheet(f));
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  }
  async function commit() {
    setBusy(true);
    setProblem('');
    try {
      setResult(await api.stores.importSheet(file, { commit: true, hideMissing }));
    } catch (e) {
      setProblem(e.message);
    } finally {
      setBusy(false);
    }
  }

  if (result) {
    const s = result.saved;
    return (
      <div className="stores-upload">
        <p>
          Imported: <strong>{num(s.added)}</strong> new, <strong>{num(s.updated)}</strong> updated{s.hidden ? <>, <strong>{num(s.hidden)}</strong> hidden</> : ''}.
          {result.invalid.length > 0 && ` ${num(result.invalid.length)} rows were left out.`}
        </p>
        <div className="dash-row">
          <button type="button" className="dash-btn" onClick={() => onDone(true)}>
            Place new and changed stores on the map
          </button>
          <button type="button" className="dash-btn dash-btn--ghost" onClick={() => onDone(false)}>
            Later
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="stores-upload">
      <p className="dash-small">
        An Excel (.xlsx) or CSV file with one row per store and a header row. Columns are recognised by name, for example <em>Shop Code, Branch, Door No., Street Name, Area, Landmark, Taluk, Pincode</em>, and optionally <em>Phone, Latitude, Longitude</em>. Stores are matched by shop code: existing ones are updated, new ones added. Nothing is deleted.
      </p>
      <label className="dash-btn dash-btn--ghost" style={{ cursor: 'pointer' }}>
        <Icon name="file" /> {file ? file.name : 'Choose the file'}
        <input type="file" hidden accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={(e) => check(e.target.files?.[0] || null)} />
      </label>
      {busy && <Loading label={preview ? 'Importing…' : 'Reading the file…'} />}
      {problem && <div className="dash-error">{problem}</div>}
      {preview && !busy && (
        <>
          <Card title="What this file will do">
            <ul className="stores-upload__sum">
              <li>
                <strong>{num(preview.added.length)}</strong> new stores
              </li>
              <li>
                <strong>{num(preview.changed.length)}</strong> updated ({num(preview.changed.filter((c) => c.moved).length)} with a new address, placed again)
              </li>
              <li>
                <strong>{num(preview.unchanged)}</strong> unchanged
              </li>
              <li className={preview.invalid.length ? 'is-bad' : ''}>
                <strong>{num(preview.invalid.length)}</strong> rows can’t be used
              </li>
            </ul>
            <p className="dash-small dash-muted">
              Columns found: {Object.entries(preview.columns).map(([f, h]) => `${h} → ${f}`).join(', ')}
              {preview.unused.length > 0 && `. Not used: ${preview.unused.join(', ')}`}
            </p>
          </Card>
          {preview.invalid.length > 0 && (
            <Card title="Rows left out">
              <table className="dash-table">
                <tbody>
                  {preview.invalid.slice(0, 50).map((r) => (
                    <tr key={r.row}>
                      <td>Row {r.row}</td>
                      <td>{r.name || r.code || '—'}</td>
                      <td>{r.problems.join('; ')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
          {preview.warnings.length > 0 && (
            <Card title="Please check">
              <ul className="dash-small">
                {preview.warnings.map((w) => (
                  <li key={w.row}>
                    Row {w.row}, {w.name}: {w.warning}
                  </li>
                ))}
              </ul>
            </Card>
          )}
          {preview.changed.length > 0 && (
            <Card title="Changes">
              <ul className="dash-small">
                {preview.changed.slice(0, 40).map((s) => (
                  <li key={s.code}>
                    {s.name} ({s.code}): {s.fields.join(', ')}
                  </li>
                ))}
                {preview.changed.length > 40 && <li>…and {preview.changed.length - 40} more</li>}
              </ul>
            </Card>
          )}
          {preview.missing.length > 0 && (
            <Card title={`${num(preview.missing.length)} stores on the website aren’t in this file`}>
              <p className="dash-small">{preview.missing.slice(0, 30).map((m) => m.name).join(', ')}{preview.missing.length > 30 ? '…' : ''}</p>
              <label className="dash-check">
                <input type="checkbox" checked={hideMissing} onChange={(e) => setHideMissing(e.target.checked)} /> Hide them from the website (they stay in the list and can be shown again)
              </label>
            </Card>
          )}
          <div className="dash-row">
            <button type="button" className="dash-btn" disabled={busy || (!preview.added.length && !preview.changed.length && !(hideMissing && preview.missing.length))} onClick={commit}>
              Import {num(preview.added.length + preview.changed.length)} stores
            </button>
          </div>
        </>
      )}
    </div>
  );
}
