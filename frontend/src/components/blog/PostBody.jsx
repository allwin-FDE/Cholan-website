import DOMPurify from 'dompurify';
import { useMemo } from 'react';

// A blog post's content, as written in the dashboard's editor. The HTML is
// cleaned first: formatting, links, images and YouTube videos stay, anything
// that could run code does not.
const YOUTUBE = /^https:\/\/(www\.)?(youtube(-nocookie)?\.com)\/embed\//;

export function cleanHtml(html) {
  const clean = DOMPurify.sanitize(html || '', {
    ADD_TAGS: ['iframe'],
    ADD_ATTR: ['allow', 'allowfullscreen', 'frameborder', 'target', 'data-youtube-video'],
  });
  // Only YouTube may be embedded.
  const doc = new DOMParser().parseFromString(clean, 'text/html');
  doc.querySelectorAll('iframe').forEach((frame) => {
    if (!YOUTUBE.test(frame.getAttribute('src') || '')) frame.remove();
    else frame.setAttribute('loading', 'lazy');
  });
  doc.querySelectorAll('a[href^="http"]').forEach((a) => {
    if (!a.href.includes('cholanrice.in')) {
      a.setAttribute('target', '_blank');
      a.setAttribute('rel', 'noopener noreferrer');
    }
  });
  doc.querySelectorAll('img').forEach((img) => img.setAttribute('loading', 'lazy'));
  return doc.body.innerHTML;
}

export default function PostBody({ html }) {
  const clean = useMemo(() => cleanHtml(html), [html]);
  return <div className="post-body" dangerouslySetInnerHTML={{ __html: clean }} />;
}
