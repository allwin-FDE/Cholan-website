import { useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { api } from '../../api.js';
import { ErrorNote, Loading, useLoad } from '../../ui.jsx';
import { money, niceDate, phoneShow, stateName } from './shared.js';
import '../../../styles/print-doc.css';

const TITLES = {
  tax_invoice: 'Tax Invoice',
  bill_of_supply: 'Bill of Supply',
  invoice_cum_bos: 'Tax Invoice cum Bill of Supply',
  credit_note: 'Credit Note',
};
const pct = (bp) => `${bp / 100}%`;

// A GST invoice or credit note as an A4 page, printed or saved as PDF with the
// browser's own Print. Everything on it was frozen when it was issued.
export default function PrintDoc({ kind }) {
  const { id } = useParams();
  const isNote = kind === 'credit-note';
  const { data: doc, error } = useLoad(() => (isNote ? api.sales.creditNote(id) : api.sales.getInvoice(id)), [id, kind]);
  useEffect(() => {
    if (doc) document.title = `${isNote ? 'Credit note' : 'Invoice'} ${doc.number}`;
  }, [doc, isNote]);

  if (error) return <div className="pdoc-wrap"><ErrorNote error={error} /></div>;
  if (!doc) return <div className="pdoc-wrap"><Loading /></div>;
  const s = doc.seller;
  const b = doc.buyer;
  const ship = doc.ship_to;
  const interstate = doc.interstate;
  const cancelled = doc.status === 'cancelled';
  const title = isNote ? TITLES.credit_note : TITLES[doc.doc_type];
  const date = isNote ? doc.note_date : doc.invoice_date;

  return (
    <div className="pdoc-wrap">
      <div className="pdoc-bar">
        <button type="button" className="dash-btn" onClick={() => window.print()}>
          Print / Save as PDF
        </button>
        <span className="dash-muted dash-small">In the print window, choose “Save as PDF” to keep a copy.</span>
      </div>
      <article className={`pdoc${cancelled ? ' pdoc--cancelled' : ''}`}>
        {cancelled && <div className="pdoc-stamp">CANCELLED</div>}
        <header className="pdoc-head">
          <div>
            <h1>{s.legal_name}</h1>
            {s.brand_name && s.brand_name !== s.legal_name && <p className="pdoc-brand">{s.brand_name}</p>}
            <p>{s.address}</p>
            <p>
              GSTIN <strong>{s.gstin}</strong> · State {stateName(s.state_code)} ({s.state_code})
            </p>
            <p>{[s.fssai && `FSSAI ${s.fssai}`, s.pan && `PAN ${s.pan}`, s.cin && `CIN ${s.cin}`].filter(Boolean).join(' · ')}</p>
            <p>{[phoneShow(s.phone), s.email].filter(Boolean).join(' · ')}</p>
          </div>
          <div className="pdoc-title">
            <h2>{title}</h2>
            <p className="pdoc-copy">Original for recipient</p>
          </div>
        </header>

        <section className="pdoc-meta">
          <div>
            <dl>
              <dt>{isNote ? 'Credit note no.' : 'Invoice no.'}</dt>
              <dd>
                <strong>{doc.number}</strong>
              </dd>
              <dt>Date</dt>
              <dd>{niceDate(date)}</dd>
              {isNote ? (
                <>
                  <dt>Against invoice</dt>
                  <dd>
                    {doc.invoice_number} of {niceDate(doc.invoice_date)}
                  </dd>
                  <dt>Reason</dt>
                  <dd>{{ return: 'Goods returned', damage: 'Damaged goods', rate_difference: 'Rate difference', discount: 'Discount', other: 'Other' }[doc.reason]}</dd>
                </>
              ) : (
                <>
                  <dt>Order no.</dt>
                  <dd>{doc.order_number}</dd>
                  <dt>Due date</dt>
                  <dd>{niceDate(doc.due_date)}</dd>
                </>
              )}
              <dt>Place of supply</dt>
              <dd>
                {stateName(doc.place_of_supply)} ({doc.place_of_supply})
              </dd>
              <dt>Reverse charge</dt>
              <dd>No</dd>
            </dl>
          </div>
          <div>
            <h3>Bill to</h3>
            <p>
              <strong>{b.name}</strong>
            </p>
            {b.address && <p>{b.address}</p>}
            <p>
              {b.gstin ? (
                <>
                  GSTIN <strong>{b.gstin}</strong> ·{' '}
                </>
              ) : (
                'Unregistered · '
              )}
              State {stateName(b.state_code)} ({b.state_code})
            </p>
            {b.phone && <p>{phoneShow(b.phone)}</p>}
          </div>
          {ship && (
            <div>
              <h3>Ship to</h3>
              <p>
                <strong>{ship.name}</strong>
              </p>
              <p>{[ship.line1, ship.line2, ship.city, ship.pincode].filter(Boolean).join(', ')}</p>
              <p>
                State {stateName(ship.state_code)} ({ship.state_code})
              </p>
            </div>
          )}
        </section>

        <table className="pdoc-lines">
          <thead>
            <tr>
              <th>#</th>
              <th>Description</th>
              <th>HSN</th>
              <th className="n">Qty</th>
              <th className="n">Rate</th>
              <th className="n">Taxable value</th>
              <th className="n">GST</th>
              {interstate ? <th className="n">IGST</th> : (
                <>
                  <th className="n">CGST</th>
                  <th className="n">SGST</th>
                </>
              )}
              <th className="n">Amount</th>
            </tr>
          </thead>
          <tbody>
            {doc.lines.map((l) => (
              <tr key={l.id}>
                <td>{l.line_no}</td>
                <td>{l.description}</td>
                <td>{l.hsn}</td>
                <td className="n">
                  {l.qty} {l.unit || 'BAG'}
                </td>
                <td className="n">{money(l.unit_price_paise)}</td>
                <td className="n">{money(l.taxable_paise)}</td>
                <td className="n">{l.gst_rate_bp ? pct(l.gst_rate_bp) : 'Nil'}</td>
                {interstate ? <td className="n">{money(l.igst_paise)}</td> : (
                  <>
                    <td className="n">{money(l.cgst_paise)}</td>
                    <td className="n">{money(l.sgst_paise)}</td>
                  </>
                )}
                <td className="n">{money(l.total_paise)}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <section className="pdoc-foot">
          <div>
            <p className="pdoc-words">
              <strong>Amount in words:</strong> {doc.amount_in_words}
            </p>
            {(doc.includes_gst ?? true) && <p className="pdoc-note">Prices include GST.</p>}
            {doc.exempt_paise > 0 && <p className="pdoc-note">Nil-rated / exempt supply value: {money(doc.exempt_paise)}.</p>}
            {doc.dispatch && (doc.dispatch.vehicle_no || doc.dispatch.lr_no || doc.dispatch.eway_bill_no) && (
              <p className="pdoc-note">
                {[doc.dispatch.vehicle_no && `Vehicle ${doc.dispatch.vehicle_no}`, doc.dispatch.transporter, doc.dispatch.lr_no && `LR ${doc.dispatch.lr_no}`, doc.dispatch.eway_bill_no && `E-way bill ${doc.dispatch.eway_bill_no}`]
                  .filter(Boolean)
                  .join(' · ')}
              </p>
            )}
            {cancelled && (
              <p className="pdoc-note">
                <strong>Cancelled</strong> on {niceDate(doc.cancelled_at?.slice(0, 10))}: {doc.cancel_reason}
              </p>
            )}
          </div>
          <table className="pdoc-totals">
            <tbody>
              <tr>
                <td>Taxable value</td>
                <td>{money(doc.taxable_paise)}</td>
              </tr>
              {doc.exempt_paise > 0 && (
                <tr>
                  <td>Nil-rated / exempt value</td>
                  <td>{money(doc.exempt_paise)}</td>
                </tr>
              )}
              {interstate ? (
                <tr>
                  <td>IGST</td>
                  <td>{money(doc.igst_paise)}</td>
                </tr>
              ) : (
                <>
                  <tr>
                    <td>CGST</td>
                    <td>{money(doc.cgst_paise)}</td>
                  </tr>
                  <tr>
                    <td>SGST</td>
                    <td>{money(doc.sgst_paise)}</td>
                  </tr>
                </>
              )}
              {doc.round_off_paise !== 0 && (
                <tr>
                  <td>Round off</td>
                  <td>{money(doc.round_off_paise)}</td>
                </tr>
              )}
              <tr className="pdoc-grand">
                <td>Total</td>
                <td>{money(doc.total_paise)}</td>
              </tr>
            </tbody>
          </table>
        </section>

        <footer className="pdoc-sign">
          <p className="dash-small">This is a computer-generated document.</p>
          <div>
            <p>For {s.legal_name}</p>
            <p className="pdoc-sign__line">Authorised signatory</p>
          </div>
        </footer>
      </article>
    </div>
  );
}
