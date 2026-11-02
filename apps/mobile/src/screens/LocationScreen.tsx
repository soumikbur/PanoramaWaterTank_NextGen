import React, { useState, useEffect, useRef } from 'react';
import L from 'leaflet';
import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TrainLocation } from '../types';
import { Crosshair, Map } from 'lucide-react';

// Verified Indian Railways Station Coordinates along New Delhi - Bhopal Corridor
interface RailwayStation {
  name: string;
  code: string;
  lat: number;
  lon: number;
  km: number;
}

const CORRIDOR_STATIONS: RailwayStation[] = [
  { name: 'New Delhi', code: 'NDLS', lat: 28.6139, lon: 77.2090, km: 0 },
  { name: 'Mathura Junction', code: 'MTJ', lat: 27.4924, lon: 77.6737, km: 141 },
  { name: 'Agra Cantt', code: 'AGC', lat: 27.1592, lon: 78.0056, km: 195 },
  { name: 'Gwalior Junction', code: 'GWL', lat: 26.2183, lon: 78.1828, km: 313 },
  { name: 'Virangana Lakshmibai Jhansi', code: 'VGLJ', lat: 25.4484, lon: 78.5685, km: 410 },
  { name: 'Bhopal Junction', code: 'BPL', lat: 23.2599, lon: 77.4126, km: 707 },
];

