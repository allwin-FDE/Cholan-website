// "Download PDF" on a blog post. Loaded only when pressed, as the PDF library
// is large. The post is laid out afresh for A4 paper: white page, logo, title,
// pictures, recipe and content, with the site's own header and colours left out.
import html2pdf from 'html2pdf.js';
import { postDate, richHtml } from '../components/blog/PostMain.jsx';
import { cleanHtml } from '../components/blog/PostBody.jsx';
import { site } from '../config/site.js';

const esc = (value) =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// A picture as data, so the page can draw it. The cache is skipped because a
// plain image load may have stored it without the permission that needs.
async function asData(url) {
  try {
    const response = await fetch(url, { mode: 'cors', cache: 'reload' });
    if (!response.ok) return null;
    const blob = await response.blob();
    return await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

const STYLE = `
.pdf { width: 720px; padding: 4px; color: #1b2a20; background: #fff; font: 15px/1.6 Inter, 'Nirmala UI', 'Noto Sans Tamil', Arial, sans-serif; }
.pdf * { box-sizing: border-box; }
.pdf-top { display: flex; align-items: center; justify-content: space-between; padding-bottom: 12px; margin-bottom: 18px; border-bottom: 2px solid #1b4d33; font-size: 12px; color: #5a655c; }
.pdf-top img { height: 42px; }
.pdf-cat { color: #9a6a16; font-size: 12px; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.pdf h1 { margin: 4px 0 6px; color: #173c29; font: 800 28px/1.2 Poppins, 'Nirmala UI', Arial, sans-serif; }
.pdf-meta { margin: 0 0 16px; color: #5a655c; font-size: 12px; }
.pdf-cover { display: block; width: 100%; margin-bottom: 16px; border-radius: 10px; }
.pdf-pictures { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 18px; }
.pdf-pictures div { background-position: center; background-size: cover; background-repeat: no-repeat; border-radius: 8px; }
.pdf-subtitle { margin: -8px 0 14px; color: #46524a; font-size: 16px; }
.pdf-box--green { background: #e2efe6 !important; }
.pdf-box--cream { background: #faf3e6 !important; }
.pdf-box { margin-bottom: 18px; padding: 14px 16px; background: #f7f4ec; border-radius: 10px; }
.pdf-times { display: flex; flex-wrap: wrap; gap: 6px 22px; margin-bottom: 8px; font-size: 13px; }
.pdf h2 { margin: 18px 0 8px; color: #173c29; font: 700 20px/1.3 Poppins, 'Nirmala UI', Arial, sans-serif; }
.pdf h3 { margin: 14px 0 6px; color: #173c29; font: 700 16px/1.3 Poppins, 'Nirmala UI', Arial, sans-serif; }
.pdf-box h2:first-child, .pdf-box h3:first-child { margin-top: 0; }
.pdf p { margin: 0 0 10px; }
.pdf ul, .pdf ol { margin: 0 0 10px; padding: 0; list-style: none; }
.pdf li { position: relative; margin-bottom: 4px; padding-left: 24px; }
.pdf li p { margin: 0; }
.pdf-mark { position: absolute; left: 4px; top: 0; }
.pdf blockquote { margin: 0 0 10px; padding: 4px 0 4px 14px; border-left: 3px solid #c9a24a; font-style: italic; }
.pdf hr { margin: 14px 0; border: 0; border-top: 1px solid #d9d2bd; }
.pdf a { color: #1b4d33; }
.pdf img { max-width: 100%; }
.pdf [data-align='center'] { text-align: center; }
.pdf [data-align='right'] { text-align: right; }
.pdf [data-font='heading'] { font-family: Poppins, sans-serif; font-weight: 800; }
.pdf [data-font='classic'] { font-family: Georgia, serif; }
.pdf [data-font='typewriter'] { font-family: 'Courier New', monospace; }
.pdf [data-font='handwritten'] { font-family: 'Segoe Print', 'Bradley Hand', cursive; }
.pdf [data-size='small'] { font-size: .85em; }
.pdf [data-size='large'] { font-size: 1.3em; }
.pdf [data-size='xlarge'] { font-size: 1.7em; }
.pdf [data-color='green'] { color: #1b4d33; }
.pdf [data-color='gold'] { color: #9a6a16; }
.pdf [data-color='red'] { color: #b3261e; }
.pdf [data-color='blue'] { color: #2a5d9f; }
.pdf [data-color='black'] { color: #111; }
.pdf-foot { margin-top: 20px; padding-top: 10px; border-top: 1px solid #d9d2bd; color: #5a655c; font-size: 11px; }
`;

function recipeHtml(post) {
  const { recipe } = post;
  if (!recipe) return { top: '', foot: '' };
  const times = [
    ['Total time', recipe.total],
    ['Prep time', recipe.prep],
    ['Cook time', recipe.cook],
    ['Serves', recipe.servings],
    ['Method', recipe.method],
    ['Cuisine', recipe.cuisine],
  ].filter(([, v]) => v);
  const top = `<div class="pdf-box">
    ${times.length ? `<div class="pdf-times">${times.map(([k, v]) => `<span><strong>${esc(k)}:</strong> ${esc(v)}</span>`).join('')}</div>` : ''}
    ${recipe.ingredients?.length ? `<h2>Ingredients</h2><ul>${recipe.ingredients.map((l) => `<li><span class="pdf-mark">•</span>${esc(l)}</li>`).join('')}</ul>` : ''}
  </div>`;
  const foot = recipe.notes ? `<div class="pdf-box"><h2>Notes</h2><p>${esc(recipe.notes)}</p></div>` : '';
  return { top, foot };
}

export async function downloadPostPdf(post) {
  const short = post.format === 'post';
  const pictures = post.media || [];
  const [logo, cover, ...shots] = await Promise.all([
    asData('/images/cholan-logo.png'),
    // As on the page: a post from /admin leads with its first main picture.
    short ? (pictures[0] ? asData(pictures[0].url) : null) : post.coverUrl ? asData(post.coverUrl) : null,
    ...(short ? pictures.slice(1) : []).map((m) => asData(m.url)),
  ]);
  const { top, foot } = short ? recipeHtml(post) : { top: '', foot: '' };

  const holder = document.createElement('div');
  holder.innerHTML = richOrArticle(post, short);
  // Pictures inside a long article are drawn from data too.
  await Promise.all(
    [...holder.querySelectorAll('img')].map(async (img) => {
      const data = await asData(img.getAttribute('src'));
      if (data) img.setAttribute('src', data);
      else img.remove();
    }),
  );
  holder.querySelectorAll('iframe').forEach((frame) => frame.remove());
  // The PDF drawing cannot place a list's own bullets or numbers on the line,
  // so each item carries its mark as text.
  holder.querySelectorAll('li').forEach((li) => {
    const list = li.parentElement;
    const mark = document.createElement('span');
    mark.className = 'pdf-mark';
    mark.textContent = list.tagName === 'OL' ? `${[...list.children].indexOf(li) + 1}.` : '•';
    li.prepend(mark);
  });
  if (short && post.recipe) holder.insertAdjacentHTML('afterbegin', '<h2>Instructions</h2>');
  // A heading stays on the same page as what follows it.
  holder.querySelectorAll('h2, h3').forEach((heading) => {
    const next = heading.nextElementSibling;
    if (!next) return;
    const keep = document.createElement('div');
    keep.className = 'pdf-keep';
    heading.replaceWith(keep);
    keep.append(heading, next);
  });

  // Three to a row on the 712px page, in the shape they were cropped to.
  const shotHeight = Math.round(232 / ({ '1:1': 1, '16:9': 16 / 9 }[post.ratio] || 4 / 5));
  // Free pictures are shown whole inside their box rather than filling it.
  const shotFit = post.ratio === 'free' ? ';background-size:contain;background-repeat:no-repeat;background-position:center' : '';
  const page = document.createElement('div');
  page.className = 'pdf';
  page.innerHTML = `<style>${STYLE}</style>
    <div class="pdf-top">
      ${logo ? `<img src="${logo}" alt="">` : `<strong>${esc(site.name)}</strong>`}
      <span>www.cholanrice.in</span>
    </div>
    ${post.category ? `<div class="pdf-cat">${esc(post.category)}</div>` : ''}
    <h1>${esc(post.title)}</h1>
    <p class="pdf-meta">${esc(postDate(post.publishAt))}${post.author ? ` · By ${esc(post.author)}` : ''}</p>
    ${short && post.subtitle ? `<p class="pdf-subtitle">${esc(post.subtitle)}</p>` : ''}
    ${cover ? `<img class="pdf-cover" src="${cover}" alt="">` : ''}
    ${post.intro ? `<p>${esc(post.intro)}</p>` : ''}
    ${post.takeaway ? `<div class="pdf-box pdf-box--green"><h3>Key Takeaway</h3><p>${esc(post.takeaway)}</p></div>` : ''}
    ${shots.some(Boolean) ? `<div class="pdf-pictures">${shots.filter(Boolean).map((s) => `<div style="height:${shotHeight}px;background-image:url('${s}')${shotFit}"></div>`).join('')}</div>` : ''}
    ${top}
    <div class="pdf-content">${holder.innerHTML}</div>
    ${foot}
    ${post.tips?.length ? `<div class="pdf-box pdf-box--cream"><h3>Quick Tips</h3><ul>${post.tips.map((t) => `<li><span class="pdf-mark">✓</span>${esc(t)}</li>`).join('')}</ul></div>` : ''}
    ${post.conclusion ? `<div class="pdf-keep"><h2>Conclusion</h2><p>${esc(post.conclusion)}</p></div>` : ''}
    <div class="pdf-foot">${esc(site.name)} · ${esc(site.phone)} · ${esc(site.email)} · www.cholanrice.in/blog/${esc(post.slug)}</div>`;

  await html2pdf()
    .set({
      margin: [10, 10, 12, 10],
      filename: `${post.slug || 'cholan-blog'}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, backgroundColor: '#ffffff', logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
      pagebreak: { mode: ['css', 'legacy'], avoid: ['img', 'p', 'li', 'h1', 'h2', 'h3', 'blockquote', '.pdf-times', '.pdf-keep', '.pdf-box', '.pdf-pictures', '.pdf-foot'] },
    })
    .from(page)
    .save();
}

function richOrArticle(post, short) {
  return short ? richHtml(post.captionHtml) : cleanHtml(post.contentHtml);
}
