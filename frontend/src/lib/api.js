// Calls to the backend. The base URL comes from VITE_API_URL at build time and
// falls back to the dev server's localhost port.
const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');
export const apiUrl = baseUrl;

// Whether there is a backend to post to. In development the local one is
// assumed; a production build has one only when VITE_API_URL was set. Without
// it the contact form hands the enquiry to WhatsApp instead, so a site
// deployed before the backend still takes enquiries.
export const hasBackend = import.meta.env.DEV || Boolean(import.meta.env.VITE_API_URL);

// Thrown for a response the backend rejected. `fields` carries the per-field
// messages from validation, so the form can show them next to each input.
export class ApiError extends Error {
  constructor(message, { fields, status } = {}) {
    super(message);
    this.name = 'ApiError';
    this.fields = fields || null;
    this.status = status;
  }
}

export async function submitEnquiry(enquiry) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/enquiries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(enquiry),
    });
  } catch {
    // fetch only rejects when the request never got an answer: offline, DNS,
    // or the backend is down.
    throw new ApiError('We could not reach the server. Please check your connection and try again.');
  }

  // A proxy or crash can answer with HTML, so treat a body we cannot parse as
  // an empty one rather than letting the throw escape.
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(data.error || 'Your enquiry could not be sent. Please try again.', {
      fields: data.fields,
      status: response.status,
    });
  }
  return data;
}

// The footer's "Subscribe to Updates". `meta` says where on the site it was
// sent from. Resolves to { ok, already } — already: the address was on the list.
export async function subscribe(email, meta) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, meta }),
    });
  } catch {
    throw new ApiError('We could not reach the server. Please try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Could not subscribe. Please try again.', { status: response.status });
  return data;
}

// Asks the website assistant. `messages` is the conversation so far, ending
// with the new question. The answer streams in: `onSources` gets the pages it
// was drawn from, `onText` each piece of text as it is written. Resolves when
// the answer is complete; rejects with an ApiError the chat can show.
export async function streamChat(messages, { onSources, onText, signal } = {}) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages }),
      signal,
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('We could not reach the assistant. Please check your connection and try again.');
  }

  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw new ApiError(data.error || 'The assistant could not answer just now. Please try again.', {
      status: response.status,
    });
  }

  // Server-sent events: "data: {json}" lines separated by a blank line.
  const reader = response.body.pipeThrough(new TextDecoderStream()).getReader();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += value;
    let end;
    while ((end = buffer.indexOf('\n\n')) !== -1) {
      const line = buffer.slice(0, end).trim();
      buffer = buffer.slice(end + 2);
      if (!line.startsWith('data:')) continue;
      const event = JSON.parse(line.slice(5));
      if (event.type === 'sources') onSources?.(event.sources);
      else if (event.type === 'text') onText?.(event.text);
      else if (event.type === 'error') throw new ApiError(event.error);
      else if (event.type === 'done') return;
    }
  }
}

// A post's approved comments, with its average star rating.
export async function fetchComments(slug) {
  const response = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(slug)}/comments`);
  if (!response.ok) throw new ApiError('Could not load the comments.', { status: response.status });
  return response.json();
}

// Sends a comment; it shows once approved in the dashboard.
export async function sendComment(slug, comment) {
  let response;
  try {
    response = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(slug)}/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comment),
    });
  } catch {
    throw new ApiError('We could not reach the server. Please try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Your comment could not be sent.', { fields: data.fields, status: response.status });
  return data;
}

// Published blog posts, newest first (without their full text).
export async function fetchPosts() {
  const response = await fetch(`${baseUrl}/api/posts`);
  if (!response.ok) throw new ApiError('Could not load the blog.', { status: response.status });
  return (await response.json()).posts;
}

// One published post by its web address, or null if there is none.
export async function fetchPost(slug) {
  const response = await fetch(`${baseUrl}/api/posts/${encodeURIComponent(slug)}`);
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError('Could not load this post.', { status: response.status });
  return response.json();
}
