import { useEffect, useState } from 'react';
import SectionHeading from '../../components/common/SectionHeading.jsx';
import { prefersReducedMotion } from '../../lib/motion.js';
import { reviews } from './reviews.js';

// Seconds each review stays up before the next one comes in.
const ADVANCE_MS = 6000;

// Customer reviews: the heading, then one review at a time in a card centred
// beneath it. The review moves on by itself, pauses while hovered or focused,
// and can be stepped through with the arrows or the dots.
export default function Reviews() {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const count = reviews.length;
  const go = (step) => setIndex((i) => (i + step + count) % count);

  // Moves on by itself, unless paused or the visitor prefers no motion.
  useEffect(() => {
    if (paused || prefersReducedMotion()) return;
    const t = setTimeout(() => go(1), ADVANCE_MS);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, paused]);

  return (
    <section className="section reviews" id="reviews">
      <div className="container reviews__layout">
        <SectionHeading title="What our customers say" center />

        <div
          className="reviews__stage"
          onMouseEnter={() => setPaused(true)}
          onMouseLeave={() => setPaused(false)}
          onFocus={() => setPaused(true)}
          onBlur={() => setPaused(false)}
        >
          {/* All the reviews sit stacked in one card, only the current one
              showing. The card is as tall as the longest review, so it never
              jumps in size as they change, and each one fades across in place. */}
          <div className="quote quote--feature" aria-live="polite">
            <span className="quote__mark" aria-hidden="true">
              “
            </span>
            <div className="quote__stack">
              {reviews.map((r, i) => (
                <figure
                  key={r.name}
                  className={`quote__slide${i === index ? ' is-on' : ''}`}
                  aria-hidden={i !== index || undefined}
                >
                  <div className="quote__stars" aria-label="5 out of 5">
                    ★★★★★
                  </div>
                  <blockquote>{r.quote}</blockquote>
                  <figcaption>
                    <span className="quote__avatar" aria-hidden="true">
                      {r.name.charAt(0)}
                    </span>
                    <span className="quote__who">
                      <strong>{r.name}</strong>
                      <span>{r.city}</span>
                    </span>
                    <span className="quote__product">{r.product}</span>
                  </figcaption>
                </figure>
              ))}
            </div>
          </div>

          <div className="reviews__nav">
            <button type="button" className="reviews__arrow" onClick={() => go(-1)} aria-label="Previous review">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M19 12H5M11 6l-6 6 6 6" />
              </svg>
            </button>
            <div className="reviews__dots" role="tablist" aria-label="Reviews">
              {reviews.map((r, i) => (
                <button
                  type="button"
                  key={r.name}
                  role="tab"
                  aria-selected={i === index}
                  aria-label={`Review ${i + 1} of ${count}`}
                  className={`reviews__dot${i === index ? ' is-on' : ''}`}
                  onClick={() => setIndex(i)}
                />
              ))}
            </div>
            <button type="button" className="reviews__arrow" onClick={() => go(1)} aria-label="Next review">
              <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
                <path d="M5 12h14M13 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
