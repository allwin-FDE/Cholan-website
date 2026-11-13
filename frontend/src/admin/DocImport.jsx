import { useMemo, useRef, useState } from 'react';
import { api, prepareImage } from '../dashboard/api.js';
import { Icon } from '../dashboard/ui.jsx';
import { cleanDocHtml } from '../lib/docHtml.js';

// Upload a Word document as the blog's content, kept exactly as written:
// spacing, colours, fonts, tables and pictures. Shown as visitors will see it,
// with buttons to replace it or go back to writing. `onChange` gets
// { html, text } for a new document, or null when it is removed.
export default function DocImport({ html, onChange }) {
  const input = useRef(null);
  const [busy, setBusy] = useState('');
  const [problem, setProblem] = useState('');
  const [notes, setNotes] = useState([]);
  const shown = useMemo(() => (html ? cleanDocHtml(html) : ''), [html]);

  const read = async (file) => {
    if (!file) return;
    setProblem('');
    setNotes([]);
    setBusy('Reading the document…');
    try {
      // The reader is loaded only when someone uploads a document.
      const { docxToHtml } = await import('../lib/docx.js');
      const out = await docxToHtml(file, {
        upload: async (blob) => (await api.upload(await prepareImage(blob))).url,
        onProgress: setBusy,
      });
      onChange({ html: out.html, text: out.text });
      setNotes(out.notes);
    } catch (e) {
      setProblem(e.message || 'This document could not be read. Please try again.');
    }
    setBusy('');
  };
  const remove = () => {
    if (window.confirm('Remove the Word document and write the content here instead?')) onChange(null);
  };

  return (
    <div className="doc-import">
      <input
        ref={input}
        type="file"
        accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        hidden
        data-testid="doc-file"
        onChange={(e) => {
          read(e.target.files[0]);
          e.target.value = '';
        }}
      />
      {html ? (
        <>
          <div className="doc-import__head">
            <span>
              <Icon name="file" size={16} /> Word document, shown exactly as written
            </span>
            <div className="doc-import__actions">
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={() => input.current.click()} disabled={Boolean(busy)}>
                Replace document
              </button>
              <button type="button" className="dash-btn dash-btn--ghost dash-btn--sm" onClick={remove} disabled={Boolean(busy)}>
                Remove, write instead
              </button>
            </div>
          </div>
          <div className="doc-import__view post-doc" dangerouslySetInnerHTML={{ __html: shown }} />
        </>
      ) : (
        <button type="button" className="doc-import__pick" onClick={() => input.current.click()} disabled={Boolean(busy)}>
          <Icon name="file" size={18} />
          <span>
            <strong>Or upload a Word document</strong>
            <small>Its spacing, colours, fonts, tables and pictures are kept exactly as written.</small>
          </span>
        </button>
      )}
      {busy && (
        <p className="doc-import__busy" role="status">
          {busy}
        </p>
      )}
      {problem && (
        <div className="dash-error" role="alert">
          {problem}
        </div>
      )}
      {notes.map((note) => (
        <p key={note} className="doc-import__note">
          {note}
        </p>
      ))}
    </div>
  );
}
