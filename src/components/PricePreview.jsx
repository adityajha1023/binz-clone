import React, { useEffect, useState } from 'react';
import { ArrowUp, Volume2 } from 'lucide-react';
import { getCurrentPrices } from '../services/priceService';
import { speakPriceBoard } from '../utils/speech';

export default function PricePreview() {
  const [prices, setPrices] = useState([]);
  useEffect(() => {
    getCurrentPrices({ city: 'Greater Noida' }).then((result) => setPrices(result.prices.slice(0, 3))).catch(() => {});
  }, []);
  return (
    <section className="price-preview section padded" aria-labelledby="price-preview-title">
      <div className="price-preview-copy"><p className="eyebrow">Latest available BinZ prices</p><h2 id="price-preview-title">आज का कबाड़ भाव</h2><p>अपने शहर का भाव देखें और सुनें। यह live market feed नहीं है।</p></div>
      <div className="price-preview-list">{prices.map((price) => <div className="price-preview-item" key={price.category}><span>{price.categoryHindi}</span><strong>₹{price.currentPrice}/{price.unit}</strong><span className="preview-change"><ArrowUp size={14} /> {price.change === null ? 'नया' : 'बदला'}</span></div>)}</div>
      <div className="price-preview-actions"><a className="button primary" href="#prices">पूरा भाव देखें</a><button className="button secondary" type="button" disabled={!prices.length} onClick={() => speakPriceBoard(prices, 'Greater Noida')}><Volume2 size={18} /> भाव सुनें</button></div>
    </section>
  );
}
