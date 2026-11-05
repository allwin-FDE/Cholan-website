import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Seo from '../../components/common/Seo.jsx';
import PostMain from '../../components/blog/PostMain.jsx';
import Comments from '../../components/blog/Comments.jsx';
import { absoluteUrl } from '../../config/seo.js';
import { site } from '../../config/site.js';
import { fetchComments, fetchPost, fetchPosts, hasBackend } from '../../lib/api.js';
import NotFound from '../NotFound';

// /blog/:slug — one post, in the same layout every time (PostMain.jsx), then
// sharing, the next and previous posts, and comments.
export default function Post() {
  const { slug } = useParams();
  const [post, setPost] = useState(undefined); // undefined loading, null not found
  const [all, setAll] = useState([]);
  const [comments, setComments] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!hasBackend) return setPost(null);
    let live = true;
    setPost(undefined);
    setComments(null);
    fetchPost(slug)
      .then((p) => live && setPost(p))
      .catch(() => live && setPost(null));
    fetchPosts()
      .then((list) => live && setAll(list))
      .catch(() => {});
    fetchComments(slug)
      .then((c) => live && setComments(c))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [slug]);

  if (post === null) return <NotFound />;
  if (post === undefined) {
    return (
      <section className="section post">
        <div className="container post__wrap" aria-busy="true">
          <div className="post-skeleton" />
        </div>
      </section>
    );
  }

  const url = absoluteUrl(`/blog/${post.slug}`);
  const index = all.findIndex((p) => p.slug === post.slug);
  const newer = index > 0 ? all[index - 1] : null;
  const older = index >= 0 && index < all.length - 1 ? all[index + 1] : null;
  const share = encodeURIComponent(`${post.title} — ${url}`);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt('Copy this link:', url);
    }
  };

  const schema = [
    {
      '@context': 'https://schema.org',
      '@type': 'BlogPosting',
      headline: post.title,
      description: post.seoDescription || post.excerpt,
      image: post.coverUrl || undefined,
      datePublished: post.publishAt,
      dateModified: post.updatedAt || post.publishAt,
      author: { '@type': 'Organization', name: post.author || site.name },
      publisher: { '@id': `${absoluteUrl('/')}#business` },
      mainEntityOfPage: url,
      inLanguage: post.language === 'ta' ? 'ta-IN' : 'en-IN',
      keywords: (post.tags || []).join(', ') || undefined,
    },
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: [
        { '@type': 'ListItem', position: 1, name: 'Home', item: absoluteUrl('/') },
        { '@type': 'ListItem', position: 2, name: 'Blog', item: absoluteUrl('/blog') },
        { '@type': 'ListItem', position: 3, name: post.title, item: url },
      ],
    },
  ];
  if (post.recipe?.ingredients?.length) {
    schema.push({
      '@context': 'https://schema.org',
      '@type': 'Recipe',
      name: post.title,
      image: post.coverUrl || undefined,
      description: post.seoDescription || post.excerpt,
      recipeIngredient: post.recipe.ingredients,
      recipeYield: post.recipe.servings || undefined,
      recipeCuisine: post.recipe.cuisine || undefined,
      cookingMethod: post.recipe.method || undefined,
      author: { '@type': 'Organization', name: post.author || site.name },
      datePublished: post.publishAt,
      aggregateRating: comments?.ratingCount
        ? { '@type': 'AggregateRating', ratingValue: comments.ratingAverage, reviewCount: comments.ratingCount }
        : undefined,
    });
  }

  return (
    <>
      <Seo
        title={post.seoTitle || post.title}
        description={post.seoDescription || post.excerpt || post.title}
        path={`/blog/${post.slug}`}
        image={post.coverUrl || undefined}
        type="article"
        schema={schema}
      />
      <div className="post-page">
        <nav className="post-crumbs container" aria-label="Breadcrumb">
          <Link to="/">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M4 11l8-7 8 7M6 9.5V20h12V9.5M10 20v-6h4v6" />
            </svg>
            Home
          </Link>
          <span aria-hidden="true">›</span>
          <Link to="/blog">Blog</Link>
          <span aria-hidden="true">›</span>
          <span aria-current="page">{post.title}</span>
        </nav>
        <div className="container post-layout">
          <article className="post-article">
            <PostMain post={post} rating={comments} commentCount={comments?.comments.length || 0} />

            <div className="post__share">
              <span>Share this post</span>
              <a href={`https://wa.me/?text=${share}`} target="_blank" rel="noopener noreferrer">
                WhatsApp
              </a>
              <a href={`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer">
                Facebook
              </a>
              <button type="button" onClick={copy}>
                {copied ? 'Link copied' : 'Copy link'}
              </button>
            </div>

            {(newer || older) && (
              <nav className="post-nav" aria-label="More posts">
                {older && (
                  <Link to={`/blog/${older.slug}`} className="post-nav__prev">
                    {older.coverUrl && <img src={older.coverUrl} alt="" loading="lazy" />}
                    <span>
                      <small>Previous</small>
                      <strong>{older.title}</strong>
                    </span>
                  </Link>
                )}
                {newer && (
                  <Link to={`/blog/${newer.slug}`} className="post-nav__next">
                    <span>
                      <small>Next</small>
                      <strong>{newer.title}</strong>
                    </span>
                    {newer.coverUrl && <img src={newer.coverUrl} alt="" loading="lazy" />}
                  </Link>
                )}
              </nav>
            )}

            <aside className="post__cta">
              <div>
                <strong>Want to try the rice in this post?</strong>
                <p>Call or WhatsApp {site.phone}, or send us an enquiry. Packed fresh against your order.</p>
              </div>
              <Link to="/contact" className="btn btn--primary">
                Send an enquiry
              </Link>
            </aside>

            <Comments key={post.slug} slug={post.slug} data={comments} isRecipe={Boolean(post.recipe)} />
          </article>
        </div>
      </div>
    </>
  );
}
