import { seedBeats } from '../storyData.js';

export default function SeedChapter() {
  return (
    <section className="ch ch--seed" aria-label="Seed to paddy">
      <div className="ch__stage">
        <div className="seed__grid">
          <div className="seed__copy">
            {seedBeats.map((beat, i) => (
              <div
                key={beat.n}
                className="seed__beat"
                style={{ visibility: i === 0 ? 'visible' : 'hidden' }}
              >
                <span className="ch__eyebrow">{beat.n}</span>
                <h2 className="ch__title ch__title--sm">{beat.title}</h2>
                <p className="ch__sub">{beat.note}</p>
              </div>
            ))}
          </div>
          <div className="seed__centre">
            <div className="seed__stack">
              <img
                src="/images/story-seed-husk.webp"
                alt="A single rice seed"
                className="seed__husk"
                loading="lazy"
                decoding="async"
              />
              <img
                src="/images/story-seed-sprout.webp"
                alt=""
                aria-hidden="true"
                className="seed__sprout"
                loading="lazy"
                decoding="async"
              />
              <div className="seed__stalk" aria-hidden="true">
                <img src="/images/story-seed-sprout.webp" alt="" className="seed__stalk-body" />
                <span className="seed__ear seed__ear--1" />
                <span className="seed__ear seed__ear--2" />
                <span className="seed__ear seed__ear--3" />
              </div>
            </div>
          </div>
          <ol className="seed__rail" aria-hidden="true">
            {seedBeats.map((beat, i) => (
              <li key={beat.n} className="seed__mark" style={{ opacity: i === 0 ? 1 : 0.28 }}>
                {beat.n} / 03
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
