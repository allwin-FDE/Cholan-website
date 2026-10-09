export default function FamilyChapter() {
  return (
    <section className="ch ch--family" aria-label="From our fields to your table">
      <div className="ch__stage">
        <div className="family__centre">
          <img
            src="/images/banana-leaf.webp"
            alt=""
            aria-hidden="true"
            className="family__leaf"
            loading="lazy"
            decoding="async"
          />
          <div className="family__rice" aria-hidden="true">
            <span className="family__mound" />
            <div className="family__steam">
              <span />
              <span />
              <span />
            </div>
          </div>
        </div>
        <div className="ch__copy ch__copy--centre">
          <h2 className="ch__title">From Our Fields to Your Table.</h2>
          <p className="ch__sub">Made for moments that bring people together.</p>
        </div>
      </div>
    </section>
  );
}
