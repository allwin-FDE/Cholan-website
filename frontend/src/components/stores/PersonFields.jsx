// Name and mobile number, asked before the store search (popup and /stores).
// errors: { name, phone } from checkPerson or the server.
export default function PersonFields({ id, person, onChange, errors = {}, disabled }) {
  const set = (key) => (e) => onChange({ ...person, [key]: e.target.value });
  return (
    <div className="field-row storeperson">
      <div className="field">
        <label htmlFor={`${id}-name`}>Your name</label>
        <input
          id={`${id}-name`}
          className="input"
          value={person.name}
          onChange={set('name')}
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
        <input
          id={`${id}-phone`}
          className="input"
          value={person.phone}
          onChange={set('phone')}
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="10-digit mobile"
          maxLength={16}
          disabled={disabled}
          aria-invalid={errors.phone ? 'true' : undefined}
          aria-describedby={errors.phone ? `${id}-phone-error` : undefined}
        />
        {errors.phone && (
          <p className="field__error" id={`${id}-phone-error`}>
            {errors.phone}
          </p>
        )}
      </div>
    </div>
  );
}
