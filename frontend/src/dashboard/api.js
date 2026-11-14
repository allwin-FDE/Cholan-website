import { apiUrl } from '../lib/api.js';
import { auth } from './firebase.js';

// Calls to the backend's /api/admin routes, signed with the person's login.
export class AdminError extends Error {
  constructor(message, { status, code, fields } = {}) {
    super(message);
    this.status = status;
    this.code = code;
    this.fields = fields || null;
  }
}

async function token() {
  const user = auth.currentUser;
  if (!user) throw new AdminError('Please sign in.', { status: 401 });
  return user.getIdToken();
}

export async function adminFetch(path, { method = 'GET', body, raw, contentType, base = '/api/admin' } = {}) {
  const headers = { Authorization: `Bearer ${await token()}` };
  let payload;
  if (raw) {
    payload = raw;
    headers['Content-Type'] = contentType;
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers['Content-Type'] = 'application/json';
  }
  let response;
  try {
    response = await fetch(`${apiUrl}${base}${path}`, { method, headers, body: payload });
  } catch {
    throw new AdminError('Could not reach the server. Check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new AdminError(data.error || 'Something went wrong.', {
      status: response.status,
      code: data.code,
      fields: data.fields,
    });
  }
  return data;
}

export const api = {
  me: () => adminFetch('/me'),
  overview: (days) => adminFetch(`/overview?days=${days}`),
  pages: (days) => adminFetch(`/pages?days=${days}`),
  visits: (days, params = {}) => adminFetch(`/visits?${new URLSearchParams({ days, ...params })}`),
  visit: (id) => adminFetch(`/visits/${encodeURIComponent(id)}`),
  heatmap: (days, path, device) => adminFetch(`/heatmap?${new URLSearchParams({ days, path, device })}`),
  enquiries: () => adminFetch('/enquiries'),
  updateEnquiry: (id, patch) => adminFetch(`/enquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  deleteEnquiry: (id) => adminFetch(`/enquiries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  subscribers: () => adminFetch('/subscribers'),
  removeSubscriber: (email) => adminFetch(`/subscribers/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  access: () => adminFetch('/access'),
  setAccess: (email, role, note) => adminFetch(`/access/${encodeURIComponent(email)}`, { method: 'PUT', body: { role, note } }),
  removeAccess: (email) => adminFetch(`/access/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  posts: () => adminFetch('/posts'),
  post: (id) => adminFetch(`/posts/${encodeURIComponent(id)}`),
  createPost: (post) => adminFetch('/posts', { method: 'POST', body: post }),
  updatePost: (id, post) => adminFetch(`/posts/${encodeURIComponent(id)}`, { method: 'PUT', body: post }),
  deletePost: (id) => adminFetch(`/posts/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // Blogs from the composer: published at once, or kept as a draft.
  createShortPost: (post) => adminFetch('/short-posts', { method: 'POST', body: post }),
  updateShortPost: (id, post) => adminFetch(`/short-posts/${encodeURIComponent(id)}`, { method: 'PUT', body: post }),
  reviewCount: () => adminFetch('/review-count'),
  comments: () => adminFetch('/comments'),
  setComment: (id, status) => adminFetch(`/comments/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } }),
  deleteComment: (id) => adminFetch(`/comments/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  media: () => adminFetch('/media'),
  deleteMedia: (name) => adminFetch(`/media/${name}`, { method: 'DELETE' }),
  upload: (blob) => adminFetch('/media', { method: 'POST', raw: blob, contentType: blob.type }),
};

// Shrinks a photo before upload: at most 1800px wide, as WebP. A phone photo
// of several MB becomes a few hundred KB, and pages stay quick to load.
export async function prepareImage(file, maxWidth = 1800) {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return file;
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxWidth / bitmap.width);
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', 0.85));
  return blob && blob.size < file.size ? blob : file;
}
