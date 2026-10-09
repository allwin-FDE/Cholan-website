import HeroCurtain from './HeroCurtain.jsx';
import RailStory from './RailStory.jsx';
import TempleSection from './TempleSection.jsx';
import CategoryTiles from './CategoryTiles.jsx';
import FeaturedProducts from './FeaturedProducts.jsx';
import BulkSection from './BulkSection.jsx';
import Reviews from './Reviews.jsx';

// Home page (original `wf`).
export default function Home() {
  return (
    <>
      <HeroCurtain />
      <RailStory />
      <TempleSection />
      <CategoryTiles />
      <FeaturedProducts />
      <BulkSection />
      <Reviews />
    </>
  );
}
