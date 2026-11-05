import { DEFAULT_IMAGE, absoluteUrl, pageTitle } from '../../config/seo.js';

// A page's search and sharing details. React 19 lifts <title>, <meta> and
// <link> into the document head wherever they are rendered, so each page
// simply renders this at the top. `schema` is one or more schema.org objects
// for Google's structured data; `noindex` keeps a page out of search results.
export default function Seo({ title, description, path, image = DEFAULT_IMAGE, type = 'website', schema, noindex }) {
  const fullTitle = pageTitle(title);
  const url = path ? absoluteUrl(path) : null;
  const schemas = schema ? [].concat(schema).filter(Boolean) : [];

  return (
    <>
      <title>{fullTitle}</title>
      {description && <meta name="description" content={description} />}
      {noindex && <meta name="robots" content="noindex" />}
      {url && <link rel="canonical" href={url} />}

      <meta property="og:type" content={type} />
      <meta property="og:site_name" content="Cholan Rice and Millet Shop" />
      <meta property="og:title" content={fullTitle} />
      {description && <meta property="og:description" content={description} />}
      {url && <meta property="og:url" content={url} />}
      <meta property="og:image" content={image} />
      <meta property="og:locale" content="en_IN" />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={fullTitle} />
      {description && <meta name="twitter:description" content={description} />}
      <meta name="twitter:image" content={image} />

      {schemas.map((s, i) => (
        <script
          key={i}
          type="application/ld+json"
          // Serialised data, not markup: "<" is escaped so it cannot end the tag.
          dangerouslySetInnerHTML={{ __html: JSON.stringify(s).replace(/</g, '\\u003c') }}
        />
      ))}
    </>
  );
}
