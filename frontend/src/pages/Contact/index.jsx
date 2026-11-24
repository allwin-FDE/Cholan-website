import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import PageHero from '../../components/common/PageHero.jsx';
import { Icon, iconPaths, WhatsAppLogo } from '../../components/common/Icon.jsx';
import { site } from '../../config/site.js';
import { getProduct } from '../../lib/products.js';
import { hasBackend, submitEnquiry } from '../../lib/api.js';
import { whatsappEnquiryLink, whatsappLink } from '../../lib/whatsapp.js';
import Seo from '../../components/common/Seo.jsx';
import { pages, businessSchema } from '../../config/seo.js';
import { track } from '../../lib/analytics.js';
import { enquiryContext } from '../../lib/tracker.js';
import { isMobile, tenDigits } from '../../lib/phone.js';
import { isName, lettersOnly } from '../../lib/names.js';
import { formatPrice } from '../../lib/format.js';
import { Link } from 'react-router-dom';

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
  // "Enquire" on a product carries the pack size chosen there.
  const pack = product?.packs.find((p) => p.size === searchParams.get('size'));
  const [form, setForm] = useState(() => {
    if (!product) return emptyForm;
    const name = product.fullName || product.name;
    const message = pack
      ? `I would like to order ${name}, ${pack.size}${pack.price != null ? ` (${formatPrice(pack.price)})` : ''}. Please confirm the price and delivery to my area.`
      : `I would like to know more about ${name}${product.packs.length ? ` (${product.packs.map((p) => p.size).join(' / ')})` : ''}. Please share the price and availability.`;
    return { ...emptyForm, enquiryType: 'Household order', message };
  });
  // A field people can't see: filled in only by spam robots.
  const [trap, setTrap] = useState('');
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
    // The phone box takes a 10-digit mobile number only; the name, letters.
    const raw = event.target.value;
    const value = field === 'phone' ? tenDigits(raw) : field === 'name' ? lettersOnly(raw) : raw;
    setForm((current) => ({ ...current, [field]: value }));
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
    if (!isName(form.name)) {
      setFieldErrors((current) => ({ ...current, name: form.name.trim().length < 2 ? 'Please type your full name.' : 'Please type your name using letters only.' }));
      document.getElementById('name')?.focus();
      return;
    }
    if (!isMobile(form.phone)) {
      setFieldErrors((current) => ({ ...current, phone: 'Please type a 10-digit mobile number.' }));
      document.getElementById('phone')?.focus();
      return;
    }
    if (form.email.trim() && !EMAIL.test(form.email.trim())) {
      setFieldErrors((current) => ({ ...current, email: 'That email address does not look right.' }));
      document.getElementById('email')?.focus();
      return;
    }

    // No backend online yet: send the enquiry through WhatsApp instead.
    if (!hasBackend) {
      window.open(whatsappEnquiryLink(form), '_blank', 'noopener');
      track('generate_lead', { method: 'whatsapp', enquiry_type: form.enquiryType, product: product?.id });
      setStatus('sent-whatsapp');
      setForm(emptyForm);
      return;
    }

    setStatus('sending');
    setError('');
    setFieldErrors({});

    try {
      await submitEnquiry({ ...form, product: product?.id || null, website_url: trap, meta: enquiryContext() });
      // What was asked about, never who asked: no name, phone or email.
      track('generate_lead', { method: 'enquiry_form', enquiry_type: form.enquiryType, product: product?.id });
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
      <Seo {...pages.contact} schema={businessSchema} />
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
            {status === 'sent-whatsapp' && (
              <p className="notice" role="status">
                Thanks — your enquiry opened in WhatsApp. Send the message there and we will reply
                shortly.
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
                  name="name"
                  autoComplete="name"
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
                  <label htmlFor="phone">Mobile number *</label>
                  <div className="phone-field">
                    <span className="phone-field__prefix" aria-hidden="true">
                      +91
                    </span>
                    <input
                      id="phone"
                      name="tel"
                      className="input"
                      type="tel"
                      inputMode="numeric"
                      autoComplete="tel-national"
                      placeholder="10-digit number"
                      required
                      value={form.phone}
                      onChange={updateField('phone')}
                      aria-invalid={fieldErrors.phone ? 'true' : undefined}
                      aria-describedby={fieldErrors.phone ? 'phone-error' : undefined}
                    />
                  </div>
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
                    name="email"
                    autoComplete="email"
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
                  name="message"
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
              <div className="form__trap" aria-hidden="true">
                <label htmlFor="website_url">Leave this empty</label>
                <input id="website_url" name="website_url" tabIndex={-1} autoComplete="off" value={trap} onChange={(e) => setTrap(e.target.value)} />
              </div>
              <button
                type="submit"
                className="btn btn--primary btn--block"
                disabled={status === 'sending'}
              >
                {status === 'sending' ? 'Sending…' : 'Send enquiry'}
              </button>
              <p className="muted form__note">
                We reply by phone or email, usually within one working day. We use your details only to
                reply to this enquiry (<Link to="/policies/privacy">Privacy Policy</Link>).
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
                <a href={`tel:+${site.phoneRaw}`} className="infocard__value infocard__phone" aria-label={`Call ${site.phone}`}>
                  <Icon d={iconPaths.phone} /> {site.phone}
                </a>
                {site.whatsapp?.show && (
                  <a href={`https://wa.me/${site.whatsapp.raw}`} target="_blank" rel="noreferrer" className="infocard__whatsapp" aria-label={`WhatsApp ${site.whatsapp.number}`}>
                    <WhatsAppLogo /> {site.whatsapp.number}
                  </a>
                )}
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
