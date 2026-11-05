import { Link, useParams } from 'react-router-dom';
import PageHero from '../components/common/PageHero';
import { policies } from '../data/policies';
import NotFound from './NotFound';
import Seo from '../components/common/Seo.jsx';

// Inline markup in the policy text (see data/policies.js): **bold**,
// [a link](/path), and [square brackets] alone for a detail still to be
// filled in, which is marked so it can't be missed.
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)]+\)|\[[^\]]+\])/;

function Text({ children }) {
  return children.split(INLINE).map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i}>{part.slice(2, -2)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return (
        <Link key={i} to={link[2]}>
          {link[1]}
        </Link>
      );
    }
    if (/^\[[^\]]+\]$/.test(part)) {
      return (
        <mark key={i} className="policy__todo">
          {part}
        </mark>
      );
    }
    return part;
  });
}

function Table({ head, rows }) {
  return (
    <div className="policy__table">
      <table>
        <thead>
          <tr>
            {head.map((cell) => (
              <th key={cell} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]}>
              {row.map((cell, i) => (
                // On phones each row stacks into a card; the column name
                // goes beside each value.
                <td key={i} data-label={head[i]}>
                  <Text>{cell}</Text>
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Body({ body }) {
  return body.map((block, i) => {
    if (typeof block === 'string') {
      return (
        <p key={i}>
          <Text>{block}</Text>
        </p>
      );
    }
    if (block.table) return <Table key={i} {...block.table} />;
    const List = block.steps ? 'ol' : 'ul';
    return (
      <List key={i}>
        {(block.list || block.steps).map((item, j) => (
          <li key={j}>
            <Text>{item}</Text>
          </li>
        ))}
      </List>
    );
  });
}

export default function Policy() {
  const { slug } = useParams();
  const policy = policies[slug];
  if (!policy) return <NotFound />;

  return (
    <>
      <Seo title={policy.title} description={`${policy.title} for Cholan Rice and Millet Shop, Coimbatore. ${policy.lede}`} path={`/policies/${slug}`} />
      <PageHero title={policy.title} lede={policy.lede} />
      <section className="section section--alt">
        <div className="container policy">
          {policy.draft && (
            <p className="policy__note">
              <strong>Placeholder text.</strong> Replace this with your own reviewed policy before
              the site goes live.
            </p>
          )}
          <div className="policy__intro">
            <p className="policy__updated">Last updated: {policy.updated}</p>
            <Body body={policy.intro} />
          </div>
          {policy.sections.map((section) => (
            <div key={section.h} className="policy__block">
              <h2>{section.h}</h2>
              <Body body={section.body} />
            </div>
          ))}
          <div className="policy__foot">
            <p className="muted">Last updated: {policy.updated}</p>
            <Link to="/contact" className="btn btn--ghost btn--sm">
              Questions? Contact us
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}
