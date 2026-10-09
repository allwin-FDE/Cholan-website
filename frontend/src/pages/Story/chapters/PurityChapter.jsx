export default function PurityChapter() {
  return (
    <section className="ch ch--purity" aria-label="Purity within">
      <div className="ch__stage">
        <div className="ch__copy ch__copy--left">
          <h2 className="ch__title">Purity Within.</h2>
          <p className="ch__sub">What matters is what remains.</p>
        </div>
        <div className="purity__centre">
          <div className="purity__glow" aria-hidden="true" />
          <img
            src="/images/purity-half-l.webp"
            alt=""
            aria-hidden="true"
            className="purity__half purity__half--l"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/purity-half-r.webp"
            alt=""
            aria-hidden="true"
            className="purity__half purity__half--r"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/purity-grain.webp"
            alt="A golden husk opening to reveal the white rice grain inside"
            className="purity__grain"
            loading="lazy"
            decoding="async"
          />
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <span key={i} className="purity__chaff" style={{ '--i': i }} aria-hidden="true" />
          ))}
        </div>
        <div className="ch__mask ch__mask--flood" aria-hidden="true" />
      </div>
    </section>
  );
}
