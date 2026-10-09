import { Link, useParams } from 'react-router-dom';
import PageHero from '../components/common/PageHero';
import { policies } from '../data/policies';
import NotFound from './NotFound';

export default function Policy() {
  const { slug } = useParams();
  const policy = policies[slug];
  if (!policy) return <NotFound />;

  return (
    <>
      <PageHero title={policy.title} lede={policy.lede} />
      <section className="section">
        <div className="container policy">
          <p className="policy__note">
            <strong>Placeholder text.</strong> Replace this with your own reviewed policy before the
            site goes live.
          </p>
          {policy.sections.map((section) => (
            <div key={section.h} className="policy__block">
              <h2>{section.h}</h2>
              <p>{section.p}</p>
            </div>
          ))}
          <div className="policy__foot">
            <p className="muted">Last updated: September 2026</p>
            <Link to="/contact" className="btn btn--ghost btn--sm">
              Questions? Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
