import HeroCurtain from './HeroCurtain.jsx';
import RailStory from './RailStory.jsx';
import RiceHall from './RiceHall.jsx';
import FeaturedProducts from './FeaturedProducts.jsx';
import BulkSection from './BulkSection.jsx';
import Reviews from './Reviews.jsx';
import Seo from '../../components/common/Seo.jsx';
import { pages, businessSchema, websiteSchema } from '../../config/seo.js';

// Home page (original `wf`).
export default function Home() {
  return (
    <>
      <Seo {...pages.home} schema={[businessSchema, websiteSchema]} />
      <HeroCurtain />
      <RailStory />
      <RiceHall />
      <FeaturedProducts />
      <BulkSection />
      <Reviews />
    </>
  );
}
