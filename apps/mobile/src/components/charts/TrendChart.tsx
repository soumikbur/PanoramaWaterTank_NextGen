import React, { useRef, useEffect, useState } from 'react';
import { colors, metrics } from '../../theme';

export interface TrendPoint {
  xRatio: number; // 0.0 to 1.0
  value: number; // 0 to 100%
  timestampMs?: number;
}

interface TrendChartProps {
  values: TrendPoint[];
  lineColor?: string;
  areaColor?: string;
  gridColor?: string;
  style?: React.CSSProperties;
}

export const TrendChart: React.FC<TrendChartProps> = ({
  values,
  lineColor = colors.primary,
  areaColor = 'rgba(20, 121, 232, 0.16)',
  gridColor = colors.divider,
  style,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState({ width: 400, height: 200 });

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setSize({
          width: containerRef.current.clientWidth,
          height: containerRef.current.clientHeight,
        });
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const w = Math.max(10, size.width);
  const h = Math.max(10, size.height);
  const topPad = 4;
  const botPad = 6;
  const usableH = Math.max(1, h - topPad - botPad);

  // Map values to coordinates
  const pts = values.map((pt) => {
    const clampedVal = Math.max(0, Math.min(100, pt.value));
    const x = Math.max(0, Math.min(w, pt.xRatio * w));
    const y = topPad + usableH * (1.0 - clampedVal / 100.0);
    return { x, y, value: clampedVal };
  });

  // Calculate SVG Bézier curve and area path
  let linePath = '';
  let areaPath = '';

  if (pts.length === 1) {
    linePath = `M 0,${pts[0].y.toFixed(1)} L ${w.toFixed(1)},${pts[0].y.toFixed(1)}`;
    areaPath = `${linePath} L ${w.toFixed(1)},${(h - botPad).toFixed(1)} L 0,${(h - botPad).toFixed(1)} Z`;
  } else if (pts.length === 2) {
    linePath = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
    areaPath = `${linePath} L ${pts[1].x.toFixed(1)},${(h - botPad).toFixed(1)} L ${pts[0].x.toFixed(1)},${(h - botPad).toFixed(1)} Z`;
  } else if (pts.length > 2) {
    linePath = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
    for (let i = 1; i < pts.length - 1; i++) {
      const midX = (pts[i].x + pts[i + 1].x) / 2;
      const midY = (pts[i].y + pts[i + 1].y) / 2;
      linePath += ` Q ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`;
    }
    linePath += ` L ${pts[pts.length - 1].x.toFixed(1)},${pts[pts.length - 1].y.toFixed(1)}`;
    areaPath = `${linePath} L ${pts[pts.length - 1].x.toFixed(1)},${(h - botPad).toFixed(1)} L ${pts[0].x.toFixed(1)},${(h - botPad).toFixed(1)} Z`;
  }

  // Sample points for dots if many
  const step = pts.length > 24 ? Math.ceil(pts.length / 16) : 1;
  const samplePts = pts.filter((_, idx) => idx % step === 0 || idx === pts.length - 1);
  const lastPt = pts.length > 0 ? pts[pts.length - 1] : null;

  return (
    <div ref={containerRef} style={{ width: '100%', height: '100%', position: 'relative', overflow: 'hidden', ...style }}>
      {/* 5 Horizontal Grid Lines (100%, 75%, 50%, 25%, 0%) */}
      {[0, 1, 2, 3, 4].map((i) => {
        const y = Math.round(topPad + usableH * (i / 4));
        return (
          <div
            key={i}
            style={{
              position: 'absolute',
              top: `${y}px`,
              left: 0,
              right: 0,
              height: '1px',
              backgroundColor: gridColor,
            }}
          />
        );
      })}

      {/* SVG Curve & Area */}
      {pts.length > 0 && (
        <svg width={w} height={h} style={{ position: 'absolute', top: 0, left: 0 }}>
          {areaPath && <path d={areaPath} fill={areaColor} />}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={metrics.chartLineThickness}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
          {samplePts.map((p, idx) => (
            <circle
              key={idx}
              cx={p.x}
              cy={p.y}
              r={metrics.chartPointRadius}
              fill={lineColor}
              stroke="#FFFFFF"
              strokeWidth="1.5"
            />
          ))}
        </svg>
      )}

      {/* Tooltip Badge at Latest Point */}
      {lastPt && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(w - 60, lastPt.x - 68))}px`,
            top: `${Math.max(0, Math.min(h - 26, lastPt.y - 28))}px`,
            backgroundColor: lineColor,
            color: '#FFFFFF',
            borderRadius: '4px',
            padding: '2px 8px',
            fontSize: '11px',
            fontWeight: 700,
            whiteSpace: 'nowrap',
            zIndex: 10,
            boxShadow: '0 2px 4px rgba(0,0,0,0.15)',
          }}
        >
          {lastPt.value.toFixed(2)}%
        </div>
      )}

      {/* Outer Ring Dot at Latest Point */}
      {lastPt && (
        <div
          style={{
            position: 'absolute',
            left: `${Math.max(0, Math.min(w - 10, lastPt.x - 5))}px`,
            top: `${Math.max(0, Math.min(h - 10, lastPt.y - 5))}px`,
            width: '10px',
            height: '10px',
            borderRadius: '5px',
            backgroundColor: '#FFFFFF',
            border: `2.5px solid ${lineColor}`,
            boxSizing: 'border-box',
            zIndex: 11,
          }}
        />
      )}
    </div>
  );
};

