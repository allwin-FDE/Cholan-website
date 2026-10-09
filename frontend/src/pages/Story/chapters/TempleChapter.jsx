export default function TempleChapter() {
  return (
    <section className="ch ch--temple" aria-label="A legacy that begins here">
      <div className="ch__stage">
        <div className="temple__warm" aria-hidden="true" />
        <div className="temple__plate">
          <div className="temple__glow" aria-hidden="true" />
          <img
            src="/images/chapter-gopuram.webp"
            alt="A South Indian temple gateway, its doorway open to the light beyond"
            className="temple__img"
            fetchPriority="high"
          />
        </div>
        <div className="ch__copy temple__copy">
          <h1 className="ch__title">A Legacy That Begins Here</h1>
        </div>
        <div className="ch__mask" aria-hidden="true" />
      </div>
    </section>
  );
}
