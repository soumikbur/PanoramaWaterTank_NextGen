import React, { useRef, useEffect, useState, useMemo } from 'react';
import { colors, metrics } from '../../theme';
import { useDisplayPreferences } from '../../context/DisplayPreferencesContext';

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
  const { activePerformanceConfig } = useDisplayPreferences();
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

  // Decimate points based on active performance profile
  const effectivePoints = useMemo(() => {
    if (!values || values.length === 0) return [];
    const maxPts = activePerformanceConfig.chartMaxPoints || 40;
    if (values.length <= maxPts) return values;

    const step = Math.ceil(values.length / maxPts);
    const decimated: TrendPoint[] = [];
    for (let i = 0; i < values.length; i += step) {
      decimated.push(values[i]);
    }
    // Always include latest point
    if (decimated[decimated.length - 1] !== values[values.length - 1]) {
      decimated.push(values[values.length - 1]);
    }
    return decimated;
  }, [values, activePerformanceConfig.chartMaxPoints]);

  // Map values to coordinates
  const pts = useMemo(() => {
    return effectivePoints.map((pt) => {
      const clampedVal = Math.max(0, Math.min(100, pt.value));
      const x = Math.max(0, Math.min(w, pt.xRatio * w));
      const y = topPad + usableH * (1.0 - clampedVal / 100.0);
      return { x, y, value: clampedVal };
    });
  }, [effectivePoints, w, usableH]);

  // Calculate SVG curve and area path
  const { linePath, areaPath } = useMemo(() => {
    let lp = '';
    let ap = '';

    if (pts.length === 1) {
      lp = `M 0,${pts[0].y.toFixed(1)} L ${w.toFixed(1)},${pts[0].y.toFixed(1)}`;
      ap = `${lp} L ${w.toFixed(1)},${(h - botPad).toFixed(1)} L 0,${(h - botPad).toFixed(1)} Z`;
    } else if (pts.length === 2) {
      lp = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)} L ${pts[1].x.toFixed(1)},${pts[1].y.toFixed(1)}`;
      ap = `${lp} L ${pts[1].x.toFixed(1)},${(h - botPad).toFixed(1)} L ${pts[0].x.toFixed(1)},${(h - botPad).toFixed(1)} Z`;
    } else if (pts.length > 2) {
      lp = `M ${pts[0].x.toFixed(1)},${pts[0].y.toFixed(1)}`;
      const isLowTier = activePerformanceConfig.id === 'low';

      if (isLowTier) {
        // Fast linear SVG path for low resource devices
        for (let i = 1; i < pts.length; i++) {
          lp += ` L ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)}`;
        }
      } else {
        // Smooth Bézier curve for High / Balanced profile
        for (let i = 1; i < pts.length - 1; i++) {
          const midX = (pts[i].x + pts[i + 1].x) / 2;
          const midY = (pts[i].y + pts[i + 1].y) / 2;
          lp += ` Q ${pts[i].x.toFixed(1)},${pts[i].y.toFixed(1)} ${midX.toFixed(1)},${midY.toFixed(1)}`;
        }
        lp += ` L ${pts[pts.length - 1].x.toFixed(1)},${pts[pts.length - 1].y.toFixed(1)}`;
      }
      ap = `${lp} L ${pts[pts.length - 1].x.toFixed(1)},${(h - botPad).toFixed(1)} L ${pts[0].x.toFixed(1)},${(h - botPad).toFixed(1)} Z`;
    }
    return { linePath: lp, areaPath: ap };
  }, [pts, w, h, activePerformanceConfig.id]);

  // Sample points for dots if many
  const samplePts = useMemo(() => {
    if (activePerformanceConfig.id === 'low') return []; // Skip individual point dots on low-resource
    const step = pts.length > 24 ? Math.ceil(pts.length / 16) : 1;
    return pts.filter((_, idx) => idx % step === 0 || idx === pts.length - 1);
  }, [pts, activePerformanceConfig.id]);

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
          {areaPath && (
            <path
              d={areaPath}
              fill={areaColor}
              style={{ transition: 'd 220ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), fill 200ms ease' }}
            />
          )}
          {linePath && (
            <path
              d={linePath}
              fill="none"
              stroke={lineColor}
              strokeWidth={metrics.chartLineThickness}
              strokeLinecap="round"
              strokeLinejoin="round"
              style={{ transition: 'd 220ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), stroke 200ms ease' }}
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
              style={{ transition: 'cx 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), cy 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1))' }}
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
            transition: 'left 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), top 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), opacity 150ms ease',
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
            transition: 'left 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1)), top 200ms var(--ease-standard, cubic-bezier(0.2, 0, 0, 1))',
          }}
        />
      )}
    </div>
  );
};

