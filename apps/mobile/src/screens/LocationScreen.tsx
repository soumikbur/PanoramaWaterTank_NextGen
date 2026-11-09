import React, { useState, useEffect, useRef, useMemo } from 'react';
import L from 'leaflet';

// Guard against Leaflet Issue #3997: teardown transition race condition when component unmounts
if (typeof L !== 'undefined' && L.DomUtil && (L.DomUtil as any)._safePositionPatched !== true) {
  const origGetPosition = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: HTMLElement) {
    if (!el) return new L.Point(0, 0);
    return origGetPosition.call(L.DomUtil, el);
  };
  (L.DomUtil as any)._safePositionPatched = true;
}

import { colors, typography, metrics } from '../theme';
import { useApp } from '../state/AppContext';
import { ApiClient } from '../api/client';
import { TrainLocation, CorridorStation, DEFAULT_CORRIDOR_STATIONS } from '../types';
import {
  Maximize2,
  Minimize2,
  Expand,
  Shrink,
  Layers,
  Crosshair,
  Navigation,
  ExternalLink,
  Plus,
  Minus,
  Droplets,
  MapPin,
  ChevronUp,
  ChevronDown,
  X,
  Info,
  Globe,
} from 'lucide-react';

// Great-circle Haversine formula with calibrated railway track winding factor (1.12x)
function calculateTrackDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371.0; // Earth radius in km
  const dLat = (lat2 - lat1) * (Math.PI / 180.0);
  const dLon = (lon2 - lon1) * (Math.PI / 180.0);
  const a =
    Math.sin(dLat / 2.0) * Math.sin(dLat / 2.0) +
    Math.cos(lat1 * (Math.PI / 180.0)) *
      Math.cos(lat2 * (Math.PI / 180.0)) *
      Math.sin(dLon / 2.0) *
      Math.sin(dLon / 2.0);
  const c = 2.0 * Math.atan2(Math.sqrt(a), Math.sqrt(1.0 - a));
  return R * c * 1.12;
}

