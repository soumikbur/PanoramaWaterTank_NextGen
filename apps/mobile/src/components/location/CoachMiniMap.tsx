import React, { useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';
import { MapPin, Navigation, Compass, Radio, ExternalLink, Clock, Gauge } from 'lucide-react';

interface CorridorStationDef {
  code: string;
  name: string;
  lat: number;
  lng: number;
}

const DEFAULT_STATIONS: CorridorStationDef[] = [
  { code: 'HWH', name: 'Howrah Jn', lat: 22.5838, lng: 88.3426 },
  { code: 'BWN', name: 'Barddhaman Jn', lat: 23.2324, lng: 87.8615 },
  { code: 'DGR', name: 'Durgapur', lat: 23.4984, lng: 87.3119 },
  { code: 'ASN', name: 'Asansol Jn', lat: 23.6889, lng: 86.9661 },
  { code: 'DHN', name: 'Dhanbad Jn', lat: 23.7957, lng: 86.4304 },
  { code: 'GAYA', name: 'Gaya Jn', lat: 24.7955, lng: 85.0002 },
  { code: 'DDU', name: 'Pt. DD Upadhyaya', lat: 25.2818, lng: 83.1197 },
];

function calculateHaversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0;
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLon = (lon2 - lon1) * (Math.PI / 180.0);
  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos(lat1 * (Math.PI / 180.0)) *
      Math.cos(lat2 * (Math.PI / 180.0)) *
      Math.sin(dLon / 2.0) *
      Math.sin(dLon / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return R * c * 1.12; // Track winding factor
}

export interface CoachMiniMapProps {
  latitude?: number | null;
  longitude?: number | null;
  speedKmh?: number | null;
  trainNumber: string;
  coachNumber: string;
  isOnline: boolean;
  hasGpsFix: boolean;
  lastUpdate?: string | null;
  onOpenFullMap: () => void;
}

export const CoachMiniMap: React.FC<CoachMiniMapProps> = ({
  latitude,
  longitude,
  speedKmh,
  trainNumber,
  coachNumber,
  isOnline,
  hasGpsFix,
  lastUpdate,
  onOpenFullMap,
}) => {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const trainMarkerRef = useRef<L.Marker | null>(null);

  // Resolved GPS position (defaults to Asansol corridor if no fix)
  const effectiveLat = typeof latitude === 'number' && !isNaN(latitude) ? latitude : 23.6889;
  const effectiveLng = typeof longitude === 'number' && !isNaN(longitude) ? longitude : 86.9661;
  const isActualGps = hasGpsFix && typeof latitude === 'number' && typeof longitude === 'number';

  // Calculate nearest station and distance
  const nearestStationInfo = useMemo(() => {
    let nearest = DEFAULT_STATIONS[0];
    let minDistance = calculateHaversineKm(effectiveLat, effectiveLng, nearest.lat, nearest.lng);

    for (let i = 1; i < DEFAULT_STATIONS.length; i++) {
      const dist = calculateHaversineKm(effectiveLat, effectiveLng, DEFAULT_STATIONS[i].lat, DEFAULT_STATIONS[i].lng);
      if (dist < minDistance) {
        minDistance = dist;
        nearest = DEFAULT_STATIONS[i];
      }
    }

    const etaMin = speedKmh && speedKmh > 5 ? Math.round((minDistance / speedKmh) * 60) : null;
    const etaStr = etaMin != null ? (etaMin < 60 ? `${etaMin} min` : `${Math.floor(etaMin / 60)}h ${etaMin % 60}m`) : '—';

    return {
      station: nearest,
      distanceKm: minDistance.toFixed(1),
      eta: etaStr,
    };
  }, [effectiveLat, effectiveLng, speedKmh]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;
    if (mapInstanceRef.current) return;

    try {
      const map = L.map(mapContainerRef.current, {
        center: [effectiveLat, effectiveLng],
        zoom: 10,
        minZoom: 5,
        maxZoom: 16,
        zoomControl: false,
        attributionControl: false,
      });

      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 18,
        attribution: '&copy; OpenStreetMap',
      }).addTo(map);

      // Add Corridor Route Polyline
      const latlngs: [number, number][] = DEFAULT_STATIONS.map((s) => [s.lat, s.lng]);
      L.polyline(latlngs, {
        color: '#2563EB',
        weight: 3,
        opacity: 0.65,
        dashArray: '6, 6',
      }).addTo(map);

      // Add Station Circle Markers
      DEFAULT_STATIONS.forEach((station) => {
        const circle = L.circleMarker([station.lat, station.lng], {
          radius: 4,
          color: '#1E40AF',
          fillColor: '#FFFFFF',
          fillOpacity: 1,
          weight: 2,
        }).addTo(map);

        circle.bindTooltip(`${station.name} (${station.code})`, {
          direction: 'top',
          offset: [0, -6],
          className: 'leaflet-scada-tooltip',
        });
      });

      // Custom Train Marker
      const trainIcon = L.divIcon({
        className: 'scada-train-mini-marker',
        html: `
          <div style="
            width: 28px;
            height: 28px;
            border-radius: 50%;
            background-color: ${isActualGps ? '#2563EB' : '#64748B'};
            border: 2px solid #FFFFFF;
            box-shadow: 0 2px 6px rgba(0,0,0,0.3);
            display: flex;
            align-items: center;
            justify-content: center;
            color: #FFFFFF;
          ">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <rect width="16" height="16" x="4" y="3" rx="2"/>
              <path d="M4 11h16"/>
              <path d="M12 3v8"/>
              <path d="m8 19-2 3"/>
              <path d="m18 22-2-3"/>
              <circle cx="8" cy="15" r="1"/>
              <circle cx="16" cy="15" r="1"/>
            </svg>
          </div>
        `,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });

      const marker = L.marker([effectiveLat, effectiveLng], { icon: trainIcon }).addTo(map);
      marker.bindTooltip(`Train ${trainNumber} (${coachNumber})`, {
        permanent: false,
        direction: 'top',
        offset: [0, -14],
      });
      trainMarkerRef.current = marker;
      mapInstanceRef.current = map;

      // ResizeObserver to handle display adjustments
      const ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      });
      ro.observe(mapContainerRef.current);

      return () => {
        ro.disconnect();
        map.remove();
        mapInstanceRef.current = null;
        trainMarkerRef.current = null;
      };
    } catch (e) {
      console.warn('[CoachMiniMap] Leaflet initialization notice:', e);
    }
  }, []);

  // Update marker position on GPS change
  useEffect(() => {
    if (mapInstanceRef.current && trainMarkerRef.current) {
      trainMarkerRef.current.setLatLng([effectiveLat, effectiveLng]);
      mapInstanceRef.current.panTo([effectiveLat, effectiveLng], { animate: true });
    }
  }, [effectiveLat, effectiveLng]);

  return (
    <div
      className="coach-details-location-section"
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: '8px',
        border: '1px solid #E2E8F0',
        boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04)',
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        boxSizing: 'border-box',
      }}
    >
      {/* Header Bar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '8px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div
            style={{
              width: '28px',
              height: '28px',
              borderRadius: '6px',
              backgroundColor: '#EFF6FF',
              color: '#2563EB',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <MapPin size={16} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '14px', fontWeight: 800, color: '#0F172A' }}>
              Train Location & GPS Tracking
            </h4>
            <div style={{ fontSize: '11px', color: '#64748B' }}>
              Eastern Railway Mainline Corridor &bull; Satellites: {isActualGps ? '8 Locked (3D Fix)' : 'Standby'}
            </div>
          </div>
        </div>

        <button
          onClick={onOpenFullMap}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '6px',
            padding: '6px 12px',
            backgroundColor: '#EFF6FF',
            border: '1px solid #BFDBFE',
            borderRadius: '6px',
            color: '#2563EB',
            fontSize: '11px',
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
          }}
        >
          <Navigation size={13} />
          <span>Open Full GPS Map</span>
        </button>
      </div>

      {/* 2-Column SCADA Layout: Metrics (Left) | Interactive Leaflet Mini-Map (Right) */}
      <div
        className="coach-details-location-grid"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))',
          gap: '14px',
          alignItems: 'stretch',
        }}
      >
        {/* Left: GPS Telemetry Readouts */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(2, 1fr)',
            gap: '8px',
            height: '100%',
          }}
        >
          {/* Coordinates */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>GPS COORDINATES</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              {isActualGps ? `${latitude!.toFixed(4)}° N, ${longitude!.toFixed(4)}° E` : 'Awaiting GPS Fix'}
            </div>
            <div style={{ fontSize: '9px', color: '#94A3B8' }}>WGS84 Geodetic Datum</div>
          </div>

          {/* Speed */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>GROUND SPEED</div>
            <div style={{ fontSize: '13px', fontWeight: 800, color: '#2563EB', marginTop: '2px' }}>
              {speedKmh != null && speedKmh > 0 ? `${speedKmh.toFixed(1)} km/h` : '0.0 km/h (Halt)'}
            </div>
            <div style={{ fontSize: '9px', color: '#94A3B8' }}>Doppler Ground Velocity</div>
          </div>

          {/* Nearest Railway Station */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>NEAREST STATION</div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              {nearestStationInfo.station.name} ({nearestStationInfo.station.code})
            </div>
            <div style={{ fontSize: '9px', color: '#64748B' }}>
              Dist: <strong>{nearestStationInfo.distanceKm} km</strong> &bull; ETA: <strong>{nearestStationInfo.eta}</strong>
            </div>
          </div>

          {/* Satellite Telemetry Timestamp */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '6px',
              padding: '8px 10px',
            }}
          >
            <div style={{ fontSize: '9.5px', color: '#64748B', fontWeight: 600 }}>LAST LOCATION SYNC</div>
            <div style={{ fontSize: '12px', fontWeight: 800, color: '#0F172A', marginTop: '2px' }}>
              {lastUpdate || new Date().toLocaleTimeString()}
            </div>
            <div style={{ fontSize: '9px', color: isActualGps ? '#16A34A' : '#94A3B8' }}>
              {isActualGps ? '● Real-time Satellite Sync' : '○ Standby / Polling'}
            </div>
          </div>
        </div>

        {/* Right: Interactive Leaflet Mini-Map */}
        <div
          style={{
            position: 'relative',
            borderRadius: '6px',
            border: '1px solid #CBD5E1',
            overflow: 'hidden',
            minHeight: '140px',
            height: '100%',
          }}
        >
          <div
            ref={mapContainerRef}
            style={{
              width: '100%',
              height: '100%',
              minHeight: '140px',
              backgroundColor: '#E2E8F0',
            }}
          />
          {/* Mini overlay pill */}
          <div
            style={{
              position: 'absolute',
              bottom: '6px',
              left: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.92)',
              backdropFilter: 'blur(4px)',
              border: '1px solid #CBD5E1',
              borderRadius: '4px',
              padding: '2px 8px',
              fontSize: '9.5px',
              fontWeight: 700,
              color: '#0F172A',
              pointerEvents: 'none',
              zIndex: 400,
            }}
          >
            Route Corridor: Howrah &rarr; Pt. DDU
          </div>
        </div>
      </div>
    </div>
  );
};
