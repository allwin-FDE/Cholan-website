import { useRef } from 'react';
import { useSnapScroll, getSectionTop } from '../../hooks/useSnapScroll.js';
import { Icon, milletIcons } from '../../components/common/Icon.jsx';
import { templeBenefits } from './templeBenefits.js';

// Home "Why millets" section (original `hf`).
//
// Once a 271-frame canvas flyover over a temple, then that flight's final
// still. Now it carries no imagery at all: just type on a plain warm ground,
// so nothing sits behind the words.
export default function TempleSection() {
  const sectionRef = useRef(null);

  useSnapScroll(sectionRef, (direction, scrollY) => {
    const section = sectionRef.current;
    if (!section) return null;
    const top = getSectionTop(section);
    const bottom = top + section.offsetHeight;
    const entryTop = Math.round(section.getBoundingClientRect().top + scrollY - window.innerHeight);
    const at = (y) => Math.abs(scrollY - y) <= 2;
    return direction > 0
      ? at(top)
        ? bottom
        : scrollY > entryTop - 2 && scrollY < top
          ? top
          : scrollY > top && scrollY < bottom - 2
            ? bottom
            : null
      : at(top)
        ? entryTop
        : scrollY > top && scrollY <= bottom + window.innerHeight * 0.25
          ? top
          : scrollY > entryTop + 2 && scrollY < top
            ? entryTop
            : null;
  });

  return (
    <section className="millets" ref={sectionRef} aria-labelledby="millets-title">
      <div className="millets__paper" aria-hidden="true" />

      <div className="millets__inner">
        {/* section-head / eyebrow / lede are the hooks PageTransition animates. */}
        <header className="millets__head section-head">
          <h2 className="millets__title" id="millets-title">
            Why Millets
          </h2>
          <p className="millets__lede lede">
            Four reasons the native grain earned its place at the daily meal, long before
            anyone thought to measure it.
          </p>
        </header>

        <ol className="millets__list">
          {templeBenefits.map((benefit) => (
            <li key={benefit.n} className="millets__item">
              <span className="millets__mark" aria-hidden="true">
                <span className="millets__icon">
                  <Icon d={milletIcons[benefit.icon]} />
                </span>
                <span className="millets__n">{benefit.n}</span>
              </span>
              <div className="millets__body">
                {/* data-title duplicates the text for the shimmer overlay in
                    CSS; it is a pseudo-element, so it is not read out twice. */}
                <h3 className="millets__item-title" data-title={benefit.title}>
                  {benefit.title}
                </h3>
                <p className="millets__measure">{benefit.measure}</p>
                <p className="millets__text">{benefit.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
