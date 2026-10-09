// Labelled form field with optional error message (original `Vm`). The control's id must be `co-${id}`.
export default function Field({ id, label, error, optional, children }) {
  return (
    <div className={`co-field${error ? ' co-field--error' : ''}`}>
      <label htmlFor={`co-${id}`}>
        {label}
        {optional ? (
          <span className="co-optional"> (optional)</span>
        ) : (
          <span aria-hidden="true"> *</span>
        )}
      </label>
      {children}
      {error && (
        <span className="co-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}
