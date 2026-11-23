// The store finder's pieces that need no database or Google: reading an
// Excel file, matching columns, cleaning rows, spotting duplicates and
// changes, showing addresses, reading pasted map links, how far an address
// match is trusted, whether a Google listing is the shop, and the ranking.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deflateRawSync } from 'node:zlib';
import { addressLine, cleanDoor, diffStores, geocodeQuery, mapColumns, prettify, storesFromRows } from '../src/lib/stores/sheet.js';
import { readXlsx } from '../src/lib/stores/xlsx.js';
import { classifyGeocode, haversineKm, isCholanShop, localityNamesStore, matchListings, parseLocation } from '../src/lib/stores/geo.js';
import { rank } from '../src/lib/stores/service.js';

// A tiny real .xlsx (zip of XML), built here.
function zip(files) {
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const data = deflateRawSync(Buffer.from(text));
    const n = Buffer.from(name);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(data.length, 18);
    local.writeUInt16LE(n.length, 26);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt16LE(n.length, 28);
    central.writeUInt32LE(offset, 42);
    locals.push(local, n, data);
    centrals.push(central, n);
    offset += 30 + n.length + data.length;
  }
  const dir = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(Object.keys(files).length, 8);
  end.writeUInt16LE(Object.keys(files).length, 10);
  end.writeUInt32LE(dir.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

test('an Excel file is read: shared text, inline text, numbers and gaps', () => {
  const buf = zip({
    'xl/workbook.xml': '<workbook><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>',
    'xl/_rels/workbook.xml.rels': '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>',
    'xl/sharedStrings.xml': '<sst><si><t>Shop Code</t></si><si><t>Branch</t></si><si><r><t>Sul</t></r><r><t>ur &amp; Co</t></r></si></sst>',
    'xl/worksheets/sheet1.xml':
      '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="inlineStr"><is><t>Pincode</t></is></c></row>' +
      '<row r="2"><c r="A2" t="str"><v>CHO1</v></c><c r="B2" t="s"><v>2</v></c><c r="D2"><v>641402</v></c></row></sheetData></worksheet>',
  });
  assert.deepEqual(readXlsx(buf), [
    ['Shop Code', 'Branch', '', 'Pincode'],
    ['CHO1', 'Sulur & Co', '', '641402'],
  ]);
  assert.throws(() => readXlsx(Buffer.from('not a zip file at all, just some text that is long enough to pass the size check......')), /not an Excel/);
});

test('columns are found whatever the sheet calls them', () => {
  const { columns, unused } = mapColumns(['S,NO', 'Shop Code', 'Branch', 'Region', 'Zone', 'ASM Name', 'Door No.', 'Street Name', 'Area', 'Landmark', 'Taluk', 'Pincode', 'Notes']);
  assert.equal(columns.code, 1);
  assert.equal(columns.name, 2);
  assert.equal(columns.manager, 5);
  assert.equal(columns.doorNo, 6);
  assert.equal(columns.pincode, 11);
  assert.deepEqual(unused, ['Notes']);
  const other = mapColumns(['Store Name', 'Address', 'City', 'PIN Code', 'Mobile Number', 'Latitude', 'Longitude']).columns;
  assert.deepEqual(other, { name: 0, street: 1, taluk: 2, pincode: 3, phone: 4, lat: 5, lng: 6 });
});

const header = ['S,NO', 'Shop Code', 'Branch', 'Zone', 'ASM Name', 'Door No.', 'Street Name', 'Area', 'Landmark', 'Taluk', 'Pincode'];
const sheet = [
  header,
  ['1', 'CHO100163', 'Erisanam Pettai', 'Coimbatore', 'BHARATHIRAJAN', 'Door No.62', ' GOVERNMENT HOSIPTAL OPP UDUMALAI ANAMALAI ROAD ', 'ERISANAMPATTI', 'OPP GH', 'UDUMALPET', '642207'],
  ['2', 'cho100197', 'Pallapalayam', 'Coimbatore', 'B', 'NO 4/213', 'MUNNAR ROAD', 'PALLAPALAYM', '', 'UDUMALPET', '642 112'],
  ['3', 'CHO100163', 'Copy', 'Coimbatore', 'B', '1', 'X road', 'Y', '', '', '642207'],
  ['4', 'CHO1', 'No pin', 'Coimbatore', 'B', '1', 'X road', 'Y', '', '', '64'],
  ['5', '', 'Pallapalayam', 'Coimbatore', 'B', '9', 'Other road', 'Z', '', '', '642112'],
];

test('rows become stores; bad rows and duplicate codes are listed, not imported', () => {
  const { stores, invalid, warnings } = storesFromRows(sheet);
  assert.equal(stores.length, 3);
  assert.deepEqual(stores[0], {
    name: 'Erisanam Pettai', region: '', zone: 'Coimbatore', manager: 'BHARATHIRAJAN', doorNo: '62', street: 'GOVERNMENT HOSIPTAL OPP UDUMALAI ANAMALAI ROAD',
    area: 'ERISANAMPATTI', landmark: 'OPP GH', taluk: 'UDUMALPET', district: '', state: 'Tamil Nadu', pincode: '642207', phone: '', code: 'CHO100163', row: 2,
  });
  assert.equal(stores[1].code, 'CHO100197');
  assert.equal(stores[1].pincode, '642112');
  assert.equal(stores[2].code, 'AUTO-642112-PALLAPALAYAM');
  assert.deepEqual(invalid.map((x) => [x.row, x.problems[0]]), [
    [4, 'same shop code as row 2'],
    [5, 'pincode "64" is not 6 digits'],
  ]);
  assert.equal(warnings[0].code, 'AUTO-642112-PALLAPALAYAM');
  assert.throws(() => storesFromRows([['a', 'b'], ['1', '2']]), /header row/);
});

test('an import is compared with what is saved: new, changed, moved, missing', () => {
  const { stores } = storesFromRows(sheet);
  const saved = [
    { ...stores[0], active: true },
    { ...stores[1], street: 'OLD ROAD', active: true },
    { code: 'CHO999', name: 'Closed one', active: true },
  ];
  const d = diffStores(stores, saved);
  assert.deepEqual(d.added.map((s) => s.code), ['AUTO-642112-PALLAPALAYAM']);
  assert.deepEqual(d.changed.map((s) => [s.code, s.fields, s.moved]), [['CHO100197', ['street'], true]]);
  assert.deepEqual(d.same, ['CHO100163']);
  assert.deepEqual(d.missing, [{ code: 'CHO999', name: 'Closed one' }]);
});

test('addresses read well and are not repeated', () => {
  assert.equal(cleanDoor('Door.no.D.No:4/104/2'), '4/104/2');
  assert.equal(cleanDoor('Door No.No.13/38-4C'), '13/38-4C');
  assert.equal(cleanDoor('SSF.NO 672'), 'SSF.NO 672');
  assert.equal(prettify('OPP RVS SCHOOL NEAR SBI ATM'), 'Opp RVS School Near SBI ATM');
  assert.equal(prettify('Sakthi Complex,Velanthavam Road'), 'Sakthi Complex,Velanthavam Road');
  const s = { doorNo: '9/158/Y2', street: 'KSP GARDEN OPPOSITE, VELIYANGADU ROAD, KARAMADI, COIMBATORE', area: 'Thimampalayam', taluk: 'METTUPALAYAM', pincode: '641104' };
  assert.equal(addressLine(s), '9/158/Y2, KSP Garden Opposite, Veliyangadu Road, Karamadi, Coimbatore, Thimampalayam, Mettupalayam, Tamil Nadu 641104');
  assert.equal(geocodeQuery({ doorNo: 'NO 1', street: 'Erode main road, molasi', area: 'molasi', taluk: 'Tiruchengode', pincode: '637210' }), '1, Erode main road, molasi, Tiruchengode, Tamil Nadu, 637210');
});

test('a pasted Google Maps link or "lat, lng" becomes a pin; anything else does not', () => {
  assert.deepEqual(parseLocation('11.0168, 76.9558'), { lat: 11.0168, lng: 76.9558 });
  assert.deepEqual(parseLocation('https://www.google.com/maps/place/Cholan/@11.05,76.99,17z/data=!3m1!4b1!4m6!3m5!1s0x0:0x0!8m2!3d11.0512!4d76.9934'), { lat: 11.0512, lng: 76.9934 });
  assert.deepEqual(parseLocation('https://maps.google.com/?q=10.6609,77.0048'), { lat: 10.6609, lng: 77.0048 });
  assert.equal(parseLocation('51.5, -0.12'), null); // London
  assert.equal(parseLocation('hello'), null);
});

const geo = (types, locationType, pin, extra = {}) => ({
  formatted_address: 'x',
  types,
  geometry: { location: { lat: 11, lng: 77 }, location_type: locationType },
  address_components: [{ long_name: pin, types: ['postal_code'] }, { long_name: 'Erode', types: ['administrative_area_level_3'] }],
  ...extra,
});

test('only an exact street address in the right pincode counts as an address; the rest is approximate', () => {
  assert.equal(classifyGeocode(geo(['street_address'], 'ROOFTOP', '638001'), '638001').status, 'address');
  assert.equal(classifyGeocode(geo(['street_address'], 'ROOFTOP', '638001'), '638001').district, 'Erode');
  assert.match(classifyGeocode(geo(['street_address'], 'ROOFTOP', '638009'), '638001').note, /pincode 638009/);
  assert.match(classifyGeocode(geo(['postal_code'], 'APPROXIMATE', '638001'), '638001').note, /pincode area/);
  assert.match(classifyGeocode(geo(['route'], 'GEOMETRIC_CENTER', '638001'), '638001').note, /road/);
  assert.equal(classifyGeocode(geo(['street_address'], 'ROOFTOP', '638001', { partial_match: true }), '638001').status, 'approximate');
  assert.equal(classifyGeocode(geo(['establishment'], 'ROOFTOP', '638001'), '638001').status, 'approximate');
  assert.equal(classifyGeocode(undefined, '638001').status, 'missing');
});

const listing = (id, name, address, lat, lng, status) => ({ id, displayName: { text: name }, formattedAddress: address, location: { latitude: lat, longitude: lng }, businessStatus: status });

const at = (lat, lng, status = 'approximate') => ({ lat, lng, status });
const shop = (code, name, area, pincode, anchor, taluk = '') => ({ code, name, area, pincode, anchor, taluk });

test('only Cholan rice shops count as listings, not a Cholan restaurant', () => {
  assert.equal(isCholanShop('Cholan Rice and Millet Shops Private Limited'), true);
  assert.equal(isCholanShop('Cholan'), true);
  assert.equal(isCholanShop('Cholan moolapathai kalvadagam road'), true);
  assert.equal(isCholanShop('Cholan Chettinad Restaurant'), false);
  assert.equal(isCholanShop('Sri Murugan Rice Mundy'), false);
});

test('a listing goes to the store it names, near its address; town names prove nothing', () => {
  const stores = [
    shop('PAL', 'Pallapalayam Udumalai', 'PALLAPALAYM', '642112', at(10.6, 77.2), 'UDUMALPET'),
    shop('T1', 'Tirupur Agraharapudur', 'Tirupur Agraharapudur', '641663', at(11.05, 77.3), 'PALLADAM'),
    shop('T2', 'Tirupur Kallangadu', 'Tirupur Kallangadu', '641664', at(11.0, 77.28), 'PALLADAM'),
    shop('T3', 'Tirupur Nochipalayam', 'Tirupur Nochipalayam', '641605', at(11.02, 77.25), 'PALLADAM'),
    shop('RAT', 'Rathinapuri Sampath Nagar', 'Rathinapuri Sampath Nagar', '641027', at(11.03, 76.96), 'COIMBATORE'),
    shop('SAN', 'Sanganoor', 'Sanganoor', '641027', at(11.04, 76.955), 'COIMBATORE'),
    shop('MOON', 'Moon Road', 'METTUR MAIN ROAD', '638311', at(11.44, 77.68), 'BHAVANI'),
  ];
  const listings = [
    listing('a', 'Cholan Rice and Millet Shops', 'Munnar Rd, Pallapalayam, Tamil Nadu 642112', 10.61, 77.2),
    listing('b', 'Cholan Rice And Millet Shops Pvt. Ltd.', 'MDR878, Velampalayam, Tiruppur, Tamil Nadu 641652', 11.06, 77.32), // only "Tiruppur"
    listing('c', 'CHOLAN RICE AND MILLET SHOPS PRIVATE LIMITED', 'SP Kannusamy Gounder St, Sanganoor, Coimbatore, Tamil Nadu 641027', 11.035, 76.958),
    listing('d', 'Cholan rice and millets', 'FMVX+3G7, Mettur Main Road, Moonroad, Bhavani, Tamil Nadu 638311', 11.45, 77.68),
    listing('e', 'Cholan Chettinad Restaurant', 'Pallapalayam 642112', 10.6, 77.2),
    listing('f', 'Cholan Rice', 'Pallapalayam 642112', 10.6, 77.2, 'CLOSED_PERMANENTLY'),
  ];
  const { matched } = matchListings(stores, listings);
  assert.deepEqual(
    [...matched].map(([code, m]) => [code, m.place.id]).sort(),
    [['MOON', 'd'], ['PAL', 'a'], ['SAN', 'c']],
  );
  // Without an address match a listing must name the store and be in its pincode.
  assert.equal(matchListings([shop('PAL', 'Pallapalayam', 'Pallapalayam', '642112', null)], [listings[0]]).matched.get('PAL').place.id, 'a');
  assert.equal(matchListings([shop('PAL', 'Pallapalayam', 'Pallapalayam', '642999', null)], [listings[0]]).matched.size, 0);
});

test('a street-like area ("Mettur Main Road") proves nothing; an exact door number does; a pincode-only match with a rival nearby is unsure', () => {
  const stores = [
    shop('VAR', 'Varnapuram', 'METTUR MAIN ROAD', '638301', at(11.43, 77.68), 'BHAVANI'),
    shop('MOON', 'Moon Road', 'BHAVANI', '638311', at(11.46, 77.685), 'BHAVANI'),
    shop('M1', 'Mettur dam', 'Mettur', '636401', at(11.8, 77.8), 'METTUR'),
    shop('M2', 'Mettur camp', 'Mettur', '636402', at(11.8, 77.81), 'METTUR'),
    { ...shop('KUL', 'Kullampatti', 'Kullampatti', '637101', at(11.6, 77.85), 'SANKARI'), doorNo: '02/05/102D' },
    shop('G1', 'Ganeshapuram 1', 'Ganeshapuram 1', '641107', at(11.2, 77.0), 'AVINASHI'),
    shop('G2', 'Ganeshapuram 2', 'Ganeshapuram 2', '641107', at(11.24, 77.03), 'AVINASHI'), // its own match is rough, 5 km off
    shop('G3', 'Ganeshapuram (Pothanur)', 'Ganeshapuram', '641023', at(10.9, 76.98), 'COIMBATORE'),
  ];
  const { matched, unsure } = matchListings(stores, [
    listing('moon', 'Cholan rice and millets', 'FMVX+3G7, Mettur Main Road, Moonroad, Bhavani, Tamil Nadu 638311', 11.45, 77.68),
    listing('kul', 'Cholan Rice and Millet Shops Private Limited', '02/05/102D, Arasiramani, Tamil Nadu 637101', 11.61, 77.86),
    listing('gan', 'Cholan Rice and Millet Shops Private Limited', '42QP+VHP, Ganeshapuram, Sarcarsamakulam, Tamil Nadu 641107', 11.201, 77.001),
  ]);
  assert.equal(matched.get('MOON')?.place.id, 'moon');
  assert.equal(matched.has('VAR'), false);
  assert.equal(matched.get('KUL')?.place.id, 'kul');
  assert.equal(matched.has('G1') || matched.has('G2'), false);
  assert.ok(unsure.has('G1') && unsure.has('G2'));
});

test('a wrong pincode in the sheet: trust the locality that names the store, and a listing naming it further off', () => {
  const veera = { name: 'Veera Keralam', area: 'Veera Keralam', taluk: 'KOVAI NORTH', zone: 'Coimbatore', pincode: '641107' };
  const right = { address_components: [{ long_name: 'Veerakeralam', types: ['sublocality', 'political'] }, { long_name: 'Coimbatore', types: ['locality'] }] };
  const wrongTown = { address_components: [{ long_name: 'B.P Agraharam', types: ['sublocality'] }, { long_name: 'Erode', types: ['locality'] }, { long_name: 'Bhavani Main Road', types: ['route'] }] };
  assert.equal(localityNamesStore(right, veera), true);
  assert.equal(localityNamesStore(wrongTown, { name: 'Moon Road', area: 'BHAVANI', taluk: 'BHAVANI', zone: 'Erode', pincode: '638311' }), false);
  // Only the pincode area is known (16 km off); the listing names this store alone.
  const moon = shop('MOON', 'Moon Road', 'BHAVANI', '638311', { lat: 11.636, lng: 77.734, status: 'approximate', level: 'pincode' }, 'BHAVANI');
  const listing1 = listing('m', 'Cholan rice and millets', 'FMVX+3G7, Mettur Main Road, Moonroad, Bhavani, Tamil Nadu 638311', 11.4927, 77.6988);
  assert.equal(matchListings([moon], [listing1]).matched.get('MOON')?.place.id, 'm');
  // The same distance from a road-level match is too far.
  assert.equal(matchListings([{ ...moon, anchor: { ...moon.anchor, level: 'road' } }], [listing1]).matched.size, 0);
});

test('a listing two stores fit about equally is left for staff, with a note on both', () => {
  const stores = [
    shop('SUL', 'Sulur', 'Sulur', '641402', at(11.025, 77.125), 'SULUR'),
    shop('KAL', 'Kalangal', 'Kalangal', '641402', at(11.02, 77.12), 'SULUR'),
    shop('SKL', 'Sulur Kalangal', 'Sulur Kalangal', '641402', at(11.03, 77.13), 'SULUR'),
  ];
  const { matched, unsure } = matchListings(stores, [listing('s', 'Cholan Rice And Millet Shops Private Limited', 'Sulur, Tamil Nadu 641402, India', 11.024, 77.124)]);
  assert.equal(matched.size, 0);
  assert.match(unsure.get('SUL'), /check which store/);
  assert.equal(unsure.size, 3);
});

test('distance, and the ranking: by road first, approximate pins never highlighted, straight line clearly marked', () => {
  assert.ok(Math.abs(haversineKm({ lat: 11.0168, lng: 76.9558 }, { lat: 11.3410, lng: 77.7172 }) - 90.6) < 1); // Coimbatore–Erode
  const store = (code, status, lat) => ({ code, name: code, pincode: '641001', lat, lng: 77, active: true, location: { status } });
  const byLine = [
    { s: store('A', 'approximate', 11.0), km: 1 },
    { s: store('B', 'verified', 11.01), km: 2 },
    { s: store('C', 'address', 11.02), km: 3 },
    { s: store('D', 'verified', 11.03), km: 9 },
  ];
  // Road: C is nearest by road although B is nearer in a straight line.
  const r = rank(byLine, 3, [{ meters: 2500, seconds: 400 }, { meters: 4000, seconds: 600 }, { meters: 3100, seconds: 300 }], 5);
  assert.equal(r.method, 'road');
  assert.deepEqual(r.results.map((x) => [x.code, x.roadKm]), [['A', 2.5], ['C', 3.1], ['B', 4], ['D', null]]);
  assert.equal(r.nearestCode, 'C'); // A's pin is approximate
  assert.equal(r.results[0].precision, 'approximate');
  assert.equal(r.results[0].minutes, 7);
  // One store unreachable by road goes after the reachable ones.
  const r2 = rank(byLine, 3, [{ none: true }, { meters: 4000, seconds: 600 }, { meters: 3100, seconds: 300 }], 5);
  assert.deepEqual(r2.results.map((x) => x.code), ['C', 'B', 'A', 'D']);
  assert.equal(r2.results[2].noRoute, true);
  // No road answers at all: straight line, and nothing claims a road distance.
  const r3 = rank(byLine, 3, null, 5);
  assert.equal(r3.method, 'straight_line');
  assert.ok(r3.results.every((x) => x.roadKm === null));
  assert.deepEqual(r3.results.map((x) => x.code), ['A', 'B', 'C', 'D']);
});

test('a CSV upload is read as rows, quoted commas and all, and becomes stores', async () => {
  const { csvRows } = await import('../src/lib/stores/sheet.js');
  const rows = csvRows('﻿Shop Code,Branch,Street Name,Pincode\r\nCHO1,"Sulur, Main","Kalangal Rd, ""new""",641402\n\nCHO2,Bad,Road,64\n');
  assert.deepEqual(rows, [
    ['Shop Code', 'Branch', 'Street Name', 'Pincode'],
    ['CHO1', 'Sulur, Main', 'Kalangal Rd, "new"', '641402'],
    ['CHO2', 'Bad', 'Road', '64'],
  ]);
  const { stores, invalid } = storesFromRows(rows);
  assert.equal(stores.length, 1);
  assert.equal(invalid[0].row, 3);
});

test('a sheet without some columns leaves those fields alone', () => {
  const { stores, present } = storesFromRows([
    ['Shop Code', 'Branch', 'Street Name', 'Pincode'],
    ['CHO1', 'Sulur', 'New Road', '641402'],
  ]);
  const saved = [{ code: 'CHO1', name: 'Sulur', street: 'Old Road', landmark: 'Opp temple', manager: 'MOHAN', pincode: '641402', active: true }];
  const d = diffStores(stores, saved, present);
  assert.deepEqual(d.changed.map((c) => [c.fields, c.moved]), [[['street'], true]]); // not landmark or manager
});
