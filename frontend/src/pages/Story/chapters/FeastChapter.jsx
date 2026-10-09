export default function FeastChapter() {
  return (
    <section className="ch ch--feast" aria-label="Tradition served every day">
      <div className="ch__stage">
        <div className="feast__plate">
          <img
            src="/images/chapter-feast.webp"
            alt="A long royal dining table laid with rice and dishes before a temple"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/chapter-feast.webp"
            alt=""
            aria-hidden="true"
            className="feast__blur"
            loading="lazy"
            decoding="async"
          />
          <div className="feast__steam" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>
        </div>
        <div className="feast__warm" aria-hidden="true" />
        <div className="ch__copy ch__copy--bottom">
          <h2 className="ch__title">Tradition Served Every Day.</h2>
          <p className="ch__sub">The heart of every meal.</p>
        </div>
      </div>
    </section>
  );
}
