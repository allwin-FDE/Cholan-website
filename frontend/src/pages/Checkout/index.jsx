import { useState } from 'react';
import { useCart } from '../../context/CartContext';
import { site } from '../../config/site';
import DetailsFields from './DetailsFields';
import EmptyCart from './EmptyCart';
import OrderDone from './OrderDone';
import OrderSummary from './OrderSummary';
import {
  DETAILS_STORAGE_KEY,
  buildOrderMessage,
  loadSavedDetails,
  makeOrderId,
  validateDetails,
} from './orderHelpers';

export default function Checkout() {
  const { items, count, subtotal, hasUnpriced, setQty, clear } = useCart();
  const [details, setDetails] = useState(loadSavedDetails);
  const [errors, setErrors] = useState({});
  const [order, setOrder] = useState(null);

  // onChange handler factory: updates a field and clears its error.
  const bind = (field) => (event) => {
    setDetails((current) => ({ ...current, [field]: event.target.value }));
    if (errors[field]) setErrors((current) => ({ ...current, [field]: undefined }));
  };

  const submit = (event) => {
    event.preventDefault();
    const found = validateDetails(details);
    setErrors(found);
    if (Object.keys(found).length) {
      document.getElementById(`co-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    const ref = makeOrderId();
    const url = `https://wa.me/${site.phoneRaw}?text=${encodeURIComponent(
      buildOrderMessage(ref, items, subtotal, hasUnpriced, details),
    )}`;
    try {
      const { notes, ...remembered } = details;
      localStorage.setItem(DETAILS_STORAGE_KEY, JSON.stringify(remembered));
    } catch {}
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

  if (order) return <OrderDone order={order} />;
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
          <DetailsFields details={details} errors={errors} bind={bind} />
          <OrderSummary
            items={items}
            count={count}
            subtotal={subtotal}
            hasUnpriced={hasUnpriced}
            method={details.method}
            setQty={setQty}
          />
        </form>
      </div>
    </section>
  );
}
