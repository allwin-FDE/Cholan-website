// Calls to the backend. The base URL comes from VITE_API_URL at build time and
// falls back to the dev server's localhost port.
const baseUrl = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/$/, '');

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
