import { fieldMotes } from '../storyData.js';

export default function FieldsChapter() {
  return (
    <section className="ch ch--fields" aria-label="Where every grain begins">
      <div className="ch__stage">
        <div className="fields__plate">
          <img
            src="/images/chapter-field.webp"
            alt="Paddy fields at sunrise beside a village homestead"
            loading="lazy"
            decoding="async"
          />
        </div>
        <div className="fields__haze" aria-hidden="true" />
        <div className="fields__sun" aria-hidden="true" />
        <div className="fields__motes" aria-hidden="true">
          {fieldMotes.map((mote, i) => (
            <span
              key={i}
              className="fields__mote"
              style={{ left: `${mote.x}%`, top: `${mote.y}%`, '--s': mote.s }}
            />
          ))}
        </div>
        <div className="ch__copy ch__copy--left">
          <h2 className="ch__title">Where Every Grain Begins.</h2>
          <p className="ch__sub">Carefully grown. Patiently nurtured.</p>
        </div>
      </div>
    </section>
  );
}
