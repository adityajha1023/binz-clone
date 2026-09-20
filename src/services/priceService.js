import { apiUrl } from '../api';

const demoCategories = [
  { id: 'iron', name: 'Iron', nameHindi: 'लोहा', unit: 'kg' },
  { id: 'steel', name: 'Steel', nameHindi: 'स्टील', unit: 'kg' },
  { id: 'aluminium', name: 'Aluminium', nameHindi: 'एल्युमिनियम', unit: 'kg' },
  { id: 'copper', name: 'Copper', nameHindi: 'तांबा', unit: 'kg' },
  { id: 'newspaper', name: 'Newspaper', nameHindi: 'रद्दी', unit: 'kg' },
  { id: 'cardboard', name: 'Cardboard', nameHindi: 'गत्ता', unit: 'kg' },
  { id: 'plastic', name: 'Plastic', nameHindi: 'प्लास्टिक', unit: 'kg' },
];

const demoRecords = [
  ['Iron', 'लोहा', 30, 32, '2026-09-01'],
  ['Steel', 'स्टील', 42, 45, '2026-09-10'],
  ['Aluminium', 'एल्युमिनियम', 112, 120, '2026-09-10'],
  ['Copper', 'तांबा', 640, 650, '2026-09-10'],
  ['Newspaper', 'रद्दी', 17, 18, '2026-09-10'],
  ['Cardboard', 'गत्ता', 8, 8, '2026-09-10'],
  ['Plastic', 'प्लास्टिक', 24, 25, '2026-09-10'],
].map(([category, categoryHindi, previousPrice, currentPrice, date]) => ({
  category,
  categoryHindi,
  currentPrice,
  previousPrice,
  unit: 'kg',
  change: currentPrice - previousPrice,
  changePercent: Number((((currentPrice - previousPrice) / previousPrice) * 100).toFixed(2)),
  direction: currentPrice > previousPrice ? 'up' : currentPrice < previousPrice ? 'down' : 'stable',
  source: 'DEMO DATA - local development sample',
  updatedAt: `${date}T10:30:00.000Z`,
}));

const demoTrend = {
  Iron: [
    { date: '2026-09-01', price: 30 },
    { date: '2026-09-07', price: 31 },
    { date: '2026-09-14', price: 30 },
    { date: '2026-09-20', price: 32 },
  ],
};

async function request(path) {
  const response = await fetch(apiUrl(path));
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.message || 'Price data is unavailable.');
  return result;
}

async function requestWithDevelopmentFallback(path, fallback) {
  try {
    return await request(path);
  } catch (error) {
    if (import.meta.env.DEV) return fallback;
    throw error;
  }
}

export const getPriceCategories = () => requestWithDevelopmentFallback('/prices/categories', { categories: demoCategories });
export const getPriceLocations = () => requestWithDevelopmentFallback('/prices/locations', { locations: [{ city: 'Greater Noida', state: 'Uttar Pradesh' }] });
export const reverseGeocode = ({ latitude, longitude }) => request(`/prices/location?latitude=${encodeURIComponent(latitude)}&longitude=${encodeURIComponent(longitude)}`);

export function getCurrentPrices({ city, state, category } = {}) {
  const params = new URLSearchParams();
  if (city) params.set('city', city);
  if (state) params.set('state', state);
  if (category) params.set('category', category);
  const filtered = demoRecords.filter((price) => !category || price.category.toLowerCase() === category.toLowerCase());
  return requestWithDevelopmentFallback(`/prices/current?${params.toString()}`, {
    location: { city: city || 'Greater Noida', state: state || 'Uttar Pradesh' },
    prices: filtered,
  });
}

export function getPriceTrend({ category, city, state, range }) {
  const params = new URLSearchParams({ category, range });
  if (city) params.set('city', city);
  if (state) params.set('state', state);
  const data = demoTrend[category] || [];
  const first = data[0]?.price;
  const latest = data.at(-1)?.price;
  const change = first === undefined || latest === undefined ? null : latest - first;
  return requestWithDevelopmentFallback(`/prices/trend?${params.toString()}`, {
    category,
    categoryHindi: demoRecords.find((price) => price.category === category)?.categoryHindi || category,
    location: city || 'Greater Noida',
    range,
    trend: change === null ? 'unknown' : change > 0 ? 'rising' : change < 0 ? 'falling' : 'stable',
    change,
    percentageChange: first ? Number(((change / first) * 100).toFixed(2)) : null,
    data,
  });
}
