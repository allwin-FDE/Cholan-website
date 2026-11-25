import HeroCurtain from './HeroCurtain.jsx';
import RailStory from './RailStory.jsx';
import RiceHall from './RiceHall.jsx';
import FeaturedProducts from './FeaturedProducts.jsx';
import BulkSection from './BulkSection.jsx';
import Reviews from './Reviews.jsx';
import Seo from '../../components/common/Seo.jsx';
import { pages, businessSchema, websiteSchema } from '../../config/seo.js';

// Home page (original `wf`). The products come straight after the hero (the
// audit of 2026-11-23: they sat seven screens down, after the train story).
export default function Home() {
  return (
    <>
      <Seo {...pages.home} schema={[businessSchema, websiteSchema]} />
      <HeroCurtain />
      <FeaturedProducts />
      <RailStory />
      <RiceHall />
      <BulkSection />
      <Reviews />
    </>
  );
}
