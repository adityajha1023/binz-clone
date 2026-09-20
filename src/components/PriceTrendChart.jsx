import React, { useEffect, useRef } from 'react';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

export default function PriceTrendChart({ data }) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    chartRef.current?.destroy();
    if (!canvasRef.current || !data.length) return undefined;
    chartRef.current = new Chart(canvasRef.current, {
      type: 'line',
      data: {
        labels: data.map((point) => point.date),
        datasets: [{
          data: data.map((point) => point.price),
          borderColor: '#0b7c77',
          backgroundColor: 'rgba(11, 124, 119, 0.12)',
          pointBackgroundColor: '#e86f51',
          pointRadius: 5,
          borderWidth: 3,
          fill: true,
          tension: 0.25,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ₹${context.raw}` } } },
        scales: { y: { beginAtZero: false, ticks: { callback: (value) => `₹${value}` } }, x: { ticks: { maxTicksLimit: 5 } } },
      },
    });
    return () => chartRef.current?.destroy();
  }, [data]);

  if (!data.length) return <p className="price-empty">इस चीज़ का पुराना भाव अभी उपलब्ध नहीं है।</p>;
  return <div className="price-chart-wrap"><canvas ref={canvasRef} aria-label="Price trend chart" /></div>;
}
