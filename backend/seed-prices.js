require('dotenv').config();
const mongoose = require('mongoose');

const categories = {
  Iron: ['iron', 'लोहा'], Steel: ['steel', 'स्टील'], Aluminium: ['aluminium', 'एल्युमिनियम'], Copper: ['copper', 'तांबा'],
  Newspaper: ['newspaper', 'रद्दी'], Cardboard: ['cardboard', 'गत्ता'], Plastic: ['plastic', 'प्लास्टिक'],
};
const records = [
  ['Iron', 30, '2026-09-01'], ['Iron', 31, '2026-09-07'], ['Iron', 30, '2026-09-14'], ['Iron', 32, '2026-09-20'],
  ['Steel', 40, '2026-09-01'], ['Steel', 42, '2026-09-10'], ['Steel', 45, '2026-09-20'],
  ['Aluminium', 105, '2026-09-01'], ['Aluminium', 112, '2026-09-10'], ['Aluminium', 120, '2026-09-20'],
  ['Copper', 620, '2026-09-01'], ['Copper', 640, '2026-09-10'], ['Copper', 650, '2026-09-20'],
  ['Newspaper', 17, '2026-09-01'], ['Newspaper', 17, '2026-09-10'], ['Newspaper', 18, '2026-09-20'],
  ['Cardboard', 7, '2026-09-01'], ['Cardboard', 8, '2026-09-10'], ['Cardboard', 8, '2026-09-20'],
  ['Plastic', 22, '2026-09-01'], ['Plastic', 24, '2026-09-10'], ['Plastic', 25, '2026-09-20'],
].map(([categoryName, price, date]) => ({ categoryId: categories[categoryName][0], categoryName, categoryNameHindi: categories[categoryName][1], price, unit: 'kg', location: { city: 'Greater Noida', state: 'Uttar Pradesh' }, source: 'DEMO DATA - local market sample', recordedAt: new Date(`${date}T10:30:00.000Z`) }));

const Price = mongoose.model('Price', new mongoose.Schema({ categoryId: String, categoryName: String, categoryNameHindi: String, price: Number, unit: String, location: { city: String, state: String }, source: String, recordedAt: Date }, { timestamps: true }));

mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/binzDB').then(async () => {
  await Price.deleteMany({ source: 'DEMO DATA - local market sample' });
  await Price.insertMany(records);
  console.log(`Seeded ${records.length} development price records.`);
  await mongoose.disconnect();
}).catch((error) => { console.error(error); process.exitCode = 1; });