// Calculate ETA based on distance and Doppler ground speed
function calculateEta(distanceKm: number, speedKmh: number | null | undefined): string {
  if (!speedKmh || speedKmh < 5) return '—';
  const minutes = Math.round((distanceKm / speedKmh) * 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

const WORLD_MAP_BOUNDS: L.LatLngBoundsExpression = [
  [-85.05112878, -180],
  [85.05112878, 180],
];

function calculateRouteCorridorBounds(
  stationList: CorridorStation[],
  trainLoc: TrainLocation | null,
  hasTrainGps: boolean
): L.LatLngBounds {
  const points: [number, number][] = [];
  if (Array.isArray(stationList)) {
    stationList.forEach((st) => {
      if (st && typeof st.latitude === 'number' && typeof st.longitude === 'number') {
        points.push([st.latitude, st.longitude]);
      }
    });
  }

  if (points.length === 0) {
    points.push([22.5839, 88.3426], [23.6871, 86.9746]);
  }

  if (hasTrainGps && trainLoc && typeof trainLoc.current_latitude === 'number' && typeof trainLoc.current_longitude === 'number') {
    points.push([trainLoc.current_latitude, trainLoc.current_longitude]);
  }

  return L.latLngBounds(points);
}

export const LocationScreen: React.FC = () => {
  const { selectedTrainNumber, setSelectedTrainNumber, sidebarCollapsed, selectedStationCode: contextStationCode, setSelectedStationCode: setContextStationCode, liveTelemetry } = useApp();
  const googleMapsApiKey = (typeof process !== 'undefined' && (process.env?.GOOGLE_MAPS_API_KEY || process.env?.VITE_GOOGLE_MAPS_API_KEY)) || (typeof import.meta !== 'undefined' && import.meta.env?.VITE_GOOGLE_MAPS_API_KEY) || '';
  const [locations, setLocations] = useState<TrainLocation[]>([]);
  const [stations, setStations] = useState<CorridorStation[]>(DEFAULT_CORRIDOR_STATIONS);
  const [selectedStationCode, setSelectedStationCode] = useState<string>('');
  const [selectedEntity, setSelectedEntity] = useState<CorridorStation | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState<boolean>(false);
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [isCorridorExpanded, setIsCorridorExpanded] = useState<boolean>(false);
  const [tileMode, setTileMode] = useState<'street' | 'satellite'>('street');
  const [tileError, setTileError] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const trainMarkerRef = useRef<L.Marker | null>(null);
  const userMarkerRef = useRef<L.Marker | null>(null);
  const stationMarkersRef = useRef<Record<string, L.Marker | L.CircleMarker>>({});
  const polylineRef = useRef<L.Polyline | null>(null);

  // Auto-dismiss toast after 3.5 seconds
  useEffect(() => {
    if (!feedbackToast) return;
    const t = setTimeout(() => setFeedbackToast(null), 3500);
    return () => clearTimeout(t);
  }, [feedbackToast]);

  // Handle external selection from Global Search
  useEffect(() => {
    if (contextStationCode && stations.length > 0) {
      const target = stations.find((s) => s.code.toLowerCase() === contextStationCode.toLowerCase());
      if (target) {
        setSelectedStationCode(target.code);
        setSelectedEntity(target);
        if (mapInstanceRef.current) {
          mapInstanceRef.current.flyTo([target.latitude, target.longitude], 12, { duration: 1.2 });
        }
      }
    }
  }, [contextStationCode, stations]);

  // Fetch corridor stations and train locations
  useEffect(() => {
    let isMounted = true;
    const fetchData = async () => {
      try {
        const [corridorData, locsData] = await Promise.all([
          ApiClient.fetchCorridorStations().catch(() => DEFAULT_CORRIDOR_STATIONS),
          ApiClient.fetchLocations().catch(() => []),
        ]);
        if (isMounted) {
          if (Array.isArray(corridorData) && corridorData.length > 0) {
            setStations(corridorData);
          }
          if (Array.isArray(locsData)) {
            setLocations(locsData);
          }
        }
      } catch (err) {
        console.warn('[LocationScreen] Error loading data:', err);
      }
    };

    fetchData();
    const interval = setInterval(fetchData, 4000);
    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, []);

  const safeLocations = Array.isArray(locations) ? locations : [];
  const activeTrainLoc: TrainLocation | null = useMemo(() => {
    if (liveTelemetry && liveTelemetry.lat != null && liveTelemetry.long != null) {
      return {
        train_number: liveTelemetry.trno,
        current_latitude: liveTelemetry.lat,
        current_longitude: liveTelemetry.long,
        current_speed_kmh: liveTelemetry.speed ?? 0,
        has_gps: true,
        last_update: new Date(liveTelemetry.receivedAt).toISOString(),
      };
    }
    return safeLocations.find((l) => l.train_number === selectedTrainNumber) || safeLocations[0] || null;
  }, [liveTelemetry, safeLocations, selectedTrainNumber]);

  const hasGps = Boolean(
    activeTrainLoc?.has_gps &&
      activeTrainLoc.current_latitude != null &&
      activeTrainLoc.current_longitude != null &&
      (Math.abs(activeTrainLoc.current_latitude) > 0.001 || Math.abs(activeTrainLoc.current_longitude) > 0.001)
  );

  // Freshness check: consider telemetry stale if > 25 seconds elapsed
  const lastUpdateTime = activeTrainLoc?.last_update ? new Date(activeTrainLoc.last_update).getTime() : 0;
  const isStale = lastUpdateTime > 0 ? Date.now() - lastUpdateTime > 25000 : false;

  // Compute distances, ETAs, and next refill facility
  const enrichedStations = useMemo(() => {
    return stations.map((st) => {
      let distanceKm = 0;
      let etaString = '—';

      if (hasGps && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
        distanceKm = calculateTrackDistanceKm(
          activeTrainLoc.current_latitude,
          activeTrainLoc.current_longitude,
          st.latitude,
          st.longitude
        );
        etaString = calculateEta(distanceKm, activeTrainLoc.current_speed_kmh);
      }

      return {
        ...st,
        distanceKm,
        etaString,
      };
    });
  }, [stations, hasGps, activeTrainLoc]);

  // Next upcoming water refill facility
  const nextRefillFacility = useMemo(() => {
    const refillStations = enrichedStations.filter((s) => s.water_refill_available);
    if (!refillStations.length) return null;

    if (hasGps) {
      const sorted = [...refillStations].sort((a, b) => a.distanceKm - b.distanceKm);
      return sorted[0];
    }
    // Default to the first major intermediate refill station (Bardhaman)
    return refillStations.find((s) => s.code === 'BWN') || refillStations[0];
  }, [enrichedStations, hasGps]);

  // Initialize Leaflet Map with Single World Bounds & Full Zoom Range
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const worldBounds = L.latLngBounds(WORLD_MAP_BOUNDS);
      const map = L.map(mapContainerRef.current, {
        center: [23.2324, 87.8615], // Bardhaman/corridor center
        zoom: 8,
        minZoom: 2,
        maxZoom: 19,
        maxBounds: worldBounds,
        maxBoundsViscosity: 1.0,
        worldCopyJump: false,
        zoomControl: false,
        attributionControl: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
      });

      const initialRouteBounds = calculateRouteCorridorBounds(stations, activeTrainLoc, hasGps);
      map.fitBounds(initialRouteBounds, {
        padding: [60, 60],
        maxZoom: 8,
        animate: false,
      });
      mapInstanceRef.current = map;
    }

    // Attach ResizeObserver to mapContainer to handle dynamic layouts & display scaling
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      });
      ro.observe(mapContainerRef.current);
    }

    // Window resize listener
    const handleWindowResize = () => {
      if (mapInstanceRef.current) {
        mapInstanceRef.current.invalidateSize({ animate: false });
      }
    };
    window.addEventListener('resize', handleWindowResize);

    return () => {
      window.removeEventListener('resize', handleWindowResize);
      if (ro) ro.disconnect();
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.stop();
          mapInstanceRef.current.closePopup();
          mapInstanceRef.current.eachLayer((layer) => {
            try {
              mapInstanceRef.current?.removeLayer(layer);
            } catch (e) {}
          });
          mapInstanceRef.current.remove();
        } catch (e) {
          // Swallow any in-flight Leaflet teardown animation race conditions
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        trainMarkerRef.current = null;
        userMarkerRef.current = null;
        stationMarkersRef.current = {};
        polylineRef.current = null;
      }
    };
  }, []);

  // Ensure initial corridor bounds are fitted once station telemetry is ready
  const hasInitialFitDoneRef = useRef<boolean>(false);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || hasInitialFitDoneRef.current || stations.length === 0) return;

    const corridorBounds = calculateRouteCorridorBounds(stations, activeTrainLoc, hasGps);
    map.fitBounds(corridorBounds, {
      padding: [60, 60],
      maxZoom: 8,
      animate: false,
    });
    hasInitialFitDoneRef.current = true;
  }, [stations, activeTrainLoc, hasGps]);

  // Center on active train when train selection changes
  const prevTrainNumberRef = useRef(selectedTrainNumber);
  useEffect(() => {
    if (prevTrainNumberRef.current !== selectedTrainNumber) {
      prevTrainNumberRef.current = selectedTrainNumber;
      if (hasGps && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
        mapInstanceRef.current?.setView([activeTrainLoc.current_latitude, activeTrainLoc.current_longitude], 12, {
          animate: true,
        });
        setSelectedStationCode('TRAIN');
        setFeedbackToast(`Centered on Train ${selectedTrainNumber}`);
      }
    }
  }, [selectedTrainNumber, hasGps, activeTrainLoc]);

  // Manage Tile Layer (Street vs. Satellite) - Single World, No Wrap, Preserves Center & Zoom
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const currentCenter = map.getCenter();
    const currentZoom = map.getZoom();

    if (tileLayerRef.current) {
      map.removeLayer(tileLayerRef.current);
      tileLayerRef.current = null;
    }

    const isSatellite = tileMode === 'satellite';
    const tileUrl = isSatellite
      ? 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'
      : 'https://tile.openstreetmap.org/{z}/{x}/{y}.png';

    const attribution = isSatellite
      ? 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community'
      : '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

    const tileLayer = L.tileLayer(tileUrl, {
      minZoom: 2,
      maxZoom: 19,
      noWrap: true,
      bounds: [
        [-85.05112878, -180],
        [85.05112878, 180],
      ],
      attribution,
    });

    tileLayer.on('tileerror', () => setTileError(true));
    tileLayer.on('load', () => setTileError(false));

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    // Preserve the current geographical center and zoom across tile layer switches
    if (currentCenter && currentZoom != null) {
      map.setView(currentCenter, currentZoom, { animate: false });
    }
  }, [tileMode]);

  // Draw Corridor Track Polyline and Station Markers with Vector SVG Icons (No Unicode Emoji)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || stations.length === 0) return;

    // Remove existing polyline
    if (polylineRef.current) {
      map.removeLayer(polylineRef.current);
      polylineRef.current = null;
    }

    const corridorCoords: [number, number][] = stations
      .filter((s) => s && typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => [s.latitude, s.longitude]);

    const isSatellite = tileMode === 'satellite';
    const polyline = L.polyline(corridorCoords, {
      color: isSatellite ? '#38BDF8' : '#1D4ED8',
      weight: 4,
      opacity: 0.92,
      dashArray: '8, 6',
    }).addTo(map);

    polyline.bindTooltip('Eastern Railway Mainline Corridor Axis (Howrah — Asansol • 218 km)', {
      sticky: true,
      className: 'rail-corridor-tooltip',
    });
    polylineRef.current = polyline;

    // Clear existing station markers
    Object.values(stationMarkersRef.current).forEach((m) => map.removeLayer(m));
    stationMarkersRef.current = {};

    // Render Station Markers using Pure Vector SVGs
    stations.forEach((st) => {
      const isDestination = st.is_destination || st.code === 'ASN';
      const isRefill = st.water_refill_available && !isDestination;
      const isSelected = selectedStationCode === st.code;

      let iconHtml = '';
      if (isDestination) {
        // Destination Marker: Purple Flag/Terminal Badge
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 34px; height: 34px;">
            <div style="background-color: #7C3AED; color: #FFFFFF; border: 2px solid #FFFFFF; border-radius: 6px; padding: 3px 6px; font-weight: 800; font-size: 10px; font-family: Inter, sans-serif; box-shadow: 0 3px 8px rgba(0,0,0,0.35); text-align: center;">
              ${st.code}
            </div>
            <div style="width: 2px; height: 6px; background-color: #7C3AED;"></div>
          </div>
        `;
      } else if (isRefill) {
        // Water Refill Hub: Vector Water Droplet Pin
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 32px; height: 36px;">
            <div style="background-color: #0284C7; color: #FFFFFF; border: 2px solid #FFFFFF; border-radius: 50%; width: 26px; height: 26px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.3);">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              </svg>
            </div>
            <div style="background: rgba(15,23,42,0.9); color: #FFF; font-size: 8px; font-weight: 800; padding: 1px 4px; border-radius: 3px; font-family: Inter, sans-serif; margin-top: 2px; border: 1px solid rgba(255,255,255,0.3);">
              ${st.code}
            </div>
          </div>
        `;
      } else {
        // Standard Passenger Station: Clean slate circular node
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 26px; height: 30px;">
            <div style="background-color: #FFFFFF; border: 2.5px solid #475569; border-radius: 50%; width: 14px; height: 14px; box-shadow: 0 1px 5px rgba(0,0,0,0.25);"></div>
            <div style="background: rgba(248,250,252,0.95); color: #334155; font-size: 8px; font-weight: 700; padding: 0 3px; border-radius: 2px; font-family: Inter, sans-serif; border: 1px solid #CBD5E1; margin-top: 2px;">
              ${st.code}
            </div>
          </div>
        `;
      }

      const icon = L.divIcon({
        html: iconHtml,
        className: `station-marker ${isSelected ? 'marker-selected' : ''}`,
        iconSize: [34, 36],
        iconAnchor: [17, 18],
      });

      const marker = L.marker([st.latitude, st.longitude], { icon }).addTo(map);

      const statusBadge = st.water_refill_available
        ? '<span style="background-color: #ECFDF5; color: #16A34A; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">VERIFIED REFILL</span>'
        : '<span style="background-color: #F1F5F9; color: #64748B; padding: 1px 6px; border-radius: 4px; font-weight: 600; font-size: 10px;">NO FACILITY</span>';

      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 200px; line-height: 1.5; color: #0F172A;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 13px;">${st.name} (${st.code})</strong>
          </div>
          <div style="margin-bottom: 6px;">${statusBadge}</div>
          <div style="color: #475569; font-size: 11px;">
            Coordinates: <strong>${st.latitude.toFixed(4)}° N, ${st.longitude.toFixed(4)}° E</strong><br/>
            Refill Capacity: <strong>${st.water_capacity_liters > 0 ? st.water_capacity_liters.toLocaleString() + ' L' : '—'}</strong><br/>
            Facility Status: <strong>${st.operational_status}</strong><br/>
            Last Verified: <strong>${st.last_verified}</strong>
          </div>
        </div>
      `);

      marker.on('click', () => {
        setSelectedStationCode(st.code);
        setSelectedEntity(st);
        map.setView([st.latitude, st.longitude], 12, { animate: true });
        setFeedbackToast(`Selected: ${st.name} (${st.code})`);
      });

      stationMarkersRef.current[st.code] = marker;
    });
  }, [stations, tileMode, selectedStationCode]);

  // Manage Live Train Marker using Vector SVG (No Emoji)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (hasGps && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
      const lat = activeTrainLoc.current_latitude;
      const lon = activeTrainLoc.current_longitude;

      if (!trainMarkerRef.current) {
        const trainIconHtml = `
          <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
            <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background-color: rgba(37, 99, 235, 0.28); animation: pulse 1.8s infinite;"></div>
            <div style="position: absolute; width: 24px; height: 24px; border-radius: 50%; background-color: #2563EB; border: 2.5px solid #FFFFFF; box-shadow: 0 3px 8px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #FFFFFF;">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <rect width="16" height="16" x="4" y="3" rx="2"></rect>
                <path d="M4 11h16"></path>
                <path d="M12 3v8"></path>
                <path d="m8 19-2 3"></path>
                <path d="m18 22-2-3"></path>
                <circle cx="8" cy="15" r="1"></circle>
                <circle cx="16" cy="15" r="1"></circle>
              </svg>
            </div>
          </div>
        `;
        const trainIcon = L.divIcon({
          html: trainIconHtml,
          className: 'custom-train-marker',
          iconSize: [38, 38],
          iconAnchor: [19, 19],
        });
        trainMarkerRef.current = L.marker([lat, lon], { icon: trainIcon }).addTo(map);
      } else {
        trainMarkerRef.current.setLatLng([lat, lon]);
      }

      const statusBadge = activeTrainLoc.is_simulated
        ? '<span style="background-color: #E0F2FE; color: #0284C7; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">ROUTE SIMULATION</span>'
        : isStale
        ? '<span style="background-color: #FEF3C7; color: #D97706; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">GNSS DATA STALE</span>'
        : '<span style="background-color: #ECFDF5; color: #16A34A; padding: 1px 6px; border-radius: 4px; font-weight: 700; font-size: 10px;">LIVE BEACON</span>';

      trainMarkerRef.current.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 200px; line-height: 1.5; color: #0F172A;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <strong style="font-size: 13px;">Train ${activeTrainLoc.train_number}</strong>
            ${statusBadge}
          </div>
          <div style="color: #475569; font-size: 11px;">Coach: <strong>${activeTrainLoc.coach_number}</strong></div>
          <div style="color: #2563EB; font-weight: 700; font-size: 12px; margin: 3px 0;">
            Speed: ${activeTrainLoc.current_speed_kmh != null ? activeTrainLoc.current_speed_kmh.toFixed(1) : '—'} km/h
          </div>
          <div style="color: #64748B; font-size: 11px;">
            GPS: ${lat.toFixed(6)}° N, ${lon.toFixed(6)}° E<br/>
            Altitude: ${activeTrainLoc.current_altitude != null ? activeTrainLoc.current_altitude.toFixed(0) : '—'} m MSL<br/>
            Satellites: ${activeTrainLoc.satellites != null ? activeTrainLoc.satellites : '—'} Tracked<br/>
            Last Update: ${activeTrainLoc.last_update ? new Date(activeTrainLoc.last_update).toLocaleTimeString() : '—'}
          </div>
        </div>
      `);
    } else {
      if (trainMarkerRef.current && map) {
        map.removeLayer(trainMarkerRef.current);
        trainMarkerRef.current = null;
      }
    }
  }, [activeTrainLoc, hasGps, isStale]);

  const handleToggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      if (mapWrapperRef.current?.requestFullscreen) {
        mapWrapperRef.current.requestFullscreen().catch(() => {});
      }
      setFeedbackToast('Entered fullscreen view. Press Escape or click Exit Fullscreen to exit.');
    } else {
      exitFullscreen();
    }
  };

  const exitFullscreen = () => {
    setIsFullscreen(false);
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    setFeedbackToast('Exited fullscreen view.');
  };

  const handleToggleExpand = () => {
    setIsMapExpanded((prev) => {
      const next = !prev;
      setFeedbackToast(next ? 'Expanded map view: enlarged layout active.' : 'Restored standard map layout.');
      return next;
    });
  };

  // Fullscreen change listener
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isDocFs = !!document.fullscreenElement;
      if (!isDocFs && isFullscreen) {
        setIsFullscreen(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
    };
  }, [isFullscreen]);

  // Escape key listener for fullscreen
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        exitFullscreen();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isFullscreen]);

  // Resizes map upon container/sidebar expansion or fullscreen toggling
  useEffect(() => {
    const updateMapDimensions = () => {
      const map = mapInstanceRef.current;
      if (!map) return;

      const currentCenter = map.getCenter();
      const currentZoom = map.getZoom();

      map.invalidateSize({ animate: false });

      if (currentCenter) {
        map.setView(currentCenter, currentZoom, { animate: false });
      }
    };

    updateMapDimensions();
    const t1 = setTimeout(updateMapDimensions, 60);
    const t2 = setTimeout(updateMapDimensions, 180);
    const t3 = setTimeout(updateMapDimensions, 350);

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [sidebarCollapsed, isMapExpanded, isFullscreen]);

  // Actions
  const handleCenterTrain = () => {
    if (hasGps && activeTrainLoc?.current_latitude != null && activeTrainLoc?.current_longitude != null) {
      mapInstanceRef.current?.setView([activeTrainLoc.current_latitude, activeTrainLoc.current_longitude], 12, {
        animate: true,
      });
      setSelectedStationCode('TRAIN');
      setFeedbackToast(
        `Centered on Train ${activeTrainLoc.train_number}: ${activeTrainLoc.current_latitude.toFixed(4)}° N, ${activeTrainLoc.current_longitude.toFixed(4)}° E`
      );
    } else {
      setFeedbackToast('GPS fix unavailable: awaiting live device telemetry.');
    }
  };

  const handleCurrentLocation = () => {
    if (typeof navigator === 'undefined' || !navigator.geolocation) {
      setFeedbackToast('Geolocation is not supported by your browser.');
      return;
    }
    setFeedbackToast('Detecting current browser geolocation...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        const map = mapInstanceRef.current;
        if (map) {
          if (userMarkerRef.current) {
            userMarkerRef.current.setLatLng([latitude, longitude]);
          } else {
            const userIconHtml = `
              <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
                <div style="position: absolute; width: 34px; height: 34px; border-radius: 50%; background-color: rgba(14, 165, 233, 0.35); animation: pulse 1.6s infinite;"></div>
                <div style="position: absolute; width: 18px; height: 18px; border-radius: 50%; background-color: #0284C7; border: 2.5px solid #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center;">
                  <div style="width: 6px; height: 6px; border-radius: 50%; background-color: #FFFFFF;"></div>
                </div>
              </div>
            `;
            const userIcon = L.divIcon({
              html: userIconHtml,
              className: 'user-loc-marker',
              iconSize: [34, 34],
              iconAnchor: [17, 17],
            });
            userMarkerRef.current = L.marker([latitude, longitude], { icon: userIcon })
              .bindPopup(`
                <div style="font-family: Inter, sans-serif; font-size: 12px; line-height: 1.4;">
                  <strong style="color: #0284C7;">Your Current Location</strong><br/>
                  <span style="color: #475569; font-size: 11px;">
                    ${latitude.toFixed(5)}° N, ${longitude.toFixed(5)}° E
                  </span>
                </div>
              `)
              .addTo(map);
          }
          map.setView([latitude, longitude], 13, { animate: true });
          userMarkerRef.current.openPopup();
          setFeedbackToast(`Acquired Location: ${latitude.toFixed(4)}° N, ${longitude.toFixed(4)}° E`);
        }
      },
      (err) => {
        let msg = 'Could not acquire device geolocation.';
        if (err.code === 1) {
          msg = 'Geolocation access denied. Please allow browser location permissions to view position.';
        } else if (err.code === 2) {
          msg = 'Geolocation position unavailable.';
        } else if (err.code === 3) {
          msg = 'Geolocation request timed out.';
        }
        setFeedbackToast(msg);
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60000 }
    );
  };

  const handleOpenGoogleMaps = () => {
    const origin = '22.5839,88.3426'; // Howrah Junction
    const destination = '23.6871,86.9746'; // Asansol Junction
    const gmapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=transit`;
    window.open(gmapsUrl, '_blank', 'noopener,noreferrer');
    setFeedbackToast('Opened Eastern Railway corridor (Howrah — Asansol) in Google Maps Live viewer');
  };

  const handleFitCorridor = () => {
    if (!mapInstanceRef.current || stations.length === 0) return;
    const bounds = calculateRouteCorridorBounds(stations, activeTrainLoc, hasGps);
    mapInstanceRef.current.fitBounds(bounds, {
      padding: [60, 60],
      maxZoom: 8,
      animate: true,
    });
    setFeedbackToast('Map viewport fitted to Eastern Railway Corridor (Howrah to Asansol)');
  };

  const handleWorldView = () => {
    const map = mapInstanceRef.current;
    if (!map) return;
    map.fitBounds(
      [
        [-85, -180],
        [85, 180],
      ],
      {
        padding: [10, 10],
        animate: true,
      }
    );
    setSelectedStationCode('');
    setSelectedEntity(null);
    setFeedbackToast('Switched to Global World View');
  };

  const handleLocateStation = (st: CorridorStation) => {
    setSelectedStationCode(st.code);
    setSelectedEntity(st);
    mapInstanceRef.current?.setView([st.latitude, st.longitude], 12, { animate: true });
    stationMarkersRef.current[st.code]?.openPopup();
    setFeedbackToast(`Centered on ${st.name} (${st.code})`);
  };

  // Zoom helpers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: `${metrics.cardSpacing}px`,
        backgroundColor: colors.background,
        boxSizing: 'border-box',
        minHeight: '100%',
        position: 'relative',
      }}
    >
      {/* Toast Feedback */}
      {feedbackToast && (
        <div
          style={{
            position: 'fixed',
            top: '80px',
            right: '24px',
            zIndex: 9999,
            backgroundColor: 'rgba(15, 23, 42, 0.94)',
            color: '#FFFFFF',
            padding: '10px 18px',
            borderRadius: '8px',
            fontSize: '12px',
            fontWeight: 600,
            boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            border: '1px solid #334155',
            animation: 'fadeIn 0.2s ease-out',
          }}
        >
          <Info size={16} color="#38BDF8" />
          <span>{feedbackToast}</span>
        </div>
      )}

      {/* 1. Main Map Section (Dominant Geographic View) */}
      <div
        ref={mapWrapperRef}
        id="location-map-wrapper"
        style={{
          backgroundColor: colors.surface,
          border: isFullscreen ? 'none' : `1px solid ${colors.border}`,
          borderRadius: isFullscreen ? '0px' : `${metrics.cardRadius}px`,
          position: isFullscreen ? 'fixed' : 'relative',
          top: isFullscreen ? 0 : 'auto',
          left: isFullscreen ? 0 : 'auto',
          right: isFullscreen ? 0 : 'auto',
          bottom: isFullscreen ? 0 : 'auto',
          width: isFullscreen ? '100vw' : '100%',
          height: isFullscreen ? '100vh' : (isMapExpanded ? '780px' : 'clamp(340px, 50vh, 520px)'),
          minHeight: isFullscreen ? '100vh' : (isMapExpanded ? '780px' : 'clamp(320px, 45vh, 520px)'),
          flexShrink: 0,
          zIndex: isFullscreen ? 99999 : 1,
          overflow: 'hidden',
          boxShadow: isFullscreen ? 'none' : colors.shadowSubtle,
          display: 'flex',
          flexDirection: 'column',
          transition: isFullscreen ? 'none' : 'height 0.25s ease-in-out',
        }}
      >
        {/* Geographic Map Container */}
        <div
          ref={mapContainerRef}
          id="location-map-container"
          style={{
            width: '100%',
            height: '100%',
            flex: 1,
            minHeight: 0,
            position: 'relative',
            zIndex: 1,
            backgroundColor: tileMode === 'satellite' ? '#0B132B' : '#E2E8F0',
          }}
        >
          {/* Upper-Left Information Banner: Next Refill Facility */}
          {nextRefillFacility && (
            <div
              style={{
                position: 'absolute',
                top: '14px',
                left: '14px',
                zIndex: 1000,
                backgroundColor: 'rgba(255, 255, 255, 0.96)',
                backdropFilter: 'blur(6px)',
                border: `1px solid ${colors.border}`,
                borderRadius: '8px',
                padding: '10px 14px',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                maxWidth: '340px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Droplets size={14} color="#0284C7" />
                  <span style={{ fontSize: '10px', fontWeight: 800, color: '#0369A1', letterSpacing: '0.4px' }}>
                    NEXT REFILL FACILITY
                  </span>
                </div>
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 700,
                    backgroundColor: '#E0F2FE',
                    color: '#0284C7',
                    padding: '1px 5px',
                    borderRadius: '4px',
                  }}
                >
                  {nextRefillFacility.code}
                </span>
              </div>

              <div style={{ fontSize: '13px', fontWeight: 700, color: colors.textPrimary }}>
                {nextRefillFacility.name}
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '11px', color: colors.textSecondary }}>
                <span>
                  Distance:{' '}
                  <strong style={{ color: '#0284C7' }}>
                    {hasGps ? `${nextRefillFacility.distanceKm.toFixed(1)} km` : '—'}
                  </strong>
                </span>
                <span>&bull;</span>
                <span>
                  Capacity: <strong>{nextRefillFacility.water_capacity_liters > 0 ? nextRefillFacility.water_capacity_liters.toLocaleString() + ' L' : '—'}</strong>
                </span>
                <span>&bull;</span>
                <span style={{ color: '#16A34A', fontWeight: 600 }}>{nextRefillFacility.operational_status}</span>
              </div>
            </div>
          )}

          {/* Upper-Center GPS Status Indicator */}
          <div
            style={{
              position: 'absolute',
              top: '14px',
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 1000,
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(6px)',
              border: `1px solid ${colors.border}`,
              borderRadius: '20px',
              padding: '6px 14px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
            }}
          >
            <div
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: !hasGps
                  ? '#94A3B8'
                  : activeTrainLoc?.is_simulated
                  ? '#0284C7'
                  : isStale
                  ? '#D97706'
                  : '#16A34A',
                boxShadow: hasGps && !isStale ? (activeTrainLoc?.is_simulated ? '0 0 8px rgba(2, 132, 199, 0.6)' : '0 0 8px rgba(22, 163, 74, 0.6)') : 'none',
              }}
            />
            <span style={{ fontSize: '11px', fontWeight: 700, color: colors.textPrimary, whiteSpace: 'nowrap' }}>
              {!hasGps
                ? 'GPS UNAVAILABLE'
                : activeTrainLoc?.is_simulated
                ? 'ROUTE DEMO (SIMULATED)'
                : isStale
                ? 'GNSS DATA STALE'
                : `GPS FIX AVAILABLE (${activeTrainLoc?.satellites || 9} Satellites)`}
            </span>
            {hasGps && activeTrainLoc?.current_latitude != null && (
              <span style={{ fontSize: '10px', color: colors.textMuted, borderLeft: '1px solid #CBD5E1', paddingLeft: '8px' }}>
                {activeTrainLoc.current_latitude.toFixed(4)}° N, {activeTrainLoc.current_longitude?.toFixed(4)}° E &bull; Source: Coach {activeTrainLoc?.coach_number || 'C1'}
              </span>
            )}
          </div>

          {/* Upper-Right Map Toolbar */}
          <div
            style={{
              position: 'absolute',
              top: '14px',
              right: '14px',
              zIndex: 1000,
              display: 'flex',
              alignItems: 'center',
              flexWrap: 'wrap',
              maxWidth: 'calc(100vw - 28px)',
              gap: '6px',
              backgroundColor: 'rgba(255, 255, 255, 0.96)',
              backdropFilter: 'blur(6px)',
              padding: '5px',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
              border: `1px solid ${colors.border}`,
            }}
          >
            {/* 1. Expand Map Control */}
            <button
              id="map-expand-btn"
              onClick={handleToggleExpand}
              title={isMapExpanded ? 'Restore Normal Map Size' : 'Enlarge Map in Layout'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '6px',
                border: `1px solid ${isMapExpanded ? colors.primaryBorder : colors.borderStrong}`,
                backgroundColor: isMapExpanded ? colors.primarySurface : '#FFFFFF',
                color: isMapExpanded ? colors.primary : colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
              }}
            >
              {isMapExpanded ? <Shrink size={13} /> : <Expand size={13} />}
              <span>{isMapExpanded ? 'Normal View' : 'Expand Map'}</span>
            </button>

            {/* 2. Fullscreen Control */}
            <button
              id="map-fullscreen-btn"
              onClick={handleToggleFullscreen}
              title={isFullscreen ? 'Exit Fullscreen View (Esc)' : 'Expand to Fullscreen View'}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 11px',
                borderRadius: '6px',
                border: isFullscreen ? '1px solid #1D4ED8' : `1px solid ${colors.borderStrong}`,
                backgroundColor: isFullscreen ? '#2563EB' : '#FFFFFF',
                color: isFullscreen ? '#FFFFFF' : colors.textPrimary,
                fontSize: '11px',
                fontWeight: isFullscreen ? 700 : 600,
                cursor: 'pointer',
                transition: 'all 0.15s ease',
                boxShadow: isFullscreen ? '0 2px 8px rgba(37, 99, 235, 0.4)' : 'none',
              }}
            >
              {isFullscreen ? <Minimize2 size={13} /> : <Maximize2 size={13} />}
              <span>{isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}</span>
              {isFullscreen && (
                <span
                  style={{
                    fontSize: '9px',
                    fontWeight: 500,
                    backgroundColor: 'rgba(255, 255, 255, 0.25)',
                    padding: '1px 5px',
                    borderRadius: '3px',
                    marginLeft: '2px',
                  }}
                >
                  Esc
                </span>
              )}
            </button>

            {/* Toolbar Divider */}
            <div style={{ width: '1px', height: '18px', backgroundColor: colors.borderStrong, margin: '0 2px' }} />

            {/* 3. Google Maps Live */}
            <button
              id="map-googlemaps-btn"
              onClick={handleOpenGoogleMaps}
              title="Open Route in Google Maps Live View"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <ExternalLink size={13} color="#0284C7" />
              <span>Google Maps Live</span>
            </button>

            {/* 3. Satellite */}
            <button
              onClick={() => {
                const nextMode = tileMode === 'street' ? 'satellite' : 'street';
                setTileMode(nextMode);
                setFeedbackToast(`Switched map layer to ${nextMode === 'satellite' ? 'Esri Satellite Imagery' : 'OpenStreetMap Standard Cartography'}`);
              }}
              id="map-satellite-btn"
              title="Toggle Satellite Imagery"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${tileMode === 'satellite' ? '#7C3AED' : colors.borderStrong}`,
                backgroundColor: tileMode === 'satellite' ? '#EDE9FE' : '#FFFFFF',
                color: tileMode === 'satellite' ? '#6D28D9' : colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Layers size={13} />
              <span>{tileMode === 'satellite' ? 'Street' : 'Satellite'}</span>
            </button>

            {/* 4. Current Location */}
            <button
              onClick={handleCurrentLocation}
              id="map-currentloc-btn"
              title="Center on Physical GPS Telemetry"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Navigation size={13} color="#0284C7" />
              <span>Current Location</span>
            </button>

            {/* 5. Center Train */}
            <button
              onClick={handleCenterTrain}
              id="map-centertrain-btn"
              title="Center on Selected Train"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              <Crosshair size={13} color="#2563EB" />
              <span>Center Train</span>
            </button>

            {/* 5. World View */}
            <button
              id="map-worldview-btn"
              onClick={handleWorldView}
              title="Display Entire World View"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Globe size={13} color="#2563EB" />
              <span>World View</span>
            </button>

            {/* 6. Fit Corridor */}
            <button
              id="map-fitcorridor-btn"
              onClick={handleFitCorridor}
              title="Fit Viewport to Eastern Railway Corridor"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '6px 10px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <Navigation size={13} color="#0D9488" />
              <span>Fit Corridor</span>
            </button>

            {/* 9. Zoom In */}
            <button
              id="map-zoomin-btn"
              onClick={handleZoomIn}
              title="Zoom In"
              aria-label="Zoom In"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              <Plus size={14} />
            </button>

            {/* 10. Zoom Out */}
            <button
              id="map-zoomout-btn"
              onClick={handleZoomOut}
              title="Zoom Out"
              aria-label="Zoom Out"
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '28px',
                height: '28px',
                borderRadius: '6px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: '#FFFFFF',
                color: colors.textPrimary,
                cursor: 'pointer',
              }}
            >
              <Minus size={14} />
            </button>
          </div>

          {/* Contextual Detail Card Overlay (when entity is selected) */}
          {selectedEntity && (
            <div
              style={{
                position: 'absolute',
                bottom: '44px',
                right: '14px',
                zIndex: 1000,
                width: '320px',
                backgroundColor: 'rgba(255, 255, 255, 0.98)',
                backdropFilter: 'blur(8px)',
                borderRadius: '8px',
                border: `1px solid ${colors.primaryBorder}`,
                boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
                padding: '14px',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <MapPin size={15} color="#2563EB" />
                  <span style={{ fontSize: '11px', fontWeight: 800, color: colors.textMuted }}>
                    {selectedEntity.is_destination
                      ? 'ROUTE DESTINATION'
                      : selectedEntity.water_refill_available
                      ? 'WATER REFILL FACILITY'
                      : 'RAILWAY STATION'}
                  </span>
                </div>
                <button
                  onClick={() => setSelectedEntity(null)}
                  style={{
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    color: colors.textMuted,
                    padding: '2px',
                  }}
                >
                  <X size={15} />
                </button>
              </div>

              <div style={{ fontSize: '15px', fontWeight: 700, color: colors.textPrimary }}>
                {selectedEntity.name} ({selectedEntity.code})
              </div>

              <div style={{ fontSize: '11px', color: colors.textSecondary, lineHeight: 1.6 }}>
                <div>Coordinates: <strong>{selectedEntity.latitude.toFixed(4)}° N, {selectedEntity.longitude.toFixed(4)}° E</strong></div>
                <div>Water Refill: <strong>{selectedEntity.water_refill_available ? 'Available' : 'None'}</strong></div>
                {selectedEntity.water_capacity_liters > 0 && (
                  <div>Refill Capacity: <strong>{selectedEntity.water_capacity_liters.toLocaleString()} Liters</strong></div>
                )}
                <div>Operational Status: <strong style={{ color: selectedEntity.operational_status === 'Operational' ? '#16A34A' : '#64748B' }}>{selectedEntity.operational_status}</strong></div>
              </div>

              <div
                style={{
                  backgroundColor: selectedEntity.water_refill_available ? '#ECFDF5' : '#F1F5F9',
                  border: `1px solid ${selectedEntity.water_refill_available ? '#DCFCE7' : '#E2E8F0'}`,
                  borderRadius: '6px',
                  padding: '6px 10px',
                  fontSize: '11px',
                  color: selectedEntity.water_refill_available ? '#059669' : '#475569',
                  fontWeight: 600,
                }}
              >
                {selectedEntity.water_refill_available
                  ? '✓ Verified Water Replenishment Available at this Station'
                  : 'ℹ Standard Passenger Stoppage • No Refill Facility'}
              </div>
            </div>
          )}
        </div>

        {/* Map Legend (Section 5.D) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 14px',
            backgroundColor: colors.surfaceAlt,
            borderTop: `1px solid ${colors.border}`,
            fontSize: '11px',
            color: colors.textSecondary,
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#2563EB', display: 'inline-block' }} />
              <span>Live Train</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '50%', backgroundColor: '#0284C7', display: 'inline-block' }} />
              <span>Water Refill Facility</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', border: '2px solid #64748B', backgroundColor: '#FFFFFF', display: 'inline-block' }} />
              <span>Railway Station</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 9, height: 9, borderRadius: '2px', backgroundColor: '#7C3AED', display: 'inline-block' }} />
              <span>Destination</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ color: tileMode === 'satellite' ? '#38BDF8' : '#1D4ED8', fontWeight: 700 }}>— — —</span>
              <span>Railway Track Corridor Axis</span>
            </span>
          </div>

          <div style={{ color: colors.textMuted }}>
            {tileMode === 'satellite' ? 'Imagery © Esri World Imagery' : 'Cartography © OpenStreetMap contributors'}
          </div>
        </div>
      </div>

      {/* 2. Route Corridor and Refill Facilities Table (Directly Beneath Map, Section 5.E) */}
      <div
        style={{
          backgroundColor: colors.surface,
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          overflow: 'hidden',
          boxShadow: colors.shadowSubtle,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Table Title Bar */}
        <div
          style={{
            padding: '10px 16px',
            backgroundColor: colors.surfaceHighlight,
            borderBottom: `1px solid ${colors.border}`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '11px', fontWeight: 800, color: '#334155', letterSpacing: '0.5px' }}>
              ROUTE CORRIDOR & REFILL FACILITIES
            </span>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <span style={{ fontSize: '11px', color: colors.textMuted }}>
              Howrah (HWH) to Asansol (ASN) • 7 Stations • 4 Verified Water Refill Hubs
            </span>

            <button
              onClick={() => setIsCorridorExpanded(!isCorridorExpanded)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
                padding: '4px 10px',
                borderRadius: '4px',
                border: `1px solid ${colors.borderStrong}`,
                backgroundColor: colors.surface,
                color: colors.textPrimary,
                fontSize: '11px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              {isCorridorExpanded ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              <span>{isCorridorExpanded ? 'Collapse Route Corridor' : 'Expand Route Corridor'}</span>
            </button>
          </div>
        </div>

        {/* Scrollable Table Content */}
        <div
          style={{
            maxHeight: isCorridorExpanded ? '520px' : '260px',
            overflowY: 'auto',
            overflowX: 'auto',
            transition: 'max-height 0.22s ease-out',
          }}
        >
          <table
            style={{
              width: '100%',
              borderCollapse: 'collapse',
              fontSize: '11px',
              fontFamily: typography.fontFamily,
              textAlign: 'left',
            }}
          >
            <thead>
              <tr
                style={{
                  backgroundColor: colors.surfaceAlt,
                  color: colors.textMuted,
                  borderBottom: `1px solid ${colors.border}`,
                  fontSize: '10px',
                  fontWeight: 700,
                }}
              >
                <th style={{ padding: '8px 14px', width: '35px' }}>#</th>
                <th style={{ padding: '8px 12px', width: '60px' }}>CODE</th>
                <th style={{ padding: '8px 14px' }}>STATION NAME</th>
                <th style={{ padding: '8px 14px' }}>WATER REFILL CAPABILITY</th>
                <th style={{ padding: '8px 14px', width: '90px' }}>DISTANCE</th>
                <th style={{ padding: '8px 14px', width: '90px' }}>ESTIMATED ARRIVAL</th>
                <th style={{ padding: '8px 14px', width: '130px' }}>VERIFIED CAPACITY</th>
                <th style={{ padding: '8px 14px', width: '110px' }}>FACILITY STATUS</th>
                <th style={{ padding: '8px 14px', width: '70px', textAlign: 'center' }}>ACTION</th>
              </tr>
            </thead>
            <tbody>
              {enrichedStations.map((st, index) => {
                const isSelected = selectedStationCode === st.code;
                const isDestination = st.is_destination || st.code === 'ASN';
                const isRefill = st.water_refill_available && !isDestination;

                return (
                  <tr
                    key={st.code}
                    onClick={() => handleLocateStation(st)}
                    style={{
                      borderBottom: `1px solid ${colors.borderSubtle}`,
                      backgroundColor: isSelected
                        ? colors.primarySurface
                        : index % 2 === 0
                        ? '#FFFFFF'
                        : colors.surfaceHighlight,
                      cursor: 'pointer',
                      transition: 'background-color 0.15s ease',
                    }}
                  >
                    {/* 1. Serial Number (#) */}
                    <td style={{ padding: '9px 14px', color: colors.textMuted, fontWeight: 600 }}>
                      {st.route_order + 1}
                    </td>

                    {/* 2. Station Code */}
                    <td style={{ padding: '9px 12px' }}>
                      <span
                        style={{
                          display: 'inline-block',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          fontWeight: 700,
                          fontSize: '10px',
                          backgroundColor: isDestination
                            ? '#EDE9FE'
                            : isRefill
                            ? '#E0F2FE'
                            : '#F1F5F9',
                          color: isDestination ? '#6D28D9' : isRefill ? '#0284C7' : '#475569',
                          border: `1px solid ${
                            isDestination ? '#DDD6FE' : isRefill ? '#BAE6FD' : '#E2E8F0'
                          }`,
                        }}
                      >
                        {st.code}
                      </span>
                    </td>

                    {/* 3. Station Name */}
                    <td
                      style={{
                        padding: '9px 14px',
                        fontWeight: isSelected ? 700 : 600,
                        color: isSelected ? colors.primary : colors.textPrimary,
                        fontSize: '12px',
                      }}
                    >
                      {st.name}
                    </td>

                    {/* 4. Water Refill Capability */}
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            width: '7px',
                            height: '7px',
                            borderRadius: '50%',
                            backgroundColor: isDestination ? '#7C3AED' : isRefill ? '#0284C7' : '#94A3B8',
                          }}
                        />
                        <span
                          style={{
                            fontWeight: isRefill || isDestination ? 600 : 400,
                            color: isDestination ? '#6D28D9' : isRefill ? '#0369A1' : colors.textMuted,
                          }}
                        >
                          {isDestination
                            ? 'Terminal • Refill Hub'
                            : isRefill
                            ? 'Water Refill Available'
                            : 'No Refill Facility'}
                        </span>
                      </div>
                    </td>

                    {/* 5. Distance */}
                    <td style={{ padding: '9px 14px', fontWeight: 700, color: '#0284C7' }}>
                      {hasGps && st.distanceKm > 0 ? `${st.distanceKm.toFixed(1)} km` : '—'}
                    </td>

                    {/* 6. Estimated Arrival */}
                    <td style={{ padding: '9px 14px', fontWeight: 600, color: colors.textPrimary }}>
                      {st.etaString}
                    </td>

                    {/* 7. Verified Capacity */}
                    <td style={{ padding: '9px 14px', color: colors.textPrimary }}>
                      {st.water_capacity_liters > 0
                        ? `${st.water_capacity_liters.toLocaleString()} L`
                        : '—'}
                    </td>

                    {/* 8. Facility Status */}
                    <td style={{ padding: '9px 14px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                        <span
                          style={{
                            width: '6px',
                            height: '6px',
                            borderRadius: '50%',
                            backgroundColor:
                              st.operational_status === 'Operational' ? '#16A34A' : '#94A3B8',
                          }}
                        />
                        <span
                          style={{
                            color:
                              st.operational_status === 'Operational' ? '#16A34A' : colors.textMuted,
                            fontWeight: 600,
                          }}
                        >
                          {st.operational_status}
                        </span>
                      </div>
                    </td>

                    {/* 9. Action (Map Navigation) */}
                    <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleLocateStation(st);
                        }}
                        style={{
                          backgroundColor: isSelected ? colors.primary : colors.surfaceAlt,
                          color: isSelected ? '#FFFFFF' : colors.textPrimary,
                          border: `1px solid ${isSelected ? colors.primary : colors.borderStrong}`,
                          borderRadius: '4px',
                          padding: '3px 8px',
                          fontSize: '10px',
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        Map
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
