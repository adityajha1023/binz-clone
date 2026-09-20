import React from 'react';
import { ArrowDown, ArrowUp, Minus, Volume2 } from 'lucide-react';
import { speakPrice } from '../utils/speech';

function formatDate(value) {
  if (!value) return 'Update time unavailable';
  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

export default function PriceCard({ price, city }) {
  const changeLabel = price.direction === 'up' ? 'भाव बढ़ा' : price.direction === 'down' ? 'भाव घटा' : price.direction === 'stable' ? 'भाव स्थिर' : 'इतिहास उपलब्ध नहीं';
  const TrendIcon = price.direction === 'up' ? ArrowUp : price.direction === 'down' ? ArrowDown : Minus;
  const changeColor = price.direction === 'up' ? 'up' : price.direction === 'down' ? 'down' : 'stable';

  return (
    <article className="price-card">
      <div className="price-card-heading">
        <div>
          <h3>{price.categoryHindi}</h3>
          <p>{price.category}</p>
        </div>
        <span className="price-source-badge">{price.source?.startsWith('DEMO DATA') ? 'Demo data' : 'BinZ update'}</span>
      </div>
      <div className="price-value">₹{price.currentPrice}<small> / {price.unit}</small></div>
      <p className="previous-price">पिछला भाव: {price.previousPrice === null ? 'पुराना भाव उपलब्ध नहीं' : `₹${price.previousPrice}/${price.unit}`}</p>
      <div className={`price-change ${changeColor}`}>
        <TrendIcon size={18} aria-hidden="true" />
        <strong>{price.change === null ? 'History not available' : `₹${Math.abs(price.change)} ${price.changePercent >= 0 ? '+' : ''}${price.changePercent}%`}</strong>
        <span>{changeLabel}</span>
      </div>
      <p className="price-updated">{price.source} · {formatDate(price.updatedAt)}</p>
      <button className="button secondary price-listen-button" type="button" onClick={() => speakPrice({ ...price, city })}>
        <Volume2 size={18} aria-hidden="true" /> सुनें
      </button>
    </article>
  );
}
