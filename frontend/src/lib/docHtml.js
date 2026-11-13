import DOMPurify from 'dompurify';

// An uploaded Word document as the blog shows it (made by lib/docx.js). Only
// these tags and style properties are kept: the same list the backend keeps
// (backend/src/lib/docHtml.js). No style value may hold brackets, so nothing
// can be loaded from elsewhere.
const LEN = '-?\\d{1,5}(?:\\.\\d{1,3})?(?:pt|px|em|%)?';
const COLOR = '#[0-9a-f]{3,8}|transparent|currentcolor|inherit';
const BORDER = `none|${LEN} (?:solid|double|dotted|dashed) (?:${COLOR})`;
const STYLE_RULES = Object.fromEntries(
  Object.entries({
    color: COLOR,
    'background-color': COLOR,
    'font-family': "[\\w ',-]{1,300}",
    'font-size': LEN,
    'font-weight': 'bold|normal|[1-9]00',
    'font-style': 'italic|normal',
    'font-variant': 'small-caps|normal',
    'text-decoration-line': '(?:underline|line-through|none)(?: line-through)?',
    'text-decoration-style': 'solid|double|dotted|dashed|wavy',
    'text-decoration-color': COLOR,
    'text-transform': 'uppercase|none',
    'letter-spacing': `normal|${LEN}`,
    'vertical-align': `super|sub|baseline|top|middle|bottom|${LEN}`,
    'text-align': 'left|right|center|justify',
    'text-indent': LEN,
    'line-height': `normal|${LEN}`,
    'margin-top': `auto|${LEN}`,
    'margin-right': `auto|${LEN}`,
    'margin-bottom': `auto|${LEN}`,
    'margin-left': `auto|${LEN}`,
    'padding-top': LEN,
    'padding-right': LEN,
    'padding-bottom': LEN,
    'padding-left': LEN,
    'border-top': BORDER,
    'border-right': BORDER,
    'border-bottom': BORDER,
    'border-left': BORDER,
    'border-collapse': 'collapse|separate',
    width: `auto|${LEN}`,
    'min-width': LEN,
    'max-width': `none|${LEN}`,
    height: `auto|${LEN}`,
    display: 'inline-block|block|flow-root',
    float: 'left|right|none',
    clear: 'both|none',
    'white-space': 'pre-wrap|normal',
    'tab-size': LEN,
    'overflow-x': 'auto|visible',
    'overflow-wrap': 'break-word|anywhere|normal',
    'table-layout': 'fixed|auto',
  }).map(([name, pattern]) => [name, new RegExp(`^(?:${pattern})$`, 'i')]),
);

const cleanStyle = (style) =>
  String(style || '')
    .split(';')
    .map((part) => {
      const at = part.indexOf(':');
      if (at < 1) return '';
      const name = part.slice(0, at).trim().toLowerCase();
      const value = part.slice(at + 1).trim();
      return STYLE_RULES[name]?.test(value) ? `${name}:${value}` : '';
    })
    .filter(Boolean)
    .join(';');

export function cleanDocHtml(html) {
  const clean = DOMPurify.sanitize(html || '', {
    ALLOWED_TAGS: ['div', 'p', 'h2', 'h3', 'h4', 'span', 'sup', 'sub', 'br', 'hr', 'a', 'img', 'table', 'colgroup', 'col', 'tbody', 'thead', 'tr', 'td', 'th'],
    ALLOWED_ATTR: ['style', 'href', 'src', 'alt', 'width', 'height', 'colspan', 'rowspan'],
  });
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('[style]').forEach((el) => {
    const style = cleanStyle(el.getAttribute('style'));
    if (style) el.setAttribute('style', style);
    else el.removeAttribute('style');
  });
  doc.querySelectorAll('a').forEach((a) => {
    if (!/^(https?:|mailto:)/i.test(a.getAttribute('href') || '')) a.removeAttribute('href');
    else if (!a.href.includes('cholanrice.in')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  doc.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  return doc.body.innerHTML;
}

// The document's words: its summary, word count and search text.
export const docPlainText = (html) => new DOMParser().parseFromString(html || '', 'text/html').body.textContent.replace(/\s+/g, ' ').trim();
