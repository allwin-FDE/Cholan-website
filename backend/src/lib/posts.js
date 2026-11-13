// Blog posts, written in the dashboard and shown on /blog.
import { collection } from './firestore.js';
import { cleanDocHtml, docText } from './docHtml.js';

export const postsCollection = () => collection('posts');

const text = (value, max) => (typeof value === 'string' ? value.trim().slice(0, max) : '');

export const slugify = (value) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 90);

const STATUSES = ['draft', 'published', 'scheduled'];

export function cleanPost(body, origin) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  const title = text(input.title, 160);
  const slug = slugify(input.slug || title);
  const status = STATUSES.includes(input.status) ? input.status : 'draft';
  const contentHtml = typeof input.contentHtml === 'string' ? input.contentHtml.slice(0, 1_500_000) : '';
  // A Word document, when one was uploaded, is the content shown.
  const docHtml = cleanDocHtml(input.docHtml, origin);
  const words = (docHtml ? docText(docHtml) : contentHtml.replace(/<[^>]+>/g, ' ')).split(/\s+/).filter(Boolean).length;
  let publishAt = input.publishAt ? new Date(input.publishAt) : null;
  if (publishAt && Number.isNaN(publishAt.getTime())) publishAt = null;

  if (!title) errors.title = 'Give the post a title.';
  if (!slug) errors.slug = 'The web address needs at least one letter or number.';
  if (status !== 'draft' && words < 5) errors.contentHtml = 'Write the post before publishing it.';
  if (docHtml.length > MAX_DOC_HTML) errors.contentHtml = 'This Word document is too long. Please split it into two posts.';
  if (status === 'scheduled' && (!publishAt || publishAt.getTime() <= Date.now())) {
    errors.publishAt = 'Pick a date and time in the future to schedule the post.';
  }
  if (Object.keys(errors).length) return { errors };

  return {
    value: {
      title,
      slug,
      status,
      publishAt: (publishAt || (status === 'published' ? new Date() : null))?.toISOString() ?? null,
      excerpt: text(input.excerpt, 320),
      contentHtml,
      docHtml,
      coverUrl: text(input.coverUrl, 500),
      coverAlt: text(input.coverAlt, 160),
      heroRatio: heroRatio(input.heroRatio),
      category: text(input.category, 40),
      tags: (Array.isArray(input.tags) ? input.tags : [])
        .map((tag) => text(tag, 30))
        .filter(Boolean)
        .slice(0, 12),
      author: text(input.author, 80) || 'Cholan Rice and Millet Shop',
      language: input.language === 'ta' ? 'ta' : 'en',
      featured: Boolean(input.featured),
      allowComments: false,
      seoTitle: text(input.seoTitle, 70),
      seoDescription: text(input.seoDescription, 170),
      readingMinutes: Math.max(1, Math.round(words / 200)),
      words,
    },
  };
}

// ---- Posts sent from /admin: a cover, pictures, a title and written content ----
const RATIOS = ['1:1', '4:5', '16:9'];
// The picture at the top of a blog: cropped wide, or free (whole, as uploaded).
const HERO_RATIOS = ['5:2', 'free'];
const heroRatio = (value) => (HERO_RATIOS.includes(value) ? value : '5:2');
const MAX_PHOTOS = 10;
const MEDIA_PATH = /^https?:\/\/[^/]+(\/api\/media\/(?:dev_)?blog\/[\w.-]+)$/;
const HASHTAG = /#([\p{L}\p{M}\p{N}_]{2,30})/gu;
const MAX_CONTENT_HTML = 60_000;
// A Word document carries its look in every tag, so it may be far longer.
const MAX_DOC_HTML = 700_000;

