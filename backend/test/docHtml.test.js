// node --test test/  — an uploaded Word document keeps its look, and nothing else.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cleanDocHtml, cleanStyle, docText } from '../src/lib/docHtml.js';
import { cleanPost, cleanShortPost } from '../src/lib/posts.js';

const ORIGIN = 'https://api.example';

test('the formatting Word documents use is kept as it is', () => {
  const html =
    '<div style="font-family:\'Calibri\', \'Carlito\', sans-serif;font-size:11pt;color:#000000;white-space:pre-wrap;tab-size:48px">' +
    '<h2 style="font-size:16pt;color:#0f4761;padding-top:18pt;padding-bottom:4pt">Title</h2>' +
    '<p style="text-align:justify;line-height:1.24;margin-left:36pt;text-indent:-18pt"><span style="font-weight:bold;background-color:#ffff00;vertical-align:super;font-size:7.15pt">x</span></p>' +
    '<div style="overflow-x:auto;max-width:100%"><table style="border-collapse:collapse;width:451.3pt"><colgroup><col style="width:150pt"></colgroup><tbody>' +
    '<tr style="height:20pt"><td colspan="2" rowspan="3" style="border-top:0.5pt solid #000000;border-left:2.25pt double #4ea72e;padding-left:5.4pt;vertical-align:middle;background-color:#ccffcc">c</td></tr>' +
    '</tbody></table></div></div>';
  assert.equal(cleanDocHtml(html, ORIGIN), html);
});

test('anything that could run, load from elsewhere or cover the page is removed', () => {
  const out = cleanDocHtml(
    '<p style="color:red;background-image:url(https://evil.example/x.png);position:fixed;top:0;color:#ff0000" onclick="steal()">a</p>' +
      '<script>steal()</script><iframe src="https://evil.example"></iframe><style>body{display:none}</style>' +
      '<a href="javascript:steal()">b</a><img src="https://evil.example/t.png"><img src="http://localhost:8081/api/media/dev_blog/a.webp" width="300">',
    ORIGIN,
  );
  assert.equal(out, '<p style="color:#ff0000">a</p>steal()body{display:none}<a>b</a><img src="https://api.example/api/media/dev_blog/a.webp" width="300">');
});

test('style values with brackets or quotes are refused', () => {
  assert.equal(cleanStyle('width:calc(100% - 1px);font-family:"Evil" ;color:rgb(0,0,0);margin-left:-18pt'), 'margin-left:-18pt');
});

test('the document is the content of a blog sent from /admin', () => {
  const docHtml = '<div style="font-size:11pt"><p>Hello there,<br>friends</p><div><table><tbody><tr><td>a</td><td>b</td></tr></tbody></table></div></div>';
  const { value } = cleanShortPost({ title: 'T', docHtml }, ORIGIN, { draft: true });
  assert.equal(value.docHtml, docHtml);
  assert.equal(value.caption, 'Hello there,\nfriends\na b');
  assert.equal(docText(docHtml), 'Hello there,\nfriends\na b');
});

test('an article can be a Word document, and is counted by its words', () => {
  const { value, errors } = cleanPost({ title: 'T', status: 'published', docHtml: '<p>one two three four five six</p>' }, ORIGIN);
  assert.equal(errors, undefined);
  assert.equal(value.words, 6);
  assert.equal(value.docHtml, '<p>one two three four five six</p>');
});
