export default function KingChapter() {
  return (
    <section className="ch ch--king" aria-label="Built on generations of tradition">
      <div className="ch__stage">
        <div className="king__haze" aria-hidden="true" />
        <figure className="ch__fig king__fig">
          <img
            src="/images/chapter-king.webp"
            alt="A Chola king walking toward a temple, seen from behind"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/chapter-king.webp"
            alt=""
            aria-hidden="true"
            className="king__cape"
            loading="lazy"
            decoding="async"
          />
        </figure>
        <div className="ch__copy ch__copy--left">
          <h2 className="ch__title">Built on Generations of Tradition.</h2>
          <p className="ch__sub">Before it reaches the table, every grain carries a story.</p>
        </div>
      </div>
    </section>
  );
}
