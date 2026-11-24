// Name and mobile number, asked before the store search (popup and /stores).
// errors: { name, phone } from checkPerson or the server.

// The mobile box takes digits only, at most 10, with +91 shown in front.
// A pasted "+91 98765 43210" or "098765 43210" keeps just the 10 digits.
export function tenDigits(value) {
  let d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('91')) d = d.slice(2);
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1);
  return d.slice(0, 10);
}

export default function PersonFields({ id, person, onChange, errors = {}, disabled }) {
  const phone = tenDigits(person.phone);
  return (
    <div className="field-row storeperson">
      <div className="field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={person.name}
          onChange={(e) => onChange({ ...person, name: e.target.value })}
          autoComplete="name"
          maxLength={60}
          disabled={disabled}
          aria-invalid={errors.name ? 'true' : undefined}
          aria-describedby={errors.name ? `${id}-name-error` : undefined}
        />
        {errors.name && (
          <p className="field__error" id={`${id}-name-error`}>
            {errors.name}
          </p>
        )}
      </div>
      <div className="field">
        <label htmlFor={`${id}-phone`}>Mobile number</label>
        <div className={`storeperson__phone${disabled ? ' is-disabled' : ''}`}>
          <span className="storeperson__prefix" aria-hidden="true">
            +91
          </span>
          <input
            id={`${id}-phone`}
            className="input"
            value={phone}
            onChange={(e) => onChange({ ...person, phone: tenDigits(e.target.value) })}
            type="tel"
            inputMode="numeric"
            pattern="[0-9]{10}"
            autoComplete="tel-national"
            placeholder="10-digit number"
            disabled={disabled}
            aria-invalid={errors.phone ? 'true' : undefined}
            aria-describedby={`${id}-phone-hint${errors.phone ? ` ${id}-phone-error` : ''}`}
          />
        </div>
        <span className="visually-hidden" id={`${id}-phone-hint`}>
          10 digits, without +91
        </span>
        {errors.phone && (
          <p className="field__error" id={`${id}-phone-error`}>
            {errors.phone}
          </p>
        )}
      </div>
    </div>
  );
}
