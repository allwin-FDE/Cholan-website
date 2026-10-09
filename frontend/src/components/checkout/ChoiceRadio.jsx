// Radio card (original `Hm`).
export default function ChoiceRadio({ name, value, current, onChange, title, note }) {
  return (
    <label className={`co-choice${current === value ? ' is-on' : ''}`}>
      <input
        type="radio"
        name={name}
        value={value}
        checked={current === value}
        onChange={onChange}
      />
      <span className="co-choice__dot" aria-hidden="true" />
      <span className="co-choice__text">
        <strong>{title}</strong>
        <small>{note}</small>
      </span>
    </label>
  );
}
