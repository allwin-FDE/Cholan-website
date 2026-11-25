// The shop list from the backend (/api/stores), for the Stores and district pages.
import { apiUrl, ApiError } from './api.js';

async function call(path, init) {
  let response;
  try {
    response = await fetch(`${apiUrl}/api/stores${path}`, init);
  } catch {
    throw new ApiError('We couldn’t reach the server. Please check your connection and try again.');
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || 'Something went wrong. Please try again.', { status: response.status });
  return data;
}

// Every open shop: name, address, district.
export const fetchStores = () => call('');
