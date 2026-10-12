import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHero from '../../components/common/PageHero.jsx';
import { site } from '../../config/site.js';
import { getProduct } from '../../lib/products.js';
import { submitEnquiry } from '../../lib/api.js';
import { whatsappLink } from '../../lib/whatsapp.js';

const fullAddress = `${site.address.line1}, ${site.address.line2} ${site.address.pincode}, ${site.address.state}`;

const emptyForm = {
  name: '',
  phone: '',
  email: '',
  enquiryType: 'Household order',
  message: '',
};

// /contact (original `km`). The enquiry form posts to the backend, which stores
// it in the local database and pushes it on to Firestore.
export default function Contact() {
  const [searchParams] = useSearchParams();
  const product = getProduct(searchParams.get('product') || '');
  const [form, setForm] = useState(() =>
    product
      ? {
          ...emptyForm,
          enquiryType: 'Product question',
          message: `I would like to know more about ${product.name}${product.packs.length ? ` (${product.packs.map((pack) => pack.size).join(' / ')})` : ''}. Please share the price and availability.`,
        }
      : emptyForm,
  );
  // 'idle' | 'sending' | 'sent' | 'error'
  const [status, setStatus] = useState('idle');
  const [error, setError] = useState('');
  const [fieldErrors, setFieldErrors] = useState({});

  // Coming from a product page: bring the form into view if it is far down.
  useEffect(() => {
    if (!product) return;
    const timer = setTimeout(() => {
      const formEl = document.querySelector('.contact__form');
      if (formEl && formEl.getBoundingClientRect().top > window.innerHeight * 0.6) {
        formEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 500);
    return () => clearTimeout(timer);
  }, [product]);

  const updateField = (field) => (event) => {
    setForm((current) => ({ ...current, [field]: event.target.value }));
    // Clear this field's error as soon as it is edited, so a correction does
    // not sit next to a stale complaint.
    setFieldErrors((current) => {
      if (!current[field]) return current;
      const { [field]: _cleared, ...rest } = current;
      return rest;
    });
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (status === 'sending') return;

    setStatus('sending');
    setError('');
    setFieldErrors({});

    try {
      await submitEnquiry({ ...form, product: product?.id || null });
      setStatus('sent');
      setForm(emptyForm);
    } catch (submitError) {
      setStatus('error');
      setError(submitError.message);
      setFieldErrors(submitError.fields || {});
    }
  };

  return (
    <>
      <PageHero
        title="Talk to us"
        lede="Household orders, bulk quotes or a question about a variety — we are happy to help."
      />
      <section className="section section--alt">
        <div className="container contact">
          <div className="contact__form">
            <h2>Send an enquiry</h2>
            {status === 'sent' && (
              <p className="notice" role="status">
                Thanks — we have your enquiry and will get back to you shortly, usually within one
                working day.
              </p>
            )}
            {status === 'error' && error && (
              <p className="notice notice--error" role="alert">
                {error}
              </p>
            )}
            <form onSubmit={handleSubmit}>
              <div className="field">
                <label htmlFor="name">Your name *</label>
                <input
                  id="name"
                  className="input"
                  required
                  value={form.name}
                  onChange={updateField('name')}
                  aria-invalid={fieldErrors.name ? 'true' : undefined}
                  aria-describedby={fieldErrors.name ? 'name-error' : undefined}
                />
                {fieldErrors.name && (
                  <p className="field__error" id="name-error">
                    {fieldErrors.name}
                  </p>
                )}
              </div>
              <div className="field-row">
                <div className="field">
                  <label htmlFor="phone">Phone *</label>
                  <input
                    id="phone"
                    className="input"
                    type="tel"
                    required
                    value={form.phone}
                    onChange={updateField('phone')}
                    aria-invalid={fieldErrors.phone ? 'true' : undefined}
                    aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                  />
                  {fieldErrors.phone && (
                    <p className="field__error" id="phone-error">
                      {fieldErrors.phone}
                    </p>
                  )}
                </div>
                <div className="field">
                  <label htmlFor="email">Email</label>
                  <input
                    id="email"
                    className="input"
                    type="email"
                    value={form.email}
                    onChange={updateField('email')}
                    aria-invalid={fieldErrors.email ? 'true' : undefined}
                    aria-describedby={fieldErrors.email ? 'email-error' : undefined}
                  />
                  {fieldErrors.email && (
                    <p className="field__error" id="email-error">
                      {fieldErrors.email}
                    </p>
                  )}
                </div>
              </div>
              <div className="field">
                <label htmlFor="type">Enquiry type</label>
                <select
                  id="type"
                  className="input"
                  value={form.enquiryType}
                  onChange={updateField('enquiryType')}
                >
                  <option>Household order</option>
                  <option>Bulk / wholesale</option>
                  <option>Distributor enquiry</option>
                  <option>Product question</option>
                  <option>Other</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="message">Message *</label>
                <textarea
                  id="message"
                  className="input"
                  rows={6}
                  required
                  placeholder="Which varieties and quantities are you looking for?"
                  value={form.message}
                  onChange={updateField('message')}
                  aria-invalid={fieldErrors.message ? 'true' : undefined}
                  aria-describedby={fieldErrors.message ? 'message-error' : undefined}
                />
                {fieldErrors.message && (
                  <p className="field__error" id="message-error">
                    {fieldErrors.message}
                  </p>
                )}
              </div>
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Sending…' : 'Send enquiry'}
              </button>
              <p className="muted form__note">
                We reply by phone or email, usually within one working day.
              </p>
            </form>
          </div>

          <div className="contact__direct">
            <div className="contact__head">
              <h2>Reach us directly</h2>
              <p className="lede">The fastest way to get a reply is WhatsApp or a phone call.</p>
            </div>
            <div className="contact__cards">
              <div className="infocard">
                <span className="infocard__label">Phone</span>
                <a href={`tel:${site.phoneRaw}`} className="infocard__value">
                  {site.phone}
                </a>
                <span className="muted">{site.hours}</span>
              </div>
              <div className="infocard">
                <span className="infocard__label">Email</span>
                <a href={`mailto:${site.email}`} className="infocard__value">
                  {site.email}
                </a>
              </div>
              <div className="infocard">
                <span className="infocard__label">Visit / Warehouse</span>
                <address className="infocard__value infocard__address">
                  {site.address.line1}
                  <br />
                  {site.address.line2} – {site.address.pincode}
                  <br />
                  {site.address.state}
                </address>
              </div>
            </div>
            <a
              href={whatsappLink()}
              target="_blank"
              rel="noreferrer"
              className="btn btn--primary contact__wa"
            >
              Message us on WhatsApp
            </a>
          </div>

          <div className="contact__find">
            <div className="contact__head">
              <h2>Find us</h2>
              <p className="lede">
                {site.address.line1}, {site.address.line2} – {site.address.pincode}
              </p>
            </div>
            <div className="contact__map">
              <iframe
                title={`Map showing ${site.name}`}
                src={`https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                allowFullScreen
              />
            </div>
            <a
              href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
              target="_blank"
              rel="noreferrer"
              className="contact__directions"
            >
              Open in Google Maps
            </a>
          </div>
        </div>
      </section>
    </>
  );
}
