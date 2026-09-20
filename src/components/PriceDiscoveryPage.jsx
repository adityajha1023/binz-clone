import React, { useEffect, useMemo, useState } from 'react';
import { MapPin, Search, Square, Volume2 } from 'lucide-react';
import PriceCard from './PriceCard';
import PriceTrendChart from './PriceTrendChart';
import { getCurrentPrices, getPriceCategories, getPriceLocations, getPriceTrend, reverseGeocode } from '../services/priceService';
import { speakPriceBoard, stopSpeaking } from '../utils/speech';

const defaultCity = () => localStorage.getItem('priceCity') || 'Greater Noida';

export default function PriceDiscoveryPage() {
  const [categories, setCategories] = useState([]);
  const [locations, setLocations] = useState([]);
  const [prices, setPrices] = useState([]);
  const [city, setCity] = useState(defaultCity);
  const [category, setCategory] = useState('');
  const [search, setSearch] = useState('');
  const [trendRange, setTrendRange] = useState('30d');
  const [trend, setTrend] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [speaking, setSpeaking] = useState(false);
  const [locationStatus, setLocationStatus] = useState('requesting');
  const [locationMessage, setLocationMessage] = useState('आपकी जगह पूछी जा रही है...');

  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationStatus('unavailable');
      setLocationMessage('इस browser में location उपलब्ध नहीं है। नीचे से जगह चुनें।');
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        try {
          const location = await reverseGeocode({ latitude: coords.latitude, longitude: coords.longitude });
          setCity(location.city);
          localStorage.setItem('priceCity', location.city);
          setLocationStatus('granted');
          setLocationMessage(`आपकी जगह: ${location.city}`);
        } catch {
          setLocationStatus('unavailable');
          setLocationMessage('आपकी जगह पहचानी नहीं जा सकी। नीचे से जगह चुनें।');
        }
      },
      () => {
        setLocationStatus('denied');
        setLocationMessage('Location permission नहीं मिली। नीचे से जगह चुनें।');
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 15 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    Promise.all([getPriceCategories(), getPriceLocations()]).then(([categoryResult, locationResult]) => {
      setCategories(categoryResult.categories);
      setLocations(locationResult.locations);
    }).catch(() => setError('भाव की जानकारी लोड नहीं हो सकी। कृपया थोड़ी देर बाद दोबारा कोशिश करें।'));
  }, []);

  useEffect(() => {
    setLoading(true);
    setError('');
    getCurrentPrices({ city, category: category || undefined }).then((result) => setPrices(result.prices)).catch(() => setError('भाव लोड नहीं हो सका। कृपया थोड़ी देर बाद दोबारा कोशिश करें।')).finally(() => setLoading(false));
    localStorage.setItem('priceCity', city);
  }, [city, category]);

  const visiblePrices = useMemo(() => prices.filter((price) => `${price.category} ${price.categoryHindi}`.toLowerCase().includes(search.toLowerCase())), [prices, search]);
  const selectedPrice = visiblePrices[0] || prices[0];

  useEffect(() => {
    if (!selectedPrice) { setTrend(null); return undefined; }
    getPriceTrend({ category: selectedPrice.category, city, range: trendRange }).then(setTrend).catch(() => setTrend(null));
    return undefined;
  }, [selectedPrice, city, trendRange]);

  function handleSpeakBoard() {
    if (speaking) { stopSpeaking(); setSpeaking(false); return; }
    if (speakPriceBoard(visiblePrices, city)) setSpeaking(true);
  }

  useEffect(() => {
    const handleSpeechEnd = () => setSpeaking(false);
    window.addEventListener('binz-speech-ended', handleSpeechEnd);
    return () => window.removeEventListener('binz-speech-ended', handleSpeechEnd);
  }, []);

  return (
    <main className="prices-page">
      <section className="prices-hero section-band">
        <p className="eyebrow">Price Discovery · Latest available BinZ price</p>
        <h1>आज का कबाड़ भाव</h1>
        <p className="prices-lede">Today's scrap prices, previous rates और आसान Hindi में भाव सुनने की सुविधा।</p>
        <div className="prices-location"><MapPin size={20} aria-hidden="true" /><label htmlFor="price-location">स्थान / Location</label><select id="price-location" value={city} onChange={(event) => setCity(event.target.value)}><option value="Greater Noida">Greater Noida</option>{locations.filter((location) => location.city !== 'Greater Noida').map((location) => <option key={`${location.city}-${location.state}`} value={location.city}>{location.city}</option>)}</select></div>
        <p className={`location-status ${locationStatus}`} role="status">{locationMessage}</p>
        <button className="button primary board-speak-button" type="button" disabled={!visiblePrices.length} onClick={handleSpeakBoard}>{speaking ? <><Square size={17} /> रोकें</> : <><Volume2 size={17} /> पूरा भाव सुनें</>}</button>
      </section>
      <section className="price-controls section padded" aria-label="Price filters">
        <label><span><Search size={16} /> कबाड़ खोजें</span><input type="search" placeholder="लोहा, रद्दी, प्लास्टिक..." value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <label><span>Category / श्रेणी</span><select value={category} onChange={(event) => setCategory(event.target.value)}><option value="">All Scrap / सभी</option>{categories.map((item) => <option key={item.id} value={item.name}>{item.nameHindi} · {item.name}</option>)}</select></label>
      </section>
      {error && <p className="price-error" role="alert">{error}</p>}
      <section className="price-board section padded" aria-labelledby="price-board-title">
        <div className="section-heading"><p className="eyebrow">📍 {city}</p><h2 id="price-board-title">आज का भाव <span>Today's Prices</span></h2><p>Latest available price · पुराने भाव से तुलना तभी दिखेगी जब history मौजूद हो।</p></div>
        {loading ? <div className="price-grid" aria-label="Loading prices">{[1, 2, 3].map((item) => <div className="price-skeleton" key={item} />)}</div> : visiblePrices.length ? <div className="price-grid">{visiblePrices.map((price) => <PriceCard key={price.category} price={price} city={city} />)}</div> : <p className="price-empty">अभी इस जगह या चीज़ का भाव उपलब्ध नहीं है।<br />Please check again later.</p>}
      </section>
      <section className="price-trend-section section padded" aria-labelledby="price-trend-title">
        <div className="section-heading"><p className="eyebrow">समझने में आसान</p><h2 id="price-trend-title">भाव का रुझान <span>Price Trend</span></h2></div>
        <div className="trend-card"><div className="trend-tabs">{['7d', '30d', '90d'].map((range) => <button className={trendRange === range ? 'active' : ''} type="button" key={range} onClick={() => setTrendRange(range)}>{range === '7d' ? '7 दिन' : range === '30d' ? '30 दिन' : '90 दिन'}</button>)}</div>{trend && <p className={`trend-summary ${trend.trend}`}>{trend.trend === 'rising' ? '📈 भाव बढ़ रहा है' : trend.trend === 'falling' ? '📉 भाव कम हुआ है' : trend.trend === 'stable' ? '➡️ भाव लगभग स्थिर है' : '📊 पुराना भाव उपलब्ध नहीं है'}{trend.change !== null && <span>{trend.change >= 0 ? ` Price increased by ₹${trend.change}` : ` Price decreased by ₹${Math.abs(trend.change)}`}</span>}</p>}<PriceTrendChart data={trend?.data || []} /></div>
      </section>
      <section className="price-trust section padded"><strong>जानकारी:</strong> हर भाव के साथ source और update time दिया गया है। Demo data को साफ़ तौर पर चिन्हित किया गया है; कोई verified external live market feed अभी connected नहीं है।</section>
    </main>
  );
}
