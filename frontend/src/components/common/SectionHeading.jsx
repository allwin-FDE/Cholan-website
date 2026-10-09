// Eyebrow + h2 + lede block used at the top of most sections (original `Yd`).
export default function SectionHeading({ eyebrow, title, lede, center = false }) {
  return (
    <div className={`section-head${center ? ' section-head--center' : ''}`}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h2>{title}</h2>
      {lede && <p className="lede">{lede}</p>}
    </div>
  );
}
