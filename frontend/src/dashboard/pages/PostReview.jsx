import { useState } from 'react';
import { api } from '../api.js';
import { Badge, Drawer, ago, dateOnly } from '../ui.jsx';
import PostMain from '../../components/blog/PostMain.jsx';
import PhotoCrop from '../../admin/PhotoCrop.jsx';
import CaptionEditor, { BackgroundPicker, textToHtml } from '../../admin/CaptionEditor.jsx';
import { HERO_RATIO, POST_CATEGORIES, fetchPhoto, renderPhoto } from '../../admin/photos.js';
import '../../styles/admin.css';
import { POST_STATUS, liveStatus } from './BlogList.jsx';

// One blog sent from /admin: see it as visitors will, fix small things, then
// approve it, approve it for later, or send it back with a note.
export default function PostReview({ post, onClose, onDone }) {
  const [title, setTitle] = useState(post.title);
  const [subtitle, setSubtitle] = useState(post.subtitle || '');
  const [intro, setIntro] = useState(post.intro || '');
  const [takeaway, setTakeaway] = useState(post.takeaway || '');
  const [tips, setTips] = useState((post.tips || []).join('\n'));
  const [conclusion, setConclusion] = useState(post.conclusion || '');
  const [caption, setCaption] = useState(post.caption);
  const [captionHtml, setCaptionHtml] = useState(post.captionHtml || textToHtml(post.caption));
  const [captionEdited, setCaptionEdited] = useState(false);
  const [bgColor, setBgColor] = useState(post.bgColor || '');
  const [category, setCategory] = useState(post.category);
  const [coverUrl, setCoverUrl] = useState(post.coverUrl);
  const [coverRatio, setCoverRatio] = useState(post.coverRatio || '16:9');
  const [media, setMedia] = useState(post.media || []);
  const [ratio, setRatio] = useState(post.ratio || '4:5');
  const [note, setNote] = useState('');
  const [publishAt, setPublishAt] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  const [cropping, setCropping] = useState(null); // { index ('cover' or a number), photo }

  const status = liveStatus(post);
  const waiting = post.status === 'pending' || post.status === 'changes';
  const live = status === 'published' || status === 'scheduled';
  const edited =
    captionEdited ||
    title !== post.title ||
    subtitle !== (post.subtitle || '') ||
    intro !== (post.intro || '') ||
    takeaway !== (post.takeaway || '') ||
    tips !== (post.tips || []).join('\n') ||
    conclusion !== (post.conclusion || '') ||
    bgColor !== (post.bgColor || '') ||
    category !== post.category ||
    coverUrl !== post.coverUrl ||
    coverRatio !== (post.coverRatio || '16:9') ||
    ratio !== (post.ratio || '4:5') ||
    media !== (post.media || []);
  const tipList = tips.split('\n').map((t) => t.trim()).filter(Boolean);
  const parts = { subtitle, intro, takeaway, tips: tipList, conclusion };
  const shown = { ...post, ...parts, title, caption, captionHtml, bgColor, category, coverUrl, coverRatio, media, ratio };

  const act = async (action, extra = {}) => {
    setBusy(true);
    setProblem('');
    try {
      const edits = edited
        ? { ...parts, title, caption, captionHtml, bgColor, category: category.trim(), coverUrl, coverRatio, ratio, media, productIds: post.productIds, tags: post.tags, recipe: post.recipe }
        : undefined;
      await api.reviewPost(post.id, { action, edits, ...extra });
      window.dispatchEvent(new Event('cholan:review'));
      onDone();
    } catch (e) {
      const field = e.fields && Object.values(e.fields)[0];
      setProblem(field || e.message);
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!window.confirm('Delete this blog for good? This cannot be undone.')) return;
    setBusy(true);
    try {
      await api.deletePost(post.id);
      window.dispatchEvent(new Event('cholan:review'));
      onDone();
    } catch (e) {
      setProblem(e.message);
      setBusy(false);
    }
  };

  const startCrop = async (index) => {
    setBusy(true);
    setProblem('');
    try {
      setCropping({ index, photo: await fetchPhoto(index === 'cover' ? { url: coverUrl } : media[index]) });
    } catch (e) {
      setProblem(e.message);
    }
    setBusy(false);
  };

  const isCover = cropping?.index === 'cover';
  const isHero = cropping?.index === 0;
  const saveCrop = async () => {
    setBusy(true);
    setProblem('');
    try {
      const out = await renderPhoto(cropping.photo, isCover ? coverRatio : isHero ? HERO_RATIO : ratio);
      const { url } = await api.upload(out.blob);
      if (isCover) setCoverUrl(url);
      else setMedia(media.map((m, i) => (i === cropping.index ? { url, width: out.width, height: out.height } : m)));
      setCropping(null);
    } catch (e) {
      setProblem(e.message);
    }
    setBusy(false);
  };

  return (
    <Drawer open onClose={onClose} title="Review blog" wide>
      <div className="dash-review">
        <div className="dash-review__who">
          <Badge tone={POST_STATUS[status]?.tone}>{POST_STATUS[status]?.label}</Badge> Posted by <strong>{post.postedBy}</strong>
          {post.submittedAt && ` · sent ${ago(post.submittedAt)}`}
          {status === 'scheduled' && ` · goes live ${dateOnly(post.publishAt)}`}
        </div>

        {problem && (
          <div className="dash-error" role="alert">
            {problem}
          </div>
        )}

        {post.status === 'changes' && post.reviewNote && <p className="dash-muted">Note sent to the poster: {post.reviewNote}</p>}

        <div className="dash-review__preview">
          <PostMain post={shown} preview />
        </div>

        <div>
          <label className="dash-review__label" htmlFor="review-title">
            Fix the title
          </label>
          <input id="review-title" maxLength={120} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        {[
          ['Subtitle', subtitle, setSubtitle, 200, 1],
          ['Introduction', intro, setIntro, 1500, 3],
          ['Key takeaway', takeaway, setTakeaway, 300, 2],
          ['Quick tips (one on each line)', tips, setTips, 1000, 3],
          ['Conclusion', conclusion, setConclusion, 1500, 3],
        ].map(([label, value, set, max, rows]) => (
          <div key={label}>
            <label className="dash-review__label">
              {label}
              <textarea rows={rows} maxLength={max} value={value} onChange={(e) => set(e.target.value)} />
            </label>
          </div>
        ))}

        <div>
          <span className="dash-review__label">Fix the content</span>
          <div className="adm">
            <CaptionEditor
              html={captionHtml}
              bgColor={bgColor}
              onChange={({ html, text }) => {
                setCaptionHtml(html);
                setCaption(text);
                setCaptionEdited(true);
              }}
            />
          </div>
        </div>

        <div>
          <span className="dash-review__label">Content background colour</span>
          <div className="adm">
            <BackgroundPicker value={bgColor} onChange={setBgColor} />
          </div>
        </div>

        <div>
          <label className="dash-review__label" htmlFor="review-category">
            Category
          </label>
          <input id="review-category" list="review-categories" maxLength={40} value={category} onChange={(e) => setCategory(e.target.value)} />
          <datalist id="review-categories">
            {POST_CATEGORIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </div>

        <div>
          <span className="dash-review__label">Pictures</span>
          <div className="dash-review__photos">
            {coverUrl && (
              <div className="dash-review__photo">
                <img src={coverUrl} alt="Cover" />
                <div>
                  <span>Cover</span>
                  <button type="button" className="dash-link" onClick={() => startCrop('cover')} disabled={busy}>
                    Crop
                  </button>
                </div>
              </div>
            )}
            {media.map((photo, i) => (
              <div key={photo.url} className="dash-review__photo">
                <img src={photo.url} alt={`Picture ${i + 1}`} />
                <div>
                  <button type="button" className="dash-link" onClick={() => startCrop(i)} disabled={busy}>
                    Crop
                  </button>
                  {media.length > 1 && (
                    <button type="button" className="dash-link" onClick={() => setMedia(media.filter((_, x) => x !== i))} disabled={busy}>
                      Remove
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>

        {cropping && (
          <div className="adm">
            <PhotoCrop
              photo={cropping.photo}
              ratio={isCover ? coverRatio : isHero ? HERO_RATIO : ratio}
              onRatio={
                isHero
                  ? null
                  : (key) => {
                      (isCover ? setCoverRatio : setRatio)(key);
                      setCropping((c) => ({ ...c, photo: { ...c.photo, crop: { x: 0, y: 0 }, zoom: 1, area: null } }));
                    }
              }
              onChange={(fields) => setCropping((c) => (c ? { ...c, photo: { ...c.photo, ...fields } } : c))}
            />
            <div className="dash-review__row" style={{ marginTop: 10 }}>
              <button type="button" className="dash-btn" onClick={saveCrop} disabled={busy}>
                Use this crop
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => setCropping(null)} disabled={busy}>
                Cancel
              </button>
            </div>
          </div>
        )}

        <div className="dash-review__actions">
          {waiting && (
            <>
              <button type="button" className="dash-btn" onClick={() => act('approve')} disabled={busy}>
                Approve: goes live now
              </button>
              <div>
                <label className="dash-review__label" htmlFor="review-when">
                  Or approve for later
                </label>
                <div className="dash-review__row">
                  <input id="review-when" type="datetime-local" value={publishAt} onChange={(e) => setPublishAt(e.target.value)} style={{ flex: 1, minWidth: 200 }} />
                  <button
                    type="button"
                    className="dash-btn dash-btn--ghost"
                    disabled={busy || !publishAt}
                    onClick={() => act('schedule', { publishAt: new Date(publishAt).toISOString() })}
                  >
                    Approve for this time
                  </button>
                </div>
              </div>
              <div>
                <label className="dash-review__label" htmlFor="review-note">
                  Or ask for changes
                </label>
                <textarea id="review-note" rows={2} maxLength={500} placeholder="What should they change? They will see this note." value={note} onChange={(e) => setNote(e.target.value)} />
                <button type="button" className="dash-btn dash-btn--ghost" style={{ marginTop: 8 }} disabled={busy || !note.trim()} onClick={() => act('changes', { note })}>
                  Ask for changes
                </button>
              </div>
            </>
          )}
          {live && (
            <div className="dash-review__row">
              <button type="button" className="dash-btn" onClick={() => act('save')} disabled={busy || !edited}>
                Save fixes
              </button>
              <button type="button" className="dash-btn dash-btn--ghost" onClick={() => act('unpublish')} disabled={busy}>
                Take off the website
              </button>
            </div>
          )}
          <div>
            <button type="button" className="dash-btn dash-btn--danger" onClick={remove} disabled={busy}>
              Delete blog
            </button>
          </div>
        </div>
      </div>
    </Drawer>
  );
}
