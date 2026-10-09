import { useRef } from 'react';
import { useStoryScroll } from './useStoryScroll.js';
import TempleChapter from './chapters/TempleChapter.jsx';
import KingChapter from './chapters/KingChapter.jsx';
import FieldsChapter from './chapters/FieldsChapter.jsx';
import SeedChapter from './chapters/SeedChapter.jsx';
import PurityChapter from './chapters/PurityChapter.jsx';
import PackChapter from './chapters/PackChapter.jsx';
import FeastChapter from './chapters/FeastChapter.jsx';
import FamilyChapter from './chapters/FamilyChapter.jsx';
import ProductChapter from './chapters/ProductChapter.jsx';
import FooterChapter from './chapters/FooterChapter.jsx';

// /story scroll-driven brand film (original `Mf`).
export default function Story() {
  const ref = useRef(null);
  useStoryScroll(ref);
  return (
    <div className="story" ref={ref}>
      <TempleChapter />
      <KingChapter />
      <FieldsChapter />
      <SeedChapter />
      <PurityChapter />
      <PackChapter />
      <FeastChapter />
      <FamilyChapter />
      <ProductChapter />
      <FooterChapter />
    </div>
  );
}
