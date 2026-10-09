import { packGrains } from '../storyData.js';

export default function PackChapter() {
  return (
    <section className="ch ch--pack" aria-label="From paddy to pack">
      <div className="ch__stage">
        <div className="ch__copy ch__copy--top">
          <h2 className="ch__title">From Paddy to Pack.</h2>
          <p className="ch__sub">Handled with care at every stage.</p>
        </div>
        <div className="pack__floor">
          <div className="pack__stream" aria-hidden="true">
            {packGrains.map((grain) => (
              <span key={grain.i} className="pack__grain" style={{ '--s': grain.s }} />
            ))}
          </div>
          <img
            src="/images/stage-karikalan.webp"
            alt="Karikalan rice pack"
            className="pack__bag pack__bag--l"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/stage-rajabogam.webp"
            alt="Cholan Rajabogam rice pack"
            className="pack__bag pack__bag--m"
            loading="lazy"
            decoding="async"
          />
          <img
            src="/images/stage-gramiyam.webp"
            alt="Gramiyam Ponni rice pack"
            className="pack__bag pack__bag--r"
            loading="lazy"
            decoding="async"
          />
        </div>
        <p className="pack__tag">Made for Every Home.</p>
      </div>
    </section>
  );
}
