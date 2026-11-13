import DOMPurify from 'dompurify';
import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { site } from '../../config/site.js';
import { getProduct } from '../../lib/products.js';
import PostBody from './PostBody.jsx';
import { cleanDocHtml } from '../../lib/docHtml.js';

const RATIO_CSS = { '1:1': '1 / 1', '4:5': '4 / 5', '16:9': '16 / 9', free: 'auto' };

export const postDate = (iso) =>
  iso ? new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }) : '';

// Dark or light text, whichever reads on this background.
export function inkFor(hex) {
  const n = parseInt(String(hex).slice(1), 16);
  const [r, g, b] = [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  return 0.299 * r + 0.587 * g + 0.114 * b > 150 ? '#1b2a20' : '#ffffff';
}

const HASHTAGS = /#[\p{L}\p{M}\p{N}_]{2,30}/gu;

// The written content, cleaned again here so that only the editor's own
// formatting can ever reach the page. Links open in a new tab and #hashtags
// are picked out.
export function richHtml(html) {
  const clean = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['p', 'h2', 'h3', 'h4', 'blockquote', 'ul', 'ol', 'li', 'br', 'hr', 'strong', 'em', 'u', 's', 'span', 'a', 'mark', 'pre', 'code', 'img', 'div', 'iframe'],
    ALLOWED_ATTR: ['data-font', 'data-size', 'data-color', 'data-align', 'href', 'src', 'alt', 'width', 'height', 'allowfullscreen', 'data-youtube-video'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('a').forEach((a) => {
    a.setAttribute('target', '_blank');
    a.setAttribute('rel', 'noopener noreferrer');
  });
  doc.querySelectorAll('iframe').forEach((frame) => {
    if (!/^https:\/\/www\.youtube(-nocookie)?\.com\/embed\//.test(frame.getAttribute('src') || '')) frame.remove();
    else frame.setAttribute('loading', 'lazy');
  });
  doc.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const texts = [];
  while (walker.nextNode()) {
    const node = walker.currentNode;
    if (node.nodeValue.includes('#') && !node.parentElement.closest('a')) texts.push(node);
  }
  for (const node of texts) {
    const part = doc.createElement('span');
    part.innerHTML = node.nodeValue
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(HASHTAGS, (tag) => `<span class="rich__hashtag">${tag}</span>`);
    node.replaceWith(...part.childNodes);
  }
  return doc.body.innerHTML;
}

// ---- Small icons, in the page's own green and gold ----
const Svg = ({ children, className }) => (
  <svg className={className} viewBox="0 0 24 24" aria-hidden="true" focusable="false" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {children}
  </svg>
);
const BulbIcon = () => (
  <Svg>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3Z" />
  </Svg>
);
const ClipboardIcon = () => (
  <Svg>
    <path d="M9 4h6v3H9zM9 5.5H6V21h12V5.5h-3M9 12l2 2 4-4M9 17.5h6" />
  </Svg>
);

export function Stars({ value, label }) {
  const rounded = Math.round(value || 0);
  return (
    <span className="stars" role="img" aria-label={label || `${value || 0} out of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span key={n} className={n <= rounded ? 'is-on' : ''} aria-hidden="true">
          ★
        </span>
      ))}
    </span>
  );
}

// The other main pictures: compact tiles that open large when pressed.
function Gallery({ media, ratio, alt }) {
  const [open, setOpen] = useState(null);
  useEffect(() => {
    if (open === null) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(null);
      if (e.key === 'ArrowRight') setOpen((i) => (i + 1) % media.length);
      if (e.key === 'ArrowLeft') setOpen((i) => (i - 1 + media.length) % media.length);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, media.length]);

  return (
    <>
      <div
        className={`gallery gallery--${Math.min(media.length, 3)}${ratio === 'free' ? ' gallery--free' : ''}`}
        style={{ '--gallery-ratio': RATIO_CSS[ratio] || RATIO_CSS['4:5'] }}
      >
        {media.map((photo, i) => (
          <button key={photo.url} type="button" onClick={() => setOpen(i)} aria-label={`Open picture ${i + 1} of ${media.length}`}>
            {/* A free picture keeps its own shape; its size holds the space while it loads. */}
            <img
              src={photo.url}
              alt={`${alt} — picture ${i + 2}`}
              loading="lazy"
              style={ratio === 'free' && photo.width ? { aspectRatio: `${photo.width} / ${photo.height}` } : undefined}
            />
          </button>
        ))}
      </div>
      {open !== null && (
        <div className="lightbox" role="dialog" aria-modal="true" aria-label="Picture" onClick={() => setOpen(null)}>
          <img src={media[open].url} alt={`${alt} — picture ${open + 2}`} onClick={(e) => e.stopPropagation()} />
          <button type="button" className="lightbox__close" onClick={() => setOpen(null)} aria-label="Close">
            ×
          </button>
          {media.length > 1 && (
            <>
              <button
                type="button"
                className="lightbox__nav lightbox__nav--prev"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open - 1 + media.length) % media.length);
                }}
                aria-label="Previous picture"
              >
                ‹
              </button>
              <button
                type="button"
                className="lightbox__nav lightbox__nav--next"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen((open + 1) % media.length);
                }}
                aria-label="Next picture"
              >
                ›
              </button>
            </>
          )}
        </div>
      )}
    </>
  );
}

function Actions({ post, preview }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const download = async () => {
    setBusy(true);
    setFailed(false);
    try {
      const { downloadPostPdf } = await import('../../lib/postPdf.js');
      await downloadPostPdf(post);
    } catch (error) {
      console.error('[pdf]', error);
      setFailed(true);
    }
    setBusy(false);
  };
  return (
    <div className="post-actions">
      <button type="button" className="post-actions__pdf" onClick={download} disabled={busy || preview} title={preview ? 'Available once the blog is live' : undefined}>
        {busy ? 'Preparing PDF…' : 'Download PDF'}
      </button>
      {!preview && (
        <button type="button" className="post-actions__link" onClick={() => window.print()}>
          Print
        </button>
      )}
      {post.recipe?.ingredients?.length > 0 && (
        <a href="#recipe" className="post-actions__link">
          Jump to recipe
        </a>
      )}
      {failed && (
        <span className="post-actions__error" role="alert">
          The PDF could not be made. Please try again.
        </span>
      )}
    </div>
  );
}

function RecipeCard({ post, rating }) {
  const { recipe } = post;
  const times = [
    ['Total time', recipe.total],
    ['Prep time', recipe.prep],
    ['Cook time', recipe.cook],
    ['Serves', recipe.servings],
    ['Method', recipe.method],
    ['Cuisine', recipe.cuisine],
  ].filter(([, value]) => value);
  return (
    <section className="recipe" id="recipe">
      <h2>The recipe</h2>
      {rating?.ratingCount > 0 && (
        <p className="recipe__rating">
          <Stars value={rating.ratingAverage} /> {rating.ratingAverage} from {rating.ratingCount} {rating.ratingCount === 1 ? 'review' : 'reviews'}
        </p>
      )}
      {times.length > 0 && (
        <dl className="recipe__times">
          {times.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {recipe.ingredients?.length > 0 && (
        <div className="recipe__ingredients">
          <h3>Ingredients</h3>
          <ul>
            {recipe.ingredients.map((line, i) => (
              <li key={`${line}-${i}`}>{line}</li>
            ))}
          </ul>
        </div>
      )}
      {recipe.notes && (
        <div className="recipe__notes">
          <h3>Notes</h3>
          <p>{recipe.notes}</p>
        </div>
      )}
    </section>
  );
}

// The same layout for every blog: picture, heading, introduction, key
// takeaway, content, quick tips, conclusion, and a closing invitation. A part
// left empty simply does not show. The same on the website, in the poster's
// preview and on the approval screen; `preview` keeps links from taking the
// person away from their work.
export default function PostMain({ post, preview, rating, commentCount }) {
  const short = post.format === 'post';
  const rich = useMemo(() => (post.captionHtml ? richHtml(post.captionHtml) : ''), [post.captionHtml]);
  // An uploaded Word document is the content, shown as it was written.
  const doc = useMemo(() => (post.docHtml ? cleanDocHtml(post.docHtml) : ''), [post.docHtml]);
  const tinted = post.bgColor ? { background: post.bgColor, color: inkFor(post.bgColor) } : undefined;
  const products = (post.productIds || []).map(getProduct).filter(Boolean);
  const hasRecipe = short && post.recipe;
  // A post from /admin leads with its first main picture; its cover is for its
  // card on the blog page, the sidebar and sharing. A long article leads with
  // its cover, the only picture it has.
  const [hero, ...more] = short ? post.media || [] : [post.coverUrl && { url: post.coverUrl }];
  const subtitle = short ? post.subtitle : post.excerpt;

  return (
    <div className="post-main" lang={post.language === 'ta' ? 'ta' : undefined}>
      {hero && (
        <figure className={`post-hero${post.heroRatio === 'free' ? ' post-hero--free' : ''}`}>
          <img src={hero.url} alt={post.coverAlt || post.title} />
        </figure>
      )}

      <div className="post-article__body">
        <div className="post-meta">
          {post.category && (
            <span className="post-meta__cat">{post.category}</span>
          )}
          <span className="post-meta__facts">
            {post.publishAt && (
              <span>{postDate(post.publishAt)}</span>
            )}
            {post.readingMinutes > 0 && (
              <span>{post.readingMinutes} min read</span>
            )}
            {commentCount > 0 && (
              <a href="#comments">
                {commentCount} {commentCount === 1 ? 'comment' : 'comments'}
              </a>
            )}
          </span>
        </div>

        <h1 className="post-title">{post.title}</h1>
        {subtitle && <p className="post-subtitle">{subtitle}</p>}

        <Actions post={post} preview={preview} />

        <div className="post-divider" aria-hidden="true">
          <span />
        </div>

        {post.intro && <p className="post-intro">{post.intro}</p>}

        {post.takeaway && (
          <aside className="post-takeaway">
            <span className="post-takeaway__icon">
              <BulbIcon />
            </span>
            <div>
              <h2>Key Takeaway</h2>
              <p>{post.takeaway}</p>
            </div>
          </aside>
        )}

        {hasRecipe && <RecipeCard post={post} rating={rating} />}

        {doc ? (
          <div className="post-doc" dangerouslySetInnerHTML={{ __html: doc }} />
        ) : short ? (
          rich && (
            <div className={`rich post-body${tinted ? ' rich--tinted' : ''}`} style={tinted}>
              <div dangerouslySetInnerHTML={{ __html: rich }} />
            </div>
          )
        ) : (
          <PostBody html={post.contentHtml} />
        )}

        {more.length > 0 && <Gallery media={more} ratio={post.ratio} alt={post.title} />}

        {post.tips?.length > 0 && (
          <aside className="post-tips">
            <div className="post-tips__head">
              <ClipboardIcon />
              <h2>Quick Tips</h2>
            </div>
            <ul>
              {post.tips.map((tip, i) => (
                <li key={`${tip}-${i}`}>
                  <span aria-hidden="true">✓</span> {tip}
                </li>
              ))}
            </ul>
          </aside>
        )}

        {post.conclusion && (
          <section className="post-conclusion">
            <h2>Conclusion</h2>
            <p>{post.conclusion}</p>
          </section>
        )}

        {products.length > 0 && (
          <div className="post-products">
            <h2>Rice in this post</h2>
            <ul>
              {products.map((product) => (
                <li key={product.id}>
                  {product.image && <img src={product.image} alt="" loading="lazy" />}
                  {preview ? <strong>{product.name}</strong> : <Link to={`/products/${product.id}`}>{product.name}</Link>}
                  {preview ? (
                    <span className="post-products__enquire">Enquire</span>
                  ) : (
                    <Link className="post-products__enquire" to={`/contact?product=${product.id}`}>
                      Enquire
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Asking for photos suits a recipe, not a guide. */}
        {hasRecipe && (
          <aside className="post-invite">
            <h2>Did you make this recipe?</h2>
            <p>Share a photo and tag us. We can’t wait to see what you’ve made!</p>
            {preview ? (
              <span className="post-invite__btn">Share Your Creation</span>
            ) : (
              <a className="post-invite__btn" href={site.social.instagram} target="_blank" rel="noopener noreferrer">
                Share Your Creation
              </a>
            )}
          </aside>
        )}

        {post.tags?.length > 0 && (
          <ul className="post__tags" aria-label="Tags">
            {post.tags.map((tag) => (
              <li key={tag}>{preview ? `#${tag}` : <Link to={`/blog?tag=${encodeURIComponent(tag)}`}>#{tag}</Link>}</li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
