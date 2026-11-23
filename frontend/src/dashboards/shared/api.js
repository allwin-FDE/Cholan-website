import { apiUrl } from '../../lib/api.js';
import { auth } from './firebase.js';
import { periodQuery } from './context.js';

const q = (period, extra = {}) => new URLSearchParams({ ...periodQuery(period), ...extra });

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
  // Selling (business database): orders, stock, invoices, payments.
  sales: {
    orders: (status, q) => adminFetch(`/sales/orders?${new URLSearchParams({ status, q })}`),
    order: (id) => adminFetch(`/sales/orders/${id}`),
    deliveries: () => adminFetch('/sales/deliveries'),
    preview: (body) => adminFetch('/sales/orders/preview', { method: 'POST', body }),
    createOrder: (body) => adminFetch('/sales/orders', { method: 'POST', body }),
    editOrder: (id, body) => adminFetch(`/sales/orders/${id}`, { method: 'PUT', body }),
    move: (id, to, extra = {}) => adminFetch(`/sales/orders/${id}/move`, { method: 'POST', body: { to, ...extra } }),
    dispatch: (id, body) => adminFetch(`/sales/orders/${id}/dispatch`, { method: 'POST', body }),
    invoice: (id, body = {}) => adminFetch(`/sales/orders/${id}/invoice`, { method: 'POST', body }),
    recordReturn: (id, body) => adminFetch(`/sales/orders/${id}/returns`, { method: 'POST', body }),
    invoices: (q = '', partyId = '') => adminFetch(`/sales/invoices?${new URLSearchParams({ q, partyId })}`),
    getInvoice: (id) => adminFetch(`/sales/invoices/${id}`),
    cancelInvoice: (id, reason) => adminFetch(`/sales/invoices/${id}/cancel`, { method: 'POST', body: { reason } }),
    creditNote: (id) => adminFetch(`/sales/credit-notes/${id}`),
    receipts: (partyId = '') => adminFetch(`/sales/receipts?${new URLSearchParams({ partyId })}`),
    createReceipt: (body) => adminFetch('/sales/receipts', { method: 'POST', body }),
    allocate: (id, body) => adminFetch(`/sales/receipts/${id}/allocate`, { method: 'POST', body }),
    reverseReceipt: (id, reason) => adminFetch(`/sales/receipts/${id}/reverse`, { method: 'POST', body: { reason } }),
    dues: () => adminFetch('/sales/dues'),
    account: (partyId) => adminFetch(`/sales/accounts/${partyId}`),
    stock: () => adminFetch('/sales/stock'),
    stockMoves: (itemId) => adminFetch(`/sales/stock/${itemId}/moves`),
    adjustStock: (body) => adminFetch('/sales/stock/adjust', { method: 'POST', body }),
    series: () => adminFetch('/sales/series'),
    setSeries: (body) => adminFetch('/sales/series', { method: 'POST', body }),
  },
  // Buying and spending (business database): purchase orders, goods received,
  // supplier bills and payments, what is owed to suppliers, and expenses.
  inward: {
    branches: () => adminFetch('/inward/branches'),
    purchaseOrders: (status = '') => adminFetch(`/inward/purchase-orders?${new URLSearchParams({ status })}`),
    purchaseOrder: (id) => adminFetch(`/inward/purchase-orders/${id}`),
    createPurchaseOrder: (body) => adminFetch('/inward/purchase-orders', { method: 'POST', body }),
    setPurchaseOrderStatus: (id, to, reason) => adminFetch(`/inward/purchase-orders/${id}/status`, { method: 'POST', body: { to, reason } }),
    goodsReceived: () => adminFetch('/inward/goods-received'),
    goodsReceivedNote: (id) => adminFetch(`/inward/goods-received/${id}`),
    createGoodsReceived: (body) => adminFetch('/inward/goods-received', { method: 'POST', body }),
    bills: (q = '', partyId = '') => adminFetch(`/inward/bills?${new URLSearchParams({ q, partyId })}`),
    bill: (id) => adminFetch(`/inward/bills/${id}`),
    createBill: (body) => adminFetch('/inward/bills', { method: 'POST', body }),
    cancelBill: (id, reason) => adminFetch(`/inward/bills/${id}/cancel`, { method: 'POST', body: { reason } }),
    payments: (partyId = '') => adminFetch(`/inward/supplier-payments?${new URLSearchParams({ partyId })}`),
    pay: (body) => adminFetch('/inward/supplier-payments', { method: 'POST', body }),
    reversePayment: (id, reason) => adminFetch(`/inward/supplier-payments/${id}/reverse`, { method: 'POST', body: { reason } }),
    payables: () => adminFetch('/inward/payables'),
    supplierAccount: (partyId) => adminFetch(`/inward/suppliers/${partyId}/account`),
    expenseCategories: () => adminFetch('/inward/expense-categories'),
    saveExpenseCategory: (id, body) => adminFetch(`/inward/expense-categories${id ? `/${id}` : ''}`, { method: id ? 'PUT' : 'POST', body }),
    expenses: (from = '', to = '', categoryId = '') => adminFetch(`/inward/expenses?${new URLSearchParams({ from, to, categoryId })}`),
    createExpense: (body) => adminFetch('/inward/expenses', { method: 'POST', body }),
    cancelExpense: (id, reason) => adminFetch(`/inward/expenses/${id}/cancel`, { method: 'POST', body: { reason } }),
    expensePhoto: (id, blob) => adminFetch(`/inward/expenses/${id}/photo`, { method: 'POST', raw: blob, contentType: blob.type }),
  },
  // Online payments (Razorpay), GST helpers, Tally, reminders and reports.
  accounts: {
    online: () => adminFetch('/accounts/online'),
    switchOnline: (on) => adminFetch('/accounts/online/switch', { method: 'POST', body: { on } }),
    refund: (orderId, reason) => adminFetch(`/accounts/online/orders/${orderId}/refund`, { method: 'POST', body: { reason } }),
  },
  // Business screens (business database): products, customers and suppliers, price lists.
  business: {
    items: () => adminFetch('/business/items'),
    updateItem: (id, patch) => adminFetch(`/business/items/${id}`, { method: 'PATCH', body: patch }),
    priceLists: () => adminFetch('/business/price-lists'),
    priceList: (id) => adminFetch(`/business/price-lists/${id}`),
    setListPrice: (id, body) => adminFetch(`/business/price-lists/${id}/prices`, { method: 'POST', body }),
    endListPrice: (id, priceId, validTo) => adminFetch(`/business/price-lists/${id}/prices/${priceId}/end`, { method: 'POST', body: { validTo } }),
    parties: (type, q) => adminFetch(`/business/parties?${new URLSearchParams({ type, q })}`),
    party: (id) => adminFetch(`/business/parties/${id}`),
    createParty: (body) => adminFetch('/business/parties', { method: 'POST', body }),
    updateParty: (id, body) => adminFetch(`/business/parties/${id}`, { method: 'PUT', body }),
    saveAddress: (id, addressId, body) => adminFetch(`/business/parties/${id}/addresses${addressId ? `/${addressId}` : ''}`, { method: 'POST', body }),
    saveContact: (id, contactId, body) => adminFetch(`/business/parties/${id}/contacts${contactId ? `/${contactId}` : ''}`, { method: 'POST', body }),
    setCustomerPrice: (id, body) => adminFetch(`/business/parties/${id}/prices`, { method: 'POST', body }),
    endCustomerPrice: (id, priceId, validTo) => adminFetch(`/business/parties/${id}/prices/${priceId}/end`, { method: 'POST', body: { validTo } }),
  },
  me: () => adminFetch('/me'),
  overview: (days) => adminFetch(`/overview?${q(days)}`),
  pages: (days) => adminFetch(`/pages?${q(days)}`),
  visits: (days, params = {}) => adminFetch(`/visits?${q(days, params)}`),
  visit: (id) => adminFetch(`/visits/${encodeURIComponent(id)}`),
  visitor: (vid) => adminFetch(`/visitors/${encodeURIComponent(vid)}`),
  heatmap: (days, path, device) => adminFetch(`/heatmap?${q(days, { path, device })}`),
  // The /warehouse analyst pages.
  products: (days) => adminFetch(`/analyst/products?${q(days)}`),
  behaviour: (days) => adminFetch(`/analyst/behaviour?${q(days)}`),
  scroll: (days) => adminFetch(`/analyst/scroll?${q(days)}`),
  journeys: (days) => adminFetch(`/analyst/journeys?${q(days)}`),
  sources: (days) => adminFetch(`/analyst/sources?${q(days)}`),
  realtime: () => adminFetch('/analyst/realtime'),
  deleteVisits: (ids) => adminFetch('/visits/delete', { method: 'POST', body: { ids } }),
  enquiries: () => adminFetch('/enquiries'),
  updateEnquiry: (id, patch) => adminFetch(`/enquiries/${encodeURIComponent(id)}`, { method: 'PATCH', body: patch }),
  deleteEnquiry: (id) => adminFetch(`/enquiries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
  // The store finder's list (/stores): import a sheet, place stores, fix pins.
  stores: {
    list: () => adminFetch('/stores'),
    // Google Maps use today against the daily limits (the bar on the Stores page).
    usage: () => adminFetch('/stores/usage'),
    importSheet: (file, { commit = false, hideMissing = false } = {}) =>
      adminFetch(`/stores/import?${new URLSearchParams({ commit: commit ? '1' : '0', hideMissing: hideMissing ? '1' : '0' })}`, { method: 'POST', raw: file, contentType: file.type || 'application/octet-stream' }),
    locate: (body = {}) => adminFetch('/stores/locate', { method: 'POST', body }),
    update: (code, body) => adminFetch(`/stores/${encodeURIComponent(code)}`, { method: 'PATCH', body }),
  },
  subscribers: () => adminFetch('/subscribers'),
  removeSubscriber: (email) => adminFetch(`/subscribers/${encodeURIComponent(email)}`, { method: 'DELETE' }),
  access: () => adminFetch('/access'),
  setAccess: (email, role, note, apps) => adminFetch(`/access/${encodeURIComponent(email)}`, { method: 'PUT', body: { role, note, apps } }),
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

// Opens the private photo of an expense bill in a new tab. It needs the
// person's login, so it is fetched here rather than linked directly.
export async function openExpensePhoto(id) {
  const tab = window.open('', '_blank');
  try {
    const response = await fetch(`${apiUrl}/api/admin/inward/expenses/${id}/photo`, { headers: { Authorization: `Bearer ${await token()}` } });
    if (!response.ok) throw new AdminError((await response.json().catch(() => ({}))).error || 'Could not open the photo.');
    const url = URL.createObjectURL(await response.blob());
    if (tab) tab.location.href = url;
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

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
