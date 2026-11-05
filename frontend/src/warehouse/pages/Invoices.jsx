import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Badge, Card, Empty, ErrorNote, Icon, Loading, dateOnly, downloadCsv, useLoad } from '../../dashboard/ui.jsx';
import { PrintButton, WhHead, rupees, useLive, wh } from '../shared.jsx';
import { ReasonDrawer } from './OrderPage.jsx';

export default function Invoices() {
  const { data, error, reload } = useLive(() => wh.get('/invoices'));
  const list = data?.invoices || [];
  // For the accountant: one row per invoice, with the tax split out.
  const exportCsv = () =>
    downloadCsv('cholan-invoices.csv', [
      ['Invoice', 'Date', 'Status', 'Order', 'Customer', 'Customer GSTIN', 'State', 'Taxable', 'CGST', 'SGST', 'IGST', 'Round off', 'Total', 'Cancel reason'],
      ...list.map((i) => [
        i.number,
        dateOnly(i.createdAt),
        i.status,
        i.orderNumber,
        i.buyer.name,
        i.buyer.gstin,
        i.buyer.state,
        i.taxablePaise / 100,
        i.cgstPaise / 100,
        i.sgstPaise / 100,
        i.igstPaise / 100,
        i.roundOffPaise / 100,
        i.totalPaise / 100,
        i.cancelReason || '',
      ]),
    ]);
  return (
    <div className="dash-page">
      <WhHead
        title="Invoices"
        actions={
          <button type="button" className="dash-btn dash-btn--ghost" onClick={exportCsv} disabled={!list.length}>
            <Icon name="download" /> Export for accountant
          </button>
        }
      />
      {error && <ErrorNote error={error} onRetry={reload} />}
      {!data && !error && <Loading />}
      {data && !list.length && (
        <Empty icon="file" title="No invoices yet">
          Open a confirmed order and press Make invoice.
        </Empty>
      )}
      {list.length > 0 && (
        <Card>
          <div className="dash-table-wrap">
            <table className="dash-table">
              <thead>
                <tr>
                  <th>Invoice</th>
                  <th>Date</th>
                  <th>Customer</th>
                  <th>Order</th>
                  <th>Total</th>
                </tr>
              </thead>
              <tbody>
                {list.map((i) => (
                  <tr key={i.id} className={i.status === 'cancelled' ? 'wh-struck' : ''}>
                    <td>
                      <Link to={`/warehouse/invoices/${i.id}`}>{i.number}</Link> {i.status === 'cancelled' && <Badge tone="muted">Cancelled</Badge>}
                    </td>
                    <td>{dateOnly(i.createdAt)}</td>
                    <td>{i.buyer.name}</td>
                    <td>
                      <Link to={`/warehouse/orders/${i.orderId}`}>{i.orderNumber}</Link>
                    </td>
                    <td>{rupees(i.totalPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

const pct = (rate) => `${rate}%`;

export function InvoiceView() {
  const { id } = useParams();
  const { data: invoice, error, reload } = useLoad(() => wh.get(`/invoices/${id}`), [id]);
  const [cancelling, setCancelling] = useState(false);
  const [problem, setProblem] = useState('');

  if (error) return <div className="dash-page"><ErrorNote error={error} onRetry={reload} /></div>;
  if (!invoice) return <div className="dash-page"><Loading /></div>;
  const { seller, buyer, lines } = invoice;
  const cancelled = invoice.status === 'cancelled';

  return (
    <div className="dash-page">
      <div className="wh-noprint">
        <WhHead
          title={invoice.number}
          actions={
            <>
              <Link to={`/warehouse/orders/${invoice.orderId}`} className="dash-link">
                <Icon name="back" /> Order {invoice.orderNumber}
              </Link>
              {!cancelled && (
                <button type="button" className="dash-btn dash-btn--danger" onClick={() => setCancelling(true)}>
                  Cancel invoice
                </button>
              )}
              <PrintButton label="Print or save PDF" />
            </>
          }
        />
      </div>
      <article className={`wh-sheet wh-invoice${cancelled ? ' is-cancelled' : ''}`}>
        {cancelled && (
          <p className="wh-invoice__void">
            CANCELLED on {dateOnly(invoice.cancelledAt)} by {invoice.cancelledBy}: {invoice.cancelReason}
          </p>
        )}
        <header className="wh-sheet__head">
          <div>
            <h2>{seller.legalName}</h2>
            <p>
              {seller.addressLine1}
              <br />
              {seller.addressLine2}
              <br />
              {seller.state}
              {seller.stateCode && ` (State code ${seller.stateCode})`}
              <br />
              GSTIN: {seller.gstin}
              {seller.fssai && ` · FSSAI: ${seller.fssai}`}
              <br />
              {seller.phone} · {seller.email}
            </p>
          </div>
          <div className="wh-sheet__ref">
            <strong>Tax Invoice</strong>
            <span>No: {invoice.number}</span>
            <span>Date: {dateOnly(invoice.createdAt)}</span>
            <span>Order: {invoice.orderNumber}</span>
            <span>Place of supply: {buyer.state}</span>
          </div>
        </header>
        <section className="wh-invoice__to">
          <h3>Bill to</h3>
          <p>
            <strong>{buyer.name}</strong>
            <br />
            {buyer.address && (
              <>
                {buyer.address}
                <br />
              </>
            )}
            {[buyer.city, buyer.state, buyer.pincode].filter(Boolean).join(', ')}
            <br />
            {buyer.phone}
            {buyer.gstin && (
              <>
                <br />
                GSTIN: {buyer.gstin}
              </>
            )}
          </p>
        </section>
        <table className="wh-sheet__table wh-invoice__table">
          <thead>
            <tr>
              <th>#</th>
              <th>Item</th>
              <th>HSN</th>
              <th>Qty</th>
              <th>Rate</th>
              <th>Taxable</th>
              <th>GST</th>
              {invoice.interstate ? <th>IGST</th> : (
                <>
                  <th>CGST</th>
                  <th>SGST</th>
                </>
              )}
              <th>Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((line, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td>
                  {line.name} {line.pack}
                </td>
                <td>{line.hsn}</td>
                <td>{line.qty}</td>
                <td>{rupees(line.unitPaise)}</td>
                <td>{rupees(line.taxablePaise)}</td>
                <td>{pct(line.gstRate)}</td>
                {invoice.interstate ? <td>{rupees(line.igstPaise)}</td> : (
                  <>
                    <td>{rupees(line.cgstPaise)}</td>
                    <td>{rupees(line.sgstPaise)}</td>
                  </>
                )}
                <td>{rupees(line.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="wh-invoice__foot">
          <div>
            <p>
              <strong>Amount in words:</strong> {invoice.amountInWords}
            </p>
            {invoice.pricesIncludeGst && <p className="dash-small">Rates include GST.</p>}
            {seller.bankDetails && (
              <p className="wh-prewrap">
                <strong>Bank details:</strong> {seller.bankDetails}
              </p>
            )}
            {seller.terms && <p className="wh-prewrap dash-small">{seller.terms}</p>}
          </div>
          <dl className="wh-sums">
            <dt>Taxable value</dt>
            <dd>{rupees(invoice.taxablePaise)}</dd>
            {invoice.interstate ? (
              <>
                <dt>IGST</dt>
                <dd>{rupees(invoice.igstPaise)}</dd>
              </>
            ) : (
              <>
                <dt>CGST</dt>
                <dd>{rupees(invoice.cgstPaise)}</dd>
                <dt>SGST</dt>
                <dd>{rupees(invoice.sgstPaise)}</dd>
              </>
            )}
            {invoice.roundOffPaise !== 0 && (
              <>
                <dt>Round off</dt>
                <dd>{invoice.roundOffPaise < 0 ? `−${rupees(-invoice.roundOffPaise)}` : rupees(invoice.roundOffPaise)}</dd>
              </>
            )}
            <dt>
              <strong>Total</strong>
            </dt>
            <dd>
              <strong>{rupees(invoice.totalPaise)}</strong>
            </dd>
          </dl>
        </div>
        <p className="wh-invoice__sign">
          For {seller.legalName}
          <br />
          <br />
          Authorised signatory
        </p>
      </article>
      <ReasonDrawer
        open={cancelling}
        title={`Cancel ${invoice.number}?`}
        hint="It stays on your records, marked cancelled, with its number. You can then correct the order and make a new invoice."
        action="Cancel invoice"
        onClose={() => setCancelling(false)}
        problem={problem}
        onSubmit={async ({ reason }) => {
          setProblem('');
          try {
            await wh.post(`/invoices/${id}/cancel`, { reason });
            setCancelling(false);
            reload();
          } catch (e) {
            setProblem(e.message);
          }
        }}
      />
    </div>
  );
}
