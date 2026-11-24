import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import { useCart } from '../../context/CartContext';
import { site } from '../../config/site';
import { whatsappNumber } from '../../lib/whatsapp';
import DetailsFields from './DetailsFields';
import EmptyCart from './EmptyCart';
import OrderDone from './OrderDone';
import OrderSummary from './OrderSummary';
import { loadCatalog, matchCart, payOnline, placeOrder } from '../../lib/shop';
import { useStock } from '../../context/StockContext';
import {
  DETAILS_STORAGE_KEY,
  buildOrderMessage,
  loadSavedDetails,
  makeOrderId,
  validateDetails,
} from './orderHelpers';

// The order just placed, kept for this tab so its confirmation page
// (/checkout/confirmed?order=…) still shows after a refresh.
const DONE_KEY = 'cholan-last-order';
const readDone = () => {
  try {
    return JSON.parse(sessionStorage.getItem(DONE_KEY) || 'null');
  } catch {
    return null;
  }
};

// /checkout/confirmed?order=CO-00012: the thank-you page for the order just placed.
export function OrderConfirmed() {
  const [params] = useSearchParams();
  const order = readDone();
  if (!order || (params.get('order') && params.get('order') !== order.ref)) return <Navigate to="/products" replace />;
  return (
    <>
      <title>{`Order ${order.ref} placed | Cholan`}</title>
      <meta name="robots" content="noindex" />
      <OrderDone order={order} />
    </>
  );
}

export default function Checkout() {
  const { items, count, subtotal, hasUnpriced, setQty, clear } = useCart();
  const [details, setDetails] = useState(loadSavedDetails);
  const [errors, setErrors] = useState({});
  const navigate = useNavigate();
  // A placed order gets its own address: /checkout/confirmed?order=…
  const setOrder = (done) => {
    try {
      sessionStorage.setItem(DONE_KEY, JSON.stringify(done));
    } catch {}
    navigate(`/checkout/confirmed?order=${encodeURIComponent(done.ref)}`);
  };
  const [catalog, setCatalog] = useState({ online: false, items: [] });
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');

  // Whether the shop takes online payment now, and the packs it can sell.
  useEffect(() => {
    loadCatalog().then(setCatalog);
  }, []);
  const online = catalog.online && !hasUnpriced;
  const { inStock } = useStock();
  const outOfStock = items.filter((item) => inStock(item.id, item.size) === false);

  // onChange handler factory: updates a field and clears its error.
  const bind = (field) => (event) => {
    setDetails((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const remember = () => {
    try {
      const { notes, ...remembered } = details;
      localStorage.setItem(DETAILS_STORAGE_KEY, JSON.stringify(remembered));
    } catch {}
  };

  // Paid online through Razorpay; the order is made and confirmed by the server.
  const submitOnline = async () => {
    const { lines, missing } = matchCart(items, catalog);
    if (missing.length) {
      setPayError(`These can't be paid for online right now: ${missing.join(', ')}. Choose cash or UPI on delivery instead.`);
      return;
    }
    setPaying(true);
    setPayError('');
    try {
      const paid = await payOnline({ details, lines });
      remember();
      setOrder({ ref: paid.orderNumber, total: paid.amountPaise / 100, count, hasUnpriced: false, method: details.method, name: details.name.trim(), paid: true });
      clear();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (e) {
      if (e.fields) setErrors((current) => ({ ...current, ...e.fields }));
      setPayError(e.message);
    } finally {
      setPaying(false);
    }
  };

  const submit = (event) => {
    event.preventDefault();
    if (outOfStock.length) {
      setPayError(`Out of stock: ${outOfStock.map((i) => `${i.product.name} (${i.size})`).join(', ')}. Please remove ${outOfStock.length === 1 ? 'it' : 'them'} to place the order.`);
      return;
    }
    const found = validateDetails(details);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`co-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    if (online && details.method === 'delivery' && details.payment === 'online') {
      submitOnline();
      return;
    }
    submitLater();
  };

  // Paid on delivery or at pickup: the order is saved into the shop's Orders.
  // If every pack is one the shop's system knows, it goes there; if the
  // system can't be reached, it is sent on WhatsApp as before, so no order is
  // lost.
  const submitLater = async () => {
    const { lines, missing } = matchCart(items, catalog);
    if (lines.length && !missing.length) {
      setPaying(true);
      setPayError('');
      try {
        const placed = await placeOrder({ details, lines });
        remember();
        const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(buildOrderMessage(placed.orderNumber, items, subtotal, hasUnpriced, details))}`;
        setOrder({ ref: placed.orderNumber, url, total: placed.totalPaise / 100, count, hasUnpriced: false, method: details.method, name: details.name.trim(), saved: true });
        clear();
        return;
      } catch (e) {
        // A problem with the order itself (stock, a detail): show it.
        if (e.status && e.status < 500) {
          if (e.fields) setErrors((current) => ({ ...current, ...e.fields }));
          setPayError(e.message);
          return;
        }
      } finally {
        setPaying(false);
      }
    }
    sendOnWhatsApp();
  };

  const sendOnWhatsApp = () => {
    const ref = makeOrderId();
    const url = `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(
      buildOrderMessage(ref, items, subtotal, hasUnpriced, details),
    )}`;
    remember();
    window.open(url, '_blank', 'noopener');
    setOrder({
      ref,
      url,
      total: subtotal,
      count,
      hasUnpriced,
      method: details.method,
      name: details.name.trim(),
    });
    clear();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (items.length === 0) return <EmptyCart />;

  return (
    <section className="section co">
      <div className="container">
        <header className="co-head">
          <h1>Checkout</h1>
          <ol className="co-steps" aria-label="Progress">
            <li className="is-done">Cart</li>
            <li className="is-on" aria-current="step">
              Details
            </li>
            <li>Confirm</li>
          </ol>
        </header>
        <form className="co-grid" onSubmit={submit} noValidate>
          <DetailsFields details={details} errors={errors} bind={bind} online={online} />
          <OrderSummary
            items={items}
            count={count}
            subtotal={subtotal}
            hasUnpriced={hasUnpriced}
            method={details.method}
            setQty={setQty}
            payOnline={online && details.method === 'delivery' && details.payment === 'online'}
            paying={paying}
            payError={payError}
            outOfStock={outOfStock.map((i) => `${i.product.name} (${i.size})`)}
          />
        </form>
      </div>
    </section>
  );
}
