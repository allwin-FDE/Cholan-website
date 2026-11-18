// Shared by the Business pages: labels, the GST state list and money display.
// Amounts come from the server in paise and are typed in rupees.

export const SEGMENTS = {
  b2c: 'Household (B2C)',
  retailer: 'Retail shop / grocer',
  hotel: 'Hotel, restaurant, caterer',
  distributor: 'Distributor / wholesaler',
  institution: 'Institution',
};
export const SUPPLIER_TYPES = {
  mill: 'Rice mill',
  farmer: 'Farmer',
  agent: 'Agent / broker',
  packing: 'Packing material',
  transport: 'Transport',
  other: 'Other',
};
export const CREDIT_STATUS = {
  active: ['Active', 'good'],
  hold: ['On hold', 'warn'],
  blocked: ['Blocked', 'bad'],
};

// GST state codes: the first two digits of a GSTIN.
export const STATES = [
  ['33', 'Tamil Nadu'], ['32', 'Kerala'], ['29', 'Karnataka'], ['37', 'Andhra Pradesh'], ['36', 'Telangana'], ['34', 'Puducherry'],
  ['01', 'Jammu and Kashmir'], ['02', 'Himachal Pradesh'], ['03', 'Punjab'], ['04', 'Chandigarh'], ['05', 'Uttarakhand'],
  ['06', 'Haryana'], ['07', 'Delhi'], ['08', 'Rajasthan'], ['09', 'Uttar Pradesh'], ['10', 'Bihar'], ['11', 'Sikkim'],
  ['12', 'Arunachal Pradesh'], ['13', 'Nagaland'], ['14', 'Manipur'], ['15', 'Mizoram'], ['16', 'Tripura'], ['17', 'Meghalaya'],
  ['18', 'Assam'], ['19', 'West Bengal'], ['20', 'Jharkhand'], ['21', 'Odisha'], ['22', 'Chhattisgarh'], ['23', 'Madhya Pradesh'],
  ['24', 'Gujarat'], ['26', 'Dadra and Nagar Haveli and Daman and Diu'], ['27', 'Maharashtra'], ['30', 'Goa'], ['31', 'Lakshadweep'],
  ['35', 'Andaman and Nicobar Islands'], ['38', 'Ladakh'], ['97', 'Other territory'],
];
export const stateName = (code) => STATES.find(([c]) => c === code)?.[1] || code;

const rupees = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2, minimumFractionDigits: 0 });
export const money = (paise) => (paise == null ? '—' : rupees.format(paise / 100));
// For a form field: 245000 paise → "2450".
export const toRupeesInput = (paise) => (paise == null ? '' : String(paise / 100));

export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10);
export const niceDate = (ymd) =>
  ymd ? new Date(`${ymd}T00:00:00+05:30`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';
export const phoneShow = (e164) => (e164 ? e164.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : '');