// The written content keeps only these tags and attributes, whatever the
// browser sent. Every tag is rebuilt from what is allowed, not filtered.
const NAMED = /^[a-z]{1,20}$/;
const ALIGNED = { 'data-align': /^(left|center|right)$/ };
const WHOLE_NUMBER = /^\d{1,4}$/;
const YOUTUBE_EMBED = /^https:\/\/www\.youtube(?:-nocookie)?\.com\/embed\/[\w-]+(?:\?[\w=&;-]*)?$/;
const CONTENT_TAGS = {
  p: ALIGNED,
  h2: ALIGNED,
  h3: ALIGNED,
  h4: ALIGNED,
  blockquote: {},
  mark: {},
  pre: {},
  code: {},
  // A picture must be one uploaded here (see cleanTag), and a video YouTube's.
  img: { alt: /^[^"<>]{0,160}$/ },
  div: { 'data-youtube-video': /^$/ },
  iframe: { src: YOUTUBE_EMBED, width: WHOLE_NUMBER, height: WHOLE_NUMBER, allowfullscreen: /^(?:true)?$/ },
  ul: {},
  ol: {},
  li: {},
  strong: {},
  em: {},
  u: {},
  s: {},
  br: {},
  hr: {},
  span: { 'data-font': NAMED, 'data-size': NAMED, 'data-color': NAMED },
  a: { href: /^https?:\/\/[^\s"<>]+$/i },
};
const VOID = new Set(['br', 'hr', 'img']);

function cleanTag(tag, origin) {
  const match = /^<(\/?)([a-z0-9]+)((?:\s+[a-z-]+="[^"<>]*")*)\s*\/?>$/i.exec(tag);
  if (!match) return '';
  const name = match[2].toLowerCase();
  const allowed = CONTENT_TAGS[name];
  if (!allowed) return '';
  if (match[1]) return VOID.has(name) ? '' : `</${name}>`;
  const pairs = [...match[3].matchAll(/([a-z-]+)="([^"<>]*)"/gi)];
  const attrs = pairs
    .filter(([, key, value]) => allowed[key.toLowerCase()]?.test(value))
    .map(([, key, value]) => ` ${key.toLowerCase()}="${value}"`);
  if (name === 'iframe' && !attrs.some((attr) => attr.startsWith(' src='))) return '';
  if (name === 'img') {
    const src = ownMedia(pairs.find(([, key]) => key.toLowerCase() === 'src')?.[2], origin);
    return src ? `<img src="${src}"${attrs.join('')}>` : '';
  }
  return `<${name}${attrs.join('')}>`;
}

const cleanContentHtml = (html, origin) =>
  typeof html === 'string' ? html.replace(/<[^>]*>?/g, (tag) => cleanTag(tag, origin)) : '';
const contentText = (html) =>
  html
    .replace(/<\/(?:p|h2|h3|h4|li|blockquote|pre)>|<br\s*\/?>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

// A photo must be one uploaded here, so it keeps only its path and gets this
// backend's own address back.
const ownMedia = (url, origin) => {
  const path = MEDIA_PATH.exec(String(url || ''))?.[1];
  return path ? `${origin}${path}` : '';
};

// The optional recipe details, or null when none were given.
function cleanRecipe(input) {
  if (!input || typeof input !== 'object') return null;
  const recipe = {};
  for (const key of ['total', 'prep', 'cook', 'servings', 'cuisine', 'method']) recipe[key] = text(input[key], 60);
  recipe.ingredients = (Array.isArray(input.ingredients) ? input.ingredients : [])
    .map((line) => text(line, 160))
    .filter(Boolean)
    .slice(0, 60);
  recipe.notes = text(input.notes, 1200);
  return Object.values(recipe).some((v) => v.length) ? recipe : null;
}

// A draft may be unfinished, so it only needs something to keep.
export function cleanShortPost(body, origin, { draft = false } = {}) {
  const input = body && typeof body === 'object' ? body : {};
  const errors = {};
  const title = text(input.title, 120);
  const captionHtml = cleanContentHtml(input.captionHtml, origin);
  // A Word document, when one was uploaded, is the content shown.
  const docHtml = cleanDocHtml(input.docHtml, origin);
  const caption = text(docHtml ? docText(docHtml) : captionHtml ? contentText(captionHtml) : input.caption, 12000);
  const postedBy = text(input.postedBy, 60);
  const category = text(String(input.category || '').replace(/[<>]/g, ''), 40);
  const bgColor = /^#[0-9a-f]{6}$/i.test(input.bgColor) ? input.bgColor.toLowerCase() : '';
  const coverUrl = ownMedia(input.coverUrl, origin);
  const subtitle = text(input.subtitle, 200);
  const intro = text(input.intro, 1500);
  const takeaway = text(input.takeaway, 300);
  const conclusion = text(input.conclusion, 1500);
  const tips = (Array.isArray(input.tips) ? input.tips : []).map((tip) => text(tip, 160)).filter(Boolean).slice(0, 6);
  const media = (Array.isArray(input.media) ? input.media : [])
    .slice(0, MAX_PHOTOS)
    .map((photo) => ({ url: ownMedia(photo?.url, origin), width: Number(photo?.width) || null, height: Number(photo?.height) || null }))
    .filter((photo) => photo.url);

  if (captionHtml.length > MAX_CONTENT_HTML) errors.caption = 'This content is too long. Please shorten it.';
  if (docHtml.length > MAX_DOC_HTML) errors.caption = 'This Word document is too long. Please split it into two blogs.';
  if (draft) {
    if (!coverUrl && !media.length && !title && !caption) errors.media = 'Add a picture, a title or some content first.';
  } else {
    if (!coverUrl) errors.cover = 'Add a cover picture.';
    if (!media.length) errors.media = 'Add at least one main picture.';
    if (!title) errors.title = 'Give the blog a title.';
    if (!caption) errors.caption = 'Write the blog content.';
    if (!postedBy) errors.postedBy = 'Add your name.';
    if (!category) errors.category = 'Choose a category.';
  }
  if (Object.keys(errors).length) return { errors };

  const shownTitle = title || 'Untitled draft';
  const summary = caption.replace(/\s+/g, ' ');
  const typedTags = (Array.isArray(input.tags) ? input.tags : []).map((tag) => text(String(tag).replace(/^#|[<>]/g, ''), 30)).filter(Boolean);
  const words = [intro, caption, conclusion, ...tips].join(' ').split(/\s+/).filter(Boolean).length;
  return {
    value: {
      format: 'post',
      title: shownTitle,
      subtitle,
      intro,
      takeaway,
      caption,
      captionHtml,
      docHtml,
      tips,
      conclusion,
      bgColor,
      postedBy,
      category,
      media,
      ratio: RATIOS.includes(input.ratio) || input.ratio === 'free' ? input.ratio : '4:5',
      heroRatio: heroRatio(input.heroRatio),
      coverRatio: RATIOS.includes(input.coverRatio) ? input.coverRatio : '16:9',
      recipe: cleanRecipe(input.recipe),
      productIds: (Array.isArray(input.productIds) ? input.productIds : [])
        .filter((id) => typeof id === 'string' && /^[a-z0-9-]{1,60}$/.test(id))
        .slice(0, 5),
      tags: [...new Set([...typedTags, ...[...caption.matchAll(HASHTAG)].map((m) => m[1])])].slice(0, 12),
      excerpt: (subtitle || intro || summary).slice(0, 320),
      contentHtml: '',
      coverUrl,
      coverAlt: shownTitle,
      author: 'Cholan Rice and Millet Shop',
      language: /[\u0B80-\u0BFF]/.test(`${shownTitle} ${caption}`) ? 'ta' : 'en',
      featured: false,
      allowComments: true,
      seoTitle: shownTitle.slice(0, 70),
      seoDescription: (subtitle || intro || summary).slice(0, 170),
      readingMinutes: Math.max(1, Math.round(words / 200)),
      words,
    },
  };
}

// A web address no other post uses. A caption in Tamil has no letters a web
// address can keep, so it falls back to "post".
export function uniqueSlug(title, existingSlugs) {
  const base = slugify(title).slice(0, 70).replace(/-+$/, '') || 'post';
  if (!existingSlugs.has(base)) return base;
  for (let n = 2; ; n += 1) if (!existingSlugs.has(`${base}-${n}`)) return `${base}-${n}`;
}

// Live on the site: published, or scheduled for a time that has passed.
export const isLive = (post, now = Date.now()) =>
  (post.status === 'published' || post.status === 'scheduled') && post.publishAt && Date.parse(post.publishAt) <= now;