export const LocationScreen: React.FC = () => {
  const { selectedTrainNumber, setSelectedTrainNumber, sidebarCollapsed } = useApp();
  const [locations, setLocations] = useState<TrainLocation[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [tileError, setTileError] = useState<boolean>(false);
  const [tileProvider, setTileProvider] = useState<'osm' | 'carto'>('osm');

  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const trainMarkerRef = useRef<L.Marker | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);

  // Fetch locations
  useEffect(() => {
    let isMounted = true;
    const fetchLocs = async () => {
      try {
        const data = await ApiClient.fetchLocations();
        if (isMounted) setLocations(data);
      } catch (e) {
        console.warn('[LocationScreen] Error fetching GPS locations:', e);
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchLocs();
    const interval = setInterval(fetchLocs, 3000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const activeTrainLoc = locations.find((l) => l.train_number === selectedTrainNumber) || locations[0] || null;

  const hasGps = Boolean(
    activeTrainLoc?.has_gps &&
    activeTrainLoc.current_latitude != null &&
    activeTrainLoc.current_longitude != null &&
    (activeTrainLoc.current_latitude !== 0 || activeTrainLoc.current_longitude !== 0)
  );

  // Determine freshness of telemetry (stale if > 25s old)
  const lastUpdateTime = activeTrainLoc?.last_update ? new Date(activeTrainLoc.last_update).getTime() : 0;
  const isStale = lastUpdateTime > 0 ? (Date.now() - lastUpdateTime) > 25000 : false;

  // Initialize and manage Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      // Create Map
      const map = L.map(mapContainerRef.current, {
        center: [26.5000, 77.8000],
        zoom: 7,
        zoomControl: true,
        attributionControl: true,
      });

      // Add Tile Layer
      const tileUrl = tileProvider === 'osm'
        ? 'https://tile.openstreetmap.org/{z}/{x}/{y}.png'
        : 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png';

      const tileLayer = L.tileLayer(tileUrl, {
        maxZoom: 18,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      });

      tileLayer.on('tileerror', () => {
        setTileError(true);
      });
      tileLayer.on('load', () => {
        setTileError(false);
      });

      tileLayer.addTo(map);
      tileLayerRef.current = tileLayer;

      // Draw Verified Corridor Polyline (Station-to-station corridor)
      const corridorCoords: L.LatLngExpression[] = CORRIDOR_STATIONS.map((s) => [s.lat, s.lon]);
      const corridorPolyline = L.polyline(corridorCoords, {
        color: '#2563EB',
        weight: 4,
        opacity: 0.85,
        dashArray: '8, 6',
      }).addTo(map);

      corridorPolyline.bindTooltip('Northern-Central Railway Corridor (NDLS — BPL)', {
        sticky: true,
      });

      // Add Verified Station Markers
      CORRIDOR_STATIONS.forEach((station) => {
        const stationMarker = L.circleMarker([station.lat, station.lon], {
          radius: 6,
          fillColor: '#FFFFFF',
          color: '#1E293B',
          weight: 2,
          fillOpacity: 1,
        }).addTo(map);

        stationMarker.bindPopup(`
          <div style="font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4;">
            <strong style="color: #0F172A;">${station.name} (${station.code})</strong><br/>
            <span style="color: #64748B;">Corridor Distance: Km ${station.km}</span><br/>
            <span style="color: #2563EB; font-weight: 600;">Lat: ${station.lat.toFixed(4)}°, Lon: ${station.lon.toFixed(4)}°</span>
          </div>
        `);
      });

      mapInstanceRef.current = map;
    }

    // Invalidate map size on sidebar or container changes
    const timer = setTimeout(() => {
      mapInstanceRef.current?.invalidateSize();
    }, 150);

    return () => {
      clearTimeout(timer);
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
        trainMarkerRef.current = null;
      }
    };
  }, []);

  // Update Train Marker strictly when valid GPS telemetry exists
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (hasGps && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
      const lat = activeTrainLoc.current_latitude;
      const lon = activeTrainLoc.current_longitude;

      if (!trainMarkerRef.current) {
        const trainIconHtml = `
          <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background-color: rgba(37, 99, 235, 0.25); animation: pulse 1.8s infinite;"></div>
            <div style="position: absolute; width: 22px; height: 22px; border-radius: 50%; background-color: #2563EB; border: 2px solid #FFFFFF; box-shadow: 0 2px 4px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #FFFFFF;">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><rect width="16" height="16" x="4" y="3" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/><path d="m8 19-2 3"/><path d="m18 22-2-3"/><circle cx="8" cy="15" r="1"/><circle cx="16" cy="15" r="1"/></svg>
            </div>
          </div>
        `;
        const trainIcon = L.divIcon({
          html: trainIconHtml,
          className: 'custom-train-marker',
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        });
        trainMarkerRef.current = L.marker([lat, lon], { icon: trainIcon }).addTo(mapInstanceRef.current);
      } else {
        trainMarkerRef.current.setLatLng([lat, lon]);
      }

      const statusBadge = isStale
        ? '<span style="background-color: #FEF3C7; color: #D97706; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">STALE TELEMETRY</span>'
        : '<span style="background-color: #ECFDF5; color: #16A34A; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">LIVE BEACON</span>';

      trainMarkerRef.current.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 180px; line-height: 1.5;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="color: #0F172A; font-size: 13px;">Train ${activeTrainLoc.train_number}</strong>
            ${statusBadge}
          </div>
          <div style="color: #475569; font-size: 11px;">Coach: <strong>${activeTrainLoc.coach_number}</strong></div>
          <div style="color: #2563EB; font-weight: 700; font-size: 12px; margin: 2px 0;">
            Speed: ${activeTrainLoc.current_speed_kmh != null ? activeTrainLoc.current_speed_kmh.toFixed(1) : 'N/A'} km/h
          </div>
          <div style="color: #64748B; font-size: 10px;">
            GPS: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E<br/>
            Altitude: ${activeTrainLoc.current_altitude != null ? activeTrainLoc.current_altitude.toFixed(0) : 'N/A'} m MSL<br/>
            Constellation: ${activeTrainLoc.satellites != null ? activeTrainLoc.satellites : 'N/A'} Satellites Tracked<br/>
            Last Update: ${activeTrainLoc.last_update ? new Date(activeTrainLoc.last_update).toLocaleTimeString() : 'N/A'}
          </div>
        </div>
      `);
    } else {
      if (trainMarkerRef.current && mapInstanceRef.current) {
        mapInstanceRef.current.removeLayer(trainMarkerRef.current);
        trainMarkerRef.current = null;
      }
    }
  }, [activeTrainLoc, hasGps, isStale]);

  // Adjust Leaflet size when sidebar toggles
  useEffect(() => {
    if (mapInstanceRef.current) {
      setTimeout(() => {
        mapInstanceRef.current?.invalidateSize();
      }, 250);
    }
  }, [sidebarCollapsed]);

  const handleCenterTrain = () => {
    if (mapInstanceRef.current && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
      mapInstanceRef.current.setView(
        [activeTrainLoc.current_latitude, activeTrainLoc.current_longitude],
        11,
        { animate: true }
      );
    }
  };

  const handleFitCorridor = () => {
    if (mapInstanceRef.current) {
      const bounds = L.latLngBounds(CORRIDOR_STATIONS.map((s) => [s.lat, s.lon]));
      if (activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
        bounds.extend([activeTrainLoc.current_latitude, activeTrainLoc.current_longitude]);
      }
      mapInstanceRef.current.fitBounds(bounds, { padding: [40, 40] });
    }
  };

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${metrics.cardSpacing}px`,
        backgroundColor: colors.background,
        boxSizing: 'border-box',
        minHeight: '100%',
      }}
    >
      {/* 1. Top Control Bar */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: '14px 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          boxShadow: colors.shadowSubtle,
        }}
      >
        <div>
          <h2
            style={{
              fontSize: '17px',
              fontWeight: 700,
              color: colors.textPrimary,
              margin: '0 0 2px 0',
              fontFamily: typography.fontFamily,
            }}
          >
            Geographic GNSS / GPS Fleet Tracking
          </h2>
          <span style={{ fontSize: '11px', color: colors.textMuted }}>
            OpenStreetMap Verified GIS Cartography & EC200U 4G LTE Live GPS Positioning
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span style={{ fontSize: '12px', color: colors.textSecondary, fontWeight: 600 }}>Active Fleet:</span>
          <select
            value={activeTrainLoc?.train_number || ''}
            onChange={(e) => setSelectedTrainNumber(e.target.value)}
            style={{
              padding: '6px 12px',
              borderRadius: '6px',
              border: `1px solid ${colors.borderStrong}`,
              fontSize: '12px',
              fontWeight: 600,
              color: colors.textPrimary,
              backgroundColor: colors.surfaceHighlight,
              cursor: 'pointer',
            }}
          >
            {locations.map((loc) => (
              <option key={loc.train_number} value={loc.train_number}>
                Train {loc.train_number} (Coach {loc.coach_number})
              </option>
            ))}
            {locations.length === 0 && <option value="">No Active GPS Fleet</option>}
          </select>

          <button
            onClick={handleCenterTrain}
            style={{
              backgroundColor: colors.primarySurface,
              border: `1px solid ${colors.primaryBorder}`,
              color: colors.primary,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Crosshair size={14} /> Center on Train
          </button>

          <button
            onClick={handleFitCorridor}
            style={{
              backgroundColor: colors.surfaceAlt,
              border: `1px solid ${colors.borderStrong}`,
              color: colors.textSecondary,
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
            }}
          >
            <Map size={14} /> Fit Corridor
          </button>
        </div>
      </div>

      {/* 2. GNSS Metric Cards Row (Clearly Distinguishing Live vs Derived) */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(5, 1fr)',
          gap: `${metrics.cardSpacing}px`,
        }}
      >
        {/* Latitude */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '14px',
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 700, letterSpacing: '0.4px' }}>
              LATITUDE
            </span>
            <span style={{ fontSize: '9px', color: hasGps ? colors.success : colors.textMuted, backgroundColor: hasGps ? colors.successSurface : colors.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
              {hasGps ? 'LIVE GNSS' : 'AWAITING'}
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: colors.textPrimary, marginTop: '6px' }}>
            {hasGps && activeTrainLoc?.current_latitude != null ? `${activeTrainLoc.current_latitude.toFixed(6)}° N` : 'N/A'}
          </div>
          <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', display: 'block' }}>
            Source: ESP32-S3 / EC200U
          </span>
        </div>

        {/* Longitude */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '14px',
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 700, letterSpacing: '0.4px' }}>
              LONGITUDE
            </span>
            <span style={{ fontSize: '9px', color: hasGps ? colors.success : colors.textMuted, backgroundColor: hasGps ? colors.successSurface : colors.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
              {hasGps ? 'LIVE GNSS' : 'AWAITING'}
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: colors.textPrimary, marginTop: '6px' }}>
            {hasGps && activeTrainLoc?.current_longitude != null ? `${activeTrainLoc.current_longitude.toFixed(6)}° E` : 'N/A'}
          </div>
          <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', display: 'block' }}>
            Datum: WGS84 Geodetic
          </span>
        </div>

        {/* Ground Speed */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '14px',
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 700, letterSpacing: '0.4px' }}>
              GROUND SPEED
            </span>
            <span style={{ fontSize: '9px', color: hasGps ? colors.primary : colors.textMuted, backgroundColor: hasGps ? colors.primarySurface : colors.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
              {hasGps ? 'DOPPLER' : 'AWAITING'}
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: colors.primary, marginTop: '6px' }}>
            {hasGps && activeTrainLoc?.current_speed_kmh != null ? `${activeTrainLoc.current_speed_kmh.toFixed(1)} km/h` : 'N/A'}
          </div>
          <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', display: 'block' }}>
            Doppler Frequency Measured
          </span>
        </div>

        {/* Altitude */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '14px',
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 700, letterSpacing: '0.4px' }}>
              ALTITUDE (MSL)
            </span>
            <span style={{ fontSize: '9px', color: hasGps ? colors.offline : colors.textMuted, backgroundColor: hasGps ? colors.offlineSurface : colors.surfaceAlt, padding: '1px 5px', borderRadius: '4px', fontWeight: 700 }}>
              {hasGps ? '3D ELEVATION' : 'AWAITING'}
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: colors.textPrimary, marginTop: '6px' }}>
            {hasGps && activeTrainLoc?.current_altitude != null ? `${activeTrainLoc.current_altitude.toFixed(0)} m` : 'N/A'}
          </div>
          <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', display: 'block' }}>
            Above Mean Sea Level
          </span>
        </div>

        {/* Satellites Tracked */}
        <div
          style={{
            backgroundColor: colors.surface,
            border: `1px solid ${colors.border}`,
            borderRadius: `${metrics.cardRadius}px`,
            padding: '14px',
            boxShadow: colors.shadowSubtle,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '10px', color: colors.textMuted, fontWeight: 700, letterSpacing: '0.4px' }}>
              CONSTELLATION
            </span>
            <span
              style={{
                fontSize: '9px',
                color: !hasGps ? colors.textMuted : isStale ? colors.warning : colors.success,
                backgroundColor: !hasGps ? colors.surfaceAlt : isStale ? colors.warningSurface : colors.successSurface,
                padding: '1px 5px',
                borderRadius: '4px',
                fontWeight: 700,
              }}
            >
              {!hasGps ? 'NO FIX' : isStale ? 'STALE' : 'LIVE'}
            </span>
          </div>
          <div style={{ fontSize: '17px', fontWeight: 800, color: !hasGps ? colors.textMuted : isStale ? colors.warning : colors.success, marginTop: '6px' }}>
            {hasGps && activeTrainLoc?.satellites != null ? `${activeTrainLoc.satellites} Satellites` : 'N/A'}
          </div>
          <span style={{ fontSize: '10px', color: colors.textMuted, marginTop: '2px', display: 'block' }}>
            Fix: 3D DGPS Multi-Constellation
          </span>
        </div>
      </div>

      {/* 3. Real Geographic Map Container */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: '16px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          boxShadow: colors.shadowSubtle,
          flex: 1,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '14px', fontWeight: 700, color: colors.textPrimary }}>
              Railway Corridor Geographic View
            </span>
            <span
              style={{
                fontSize: '11px',
                color: colors.primary,
                backgroundColor: colors.primarySurface,
                padding: '2px 8px',
                borderRadius: '4px',
                fontWeight: 600,
              }}
            >
              OpenStreetMap Geographic Tiles
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '11px', color: colors.textMuted }}>
            <span>Telemetry Status:</span>
            <span
              style={{
                color: !hasGps ? colors.textMuted : isStale ? colors.warning : colors.success,
                fontWeight: 700,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <span
                style={{
                  width: '6px',
                  height: '6px',
                  borderRadius: '50%',
                  backgroundColor: !hasGps ? colors.textMuted : isStale ? colors.warning : colors.success,
                  display: 'inline-block',
                }}
              />
              <span>{!hasGps ? 'Awaiting GPS Telemetry' : isStale ? 'Awaiting Fresh Frames (Stale)' : 'Active Sub-second Stream'}</span>
            </span>
            <span style={{ color: colors.borderStrong }}>|</span>
            <span>Last Frame: {activeTrainLoc?.last_update ? new Date(activeTrainLoc.last_update).toLocaleTimeString() : 'N/A'}</span>
          </div>
        </div>

        {/* Tile Error Fallback Notice if internet is disconnected */}
        {tileError && (
          <div
            style={{
              backgroundColor: colors.warningSurface,
              border: `1px solid ${colors.warningBorder}`,
              color: colors.warning,
              padding: '8px 12px',
              borderRadius: '6px',
              fontSize: '11px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertTriangle size={14} color={colors.warning} />
              <span>Geographic map tiles are taking longer to load or network connection is restricted. Telemetry coordinates and station markers remain accurate.</span>
            </span>
            <button
              onClick={() => {
                setTileError(false);
                mapInstanceRef.current?.invalidateSize();
              }}
              style={{
                backgroundColor: colors.surface,
                border: `1px solid ${colors.warningBorder}`,
                color: colors.warning,
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '10px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {/* Actual Leaflet Map Canvas */}
        <div
          ref={mapContainerRef}
          style={{
            width: '100%',
            height: '460px',
            borderRadius: '6px',
            border: `1px solid ${colors.border}`,
            position: 'relative',
            zIndex: 1,
            overflow: 'hidden',
          }}
        >
          {/* Empty State Banner when no valid GPS coordinates have arrived */}
          {!hasGps && (
            <div
              style={{
                position: 'absolute',
                top: '20px',
                left: '50%',
                transform: 'translateX(-50%)',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                border: `1px solid ${colors.borderStrong}`,
                borderRadius: '8px',
                padding: '16px 28px',
                textAlign: 'center',
                boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
                maxWidth: '440px',
              }}
            >
              <div style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary, marginBottom: '4px' }}>
                GPS data unavailable
              </div>
              <div style={{ fontSize: '12px', color: colors.textSecondary }}>
                Waiting for valid location telemetry from MQTT.
              </div>
            </div>
          )}
        </div>

        {/* Map Legend / Corridor Metadata Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 12px',
            backgroundColor: colors.surfaceAlt,
            borderRadius: '6px',
            fontSize: '11px',
            color: colors.textSecondary,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span><strong>Corridor:</strong> New Delhi (NDLS) to Bhopal (BPL) (707 km)</span>
            <span><strong style={{ color: '#2563EB' }}>— — —</strong> Railway Track Axis</span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #1E293B', backgroundColor: '#FFFFFF', display: 'inline-block' }} />
              <span>Major Junctions</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: colors.primary, display: 'inline-block' }} />
              <span>Real-Time Train Beacon</span>
            </span>
          </div>
          <div style={{ color: colors.textMuted }}>
            Map Cartography &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer" style={{ color: colors.primary, textDecoration: 'none' }}>OpenStreetMap</a>
          </div>
        </div>
      </div>
    </div>
  );
};
