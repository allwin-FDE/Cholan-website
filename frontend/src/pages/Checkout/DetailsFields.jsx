import ChoiceRadio from '../../components/checkout/ChoiceRadio';
import Field from '../../components/checkout/Field';
import { site } from '../../config/site';
import { paymentLabels } from './orderHelpers';
import { GST_STATES } from '../../lib/shop';

// The three form cards: your details, delivery, payment. `online` adds
// "Pay online now" (Razorpay) for home delivery, when the shop takes it.
export default function DetailsFields({ details, errors, bind, online = false }) {
  const canPayOnline = online && details.method === 'delivery';
  return (
    <div className="co-form">
      <fieldset className="co-card">
        <legend>
          <span className="co-num">1</span> Your details
        </legend>
        <div className="co-row">
          <Field id="name" label="Full name" error={errors.name}>
            <input id="co-name" value={details.name} onChange={bind('name')} autoComplete="name" />
          </Field>
          <Field id="phone" label="Mobile number" error={errors.phone}>
            <input
              id="co-phone"
              value={details.phone}
              onChange={bind('phone')}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              placeholder="98765 43210"
            />
          </Field>
        </div>
      </fieldset>
      <fieldset className="co-card">
        <legend>
          <span className="co-num">2</span> Delivery
        </legend>
        <div className="co-choices">
          <ChoiceRadio
            name="method"
            value="delivery"
            current={details.method}
            onChange={bind('method')}
            title="Home delivery"
            note="Across India"
          />
          <ChoiceRadio
            name="method"
            value="pickup"
            current={details.method}
            onChange={bind('method')}
            title="Pickup from the mill"
            note={site.address.line2}
          />
        </div>
        {details.method === 'delivery' ? (
          <div className="co-reveal" key="delivery">
            <Field id="address" label="House / street / area" error={errors.address}>
              <textarea
                id="co-address"
                rows={2}
                value={details.address}
                onChange={bind('address')}
                autoComplete="street-address"
              />
            </Field>
            <div className="co-row co-row--3">
              <Field id="city" label="City" error={errors.city}>
                <input
                  id="co-city"
                  value={details.city}
                  onChange={bind('city')}
                  autoComplete="address-level2"
                />
              </Field>
              <Field id="pincode" label="Pincode" error={errors.pincode}>
                <input
                  id="co-pincode"
                  value={details.pincode}
                  onChange={bind('pincode')}
                  inputMode="numeric"
                  maxLength={6}
                  autoComplete="postal-code"
                />
              </Field>
              <Field id="landmark" label="Landmark" optional>
                <input id="co-landmark" value={details.landmark} onChange={bind('landmark')} />
              </Field>
            </div>
          </div>
        ) : (
          <p className="co-reveal co-pickup" key="pickup">
            Collect from {site.address.line1}, {site.address.line2} – {site.address.pincode}.
          </p>
        )}
      </fieldset>
      <fieldset className="co-card">
        <legend>
          <span className="co-num">3</span> Payment
        </legend>
        <div className="co-choices">
          <ChoiceRadio
            name="payment"
            value="cod"
            current={details.payment}
            onChange={bind('payment')}
            title={paymentLabels.cod}
            note="Pay when it arrives"
          />
          <ChoiceRadio
            name="payment"
            value="upi"
            current={details.payment}
            onChange={bind('payment')}
            title={paymentLabels.upi}
            note="Scan and pay on arrival"
          />
          {canPayOnline && (
            <ChoiceRadio
              name="payment"
              value="online"
              current={details.payment}
              onChange={bind('payment')}
              title={paymentLabels.online}
              note="UPI, card or netbanking, secured by Razorpay"
            />
          )}
        </div>
        {canPayOnline && details.payment === 'online' && (
          <div className="co-row co-reveal">
            <Field id="stateCode" label="State" error={errors.stateCode}>
              <select id="co-stateCode" value={details.stateCode || '33'} onChange={bind('stateCode')}>
                {GST_STATES.map(([code, label]) => (
                  <option key={code} value={code}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field id="email" label="Email for the receipt" optional error={errors.email}>
              <input id="co-email" type="email" value={details.email || ''} onChange={bind('email')} autoComplete="email" />
            </Field>
          </div>
        )}
        <Field id="notes" label="Notes for us" optional>
          <textarea
            id="co-notes"
            rows={2}
            value={details.notes}
            onChange={bind('notes')}
            placeholder="Preferred delivery time, bulk requirement…"
          />
        </Field>
      </fieldset>
    </div>
  );
}
