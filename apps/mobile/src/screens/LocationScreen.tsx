import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
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
import { TrainLocation, CorridorStation, LiveTelemetryPayload } from '../types';
import { mqttService, MqttGpsFix } from '../services/mqttService';
import {
  Maximize2,
  Minimize2,
  Layers,
  Crosshair,
  Navigation,
  ExternalLink,
  Plus,
  Minus,
  Droplets,
  MapPin,
  X,
  Info,
  Globe,
  Search,
  Train as TrainIcon,
  RotateCcw,
  Radio,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowRight,
  Filter,
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

export interface UnifiedTrainTrackingItem {
  train_number: string;
  train_name: string;
  region: string;
  source_station: string;
  destination_station: string;
  total_coaches: number;
  connected_devices: number;
  is_online: boolean;
  has_gps: boolean;
  current_latitude: number | null;
  current_longitude: number | null;
  current_altitude?: number | null;
  current_speed_kmh: number | null;
  satellites: number | null;
  nearest_station: string | null;
  last_update: string | null;
  status: 'ONLINE' | 'OFFLINE' | 'GPS_UNAVAILABLE';
  is_updating?: boolean;
}

export const LocationScreen: React.FC = () => {
  const {
    selectedTrainNumber,
    setSelectedTrainNumber,
    setActiveScreen,
    sidebarCollapsed,
    selectedStationCode: contextStationCode,
    setSelectedStationCode: setContextStationCode,
    mqttConnectionStatus,
    configuredTrains,
  } = useApp();

  // State
  const [locations, setLocations] = useState<TrainLocation[]>([]);
  const [stations, setStations] = useState<CorridorStation[]>([]);
  const [selectedStationCode, setSelectedStationCode] = useState<string>('');
  const [selectedEntity, setSelectedEntity] = useState<CorridorStation | null>(null);

  // View mode: 'all' displays every registered train, 'selected' isolates a specific train
  const [viewMode, setViewMode] = useState<'all' | 'selected'>('all');

  // Filters & Search
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [regionFilter, setRegionFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<string>('ALL');

  // Active bottom tab: 'fleet' (Multi-train tracking table) | 'corridor' (Route corridor & refill stations)
  const [bottomTab, setBottomTab] = useState<'fleet' | 'corridor'>('fleet');

  // Tile & Display controls
  const [tileMode, setTileMode] = useState<'street' | 'satellite'>('street');
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);
  const [isLayersOpen, setIsLayersOpen] = useState<boolean>(false);
  const [isMobileBottomSheetOpen, setIsMobileBottomSheetOpen] = useState<boolean>(false);

  // Transient set of trains that actively received an MQTT telemetry position update in the last 3s
  const [recentlyUpdatedTrains, setRecentlyUpdatedTrains] = useState<Set<string>>(new Set());

  // Real-time MQTT GPS fixes map keyed by train_number
  const [mqttTrainFixes, setMqttTrainFixes] = useState<Record<string, MqttGpsFix>>(() => {
    return mqttService.getAllTrainGpsFixes();
  });

  const [isMobileViewport, setIsMobileViewport] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return window.innerWidth < 1024;
    }
    return false;
  });

  // Map DOM Refs
  const mapWrapperRef = useRef<HTMLDivElement>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const trainMarkersRef = useRef<Record<string, L.Marker>>({});
  const stationMarkersRef = useRef<Record<string, L.Marker | L.CircleMarker>>({});
  const corridorPolylineRef = useRef<L.Polyline | null>(null);
  const selectedTrainTrailRef = useRef<L.Polyline | null>(null);
  const layersMenuRef = useRef<HTMLDivElement>(null);
  const tableContainerRef = useRef<HTMLDivElement>(null);

  // Auto-dismiss toast
  useEffect(() => {
    if (!feedbackToast) return;
    const t = setTimeout(() => setFeedbackToast(null), 3500);
    return () => clearTimeout(t);
  }, [feedbackToast]);

  // Window resize listener
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        setIsMobileViewport(window.innerWidth < 1024);
      }
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Close layers menu on outside click
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (layersMenuRef.current && !layersMenuRef.current.contains(e.target as Node)) {
        setIsLayersOpen(false);
      }
    };
    if (isLayersOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, [isLayersOpen]);

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

  // Fetch train locations from backend or local fleet store
  const fetchLocationsData = useCallback(async () => {
    try {
      const locs = await ApiClient.fetchLocations();
      if (Array.isArray(locs)) {
        setLocations(locs);
      }
    } catch (err) {
      console.warn('[LocationScreen] Error fetching locations:', err);
    }
  }, []);

  useEffect(() => {
    fetchLocationsData();
    const interval = setInterval(fetchLocationsData, 5000);
    return () => clearInterval(interval);
  }, [fetchLocationsData]);

  // Fetch route corridor halts when a train is selected
  useEffect(() => {
    let isMounted = true;
    if (!selectedTrainNumber || selectedTrainNumber.trim() === '') {
      setStations([]);
      return;
    }
    ApiClient.fetchCorridorStations(selectedTrainNumber)
      .then((data) => {
        if (isMounted) {
          setStations(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (isMounted) setStations([]);
      });

    return () => {
      isMounted = false;
    };
  }, [selectedTrainNumber]);

  // Subscribe to live MQTT telemetry without creating duplicate connections
  useEffect(() => {
    const unsubTelemetry = mqttService.onTelemetry((payload: LiveTelemetryPayload) => {
      const trno = (payload.trno || '').trim();
      if (!trno) return;

      // Update MQTT train fixes in state
      if (payload.gpsFix && payload.lat != null && payload.long != null) {
        const fixRecord: MqttGpsFix = {
          lat: payload.lat,
          long: payload.long,
          alt: payload.alt,
          speed: payload.speed,
          sats: payload.sats,
          accuracy: payload.accuracy,
          time: payload.time,
          receivedAt: payload.receivedAt || Date.now(),
          uid: payload.uid,
          trno,
          chno: payload.chno,
        };
        setMqttTrainFixes((prev) => ({
          ...prev,
          [trno]: fixRecord,
        }));
      }

      // Mark train as actively updating (Blue indicator for 3 seconds)
      setRecentlyUpdatedTrains((prev) => {
        const next = new Set(prev);
        next.add(trno);
        return next;
      });

      setTimeout(() => {
        setRecentlyUpdatedTrains((prev) => {
          const next = new Set(prev);
          next.delete(trno);
          return next;
        });
      }, 3000);
    });

    return () => {
      unsubTelemetry();
    };
  }, []);

  // Consolidate all registered trains into a single source of truth
  const unifiedTrains: UnifiedTrainTrackingItem[] = useMemo(() => {
    const mapByNum = new Map<string, UnifiedTrainTrackingItem>();

    // 1. Ingest all configured trains from AppContext
    configuredTrains.forEach((t) => {
      const num = (t.train_number || '').trim();
      if (!num) return;
      mapByNum.set(num, {
        train_number: num,
        train_name: t.name || `Train ${num}`,
        region: t.region || 'NORTH',
        source_station: t.source_station || 'Source',
        destination_station: t.destination_station || 'Destination',
        total_coaches: t.coaches_count || t.total_coaches || 1,
        connected_devices: 0,
        is_online: Boolean(t.is_online),
        has_gps: false,
        current_latitude: null,
        current_longitude: null,
        current_altitude: null,
        current_speed_kmh: null,
        satellites: null,
        nearest_station: t.source_station || 'Live Corridor',
        last_update: t.last_verified_at || null,
        status: t.is_online ? 'ONLINE' : 'OFFLINE',
      });
    });

    // 2. Merge backend / persistent store locations
    locations.forEach((l) => {
      const num = (l.train_number || '').trim();
      if (!num) return;
      const existing = mapByNum.get(num);

      const hasValidBackendGps = Boolean(
        l.has_gps &&
        l.current_latitude != null &&
        l.current_longitude != null &&
        Number.isFinite(l.current_latitude) &&
        Number.isFinite(l.current_longitude) &&
        !(l.current_latitude === 0 && l.current_longitude === 0)
      );

      if (existing) {
        existing.train_name = l.train_name || existing.train_name;
        existing.region = l.region || existing.region;
        existing.source_station = l.source_station || existing.source_station;
        existing.destination_station = l.destination_station || existing.destination_station;
        existing.total_coaches = l.total_coaches || existing.total_coaches;
        existing.connected_devices = l.connected_devices ?? existing.connected_devices;
        existing.is_online = l.is_online || existing.is_online;
        existing.nearest_station = l.nearest_station || existing.nearest_station;
        if (hasValidBackendGps) {
          existing.has_gps = true;
          existing.current_latitude = l.current_latitude!;
          existing.current_longitude = l.current_longitude!;
          existing.current_altitude = l.current_altitude ?? existing.current_altitude;
          existing.current_speed_kmh = l.current_speed_kmh ?? existing.current_speed_kmh;
          existing.satellites = l.satellites ?? existing.satellites;
          existing.last_update = l.last_update || existing.last_update;
        }
      } else {
        mapByNum.set(num, {
          train_number: num,
          train_name: l.train_name || `Train ${num}`,
          region: l.region || 'NORTH',
          source_station: l.source_station || 'Source',
          destination_station: l.destination_station || 'Destination',
          total_coaches: l.total_coaches || 1,
          connected_devices: l.connected_devices || 0,
          is_online: l.is_online,
          has_gps: hasValidBackendGps,
          current_latitude: hasValidBackendGps ? l.current_latitude! : null,
          current_longitude: hasValidBackendGps ? l.current_longitude! : null,
          current_altitude: l.current_altitude ?? null,
          current_speed_kmh: l.current_speed_kmh ?? null,
          satellites: l.satellites ?? null,
          nearest_station: l.nearest_station || 'Live Corridor',
          last_update: l.last_update || null,
          status: l.is_online ? 'ONLINE' : 'OFFLINE',
        });
      }
    });

    // 3. Overlay live MQTT GNSS telemetry
    Object.entries(mqttTrainFixes).forEach(([num, fix]) => {
      const cleanNum = num.trim();
      const existing = mapByNum.get(cleanNum);
      const isFixValid =
        fix.lat != null &&
        fix.long != null &&
        Number.isFinite(fix.lat) &&
        Number.isFinite(fix.long) &&
        !(fix.lat === 0 && fix.long === 0);

      if (isFixValid) {
        if (existing) {
          existing.has_gps = true;
          existing.current_latitude = fix.lat;
          existing.current_longitude = fix.long;
          existing.current_speed_kmh = fix.speed ?? existing.current_speed_kmh;
          existing.satellites = fix.sats ?? existing.satellites;
          existing.current_altitude = fix.alt ?? existing.current_altitude;
          existing.last_update = new Date(fix.receivedAt).toISOString();
          existing.is_online = mqttConnectionStatus === 'CONNECTED';
        } else {
          mapByNum.set(cleanNum, {
            train_number: cleanNum,
            train_name: `Train ${cleanNum}`,
            region: 'NORTH',
            source_station: 'Source',
            destination_station: 'Destination',
            total_coaches: 1,
            connected_devices: 1,
            is_online: mqttConnectionStatus === 'CONNECTED',
            has_gps: true,
            current_latitude: fix.lat,
            current_longitude: fix.long,
            current_altitude: fix.alt ?? null,
            current_speed_kmh: fix.speed ?? 0,
            satellites: fix.sats ?? null,
            nearest_station: 'Live Corridor',
            last_update: new Date(fix.receivedAt).toISOString(),
            status: mqttConnectionStatus === 'CONNECTED' ? 'ONLINE' : 'OFFLINE',
          });
        }
      }
    });

    // 4. Calculate definitive status and updating flags
    const result: UnifiedTrainTrackingItem[] = [];
    mapByNum.forEach((item) => {
      const isUpdating = recentlyUpdatedTrains.has(item.train_number);
      let status: 'ONLINE' | 'OFFLINE' | 'GPS_UNAVAILABLE' = 'OFFLINE';

      if (!item.has_gps || item.current_latitude == null || item.current_longitude == null) {
        status = 'GPS_UNAVAILABLE';
      } else if (item.is_online) {
        status = 'ONLINE';
      } else {
        status = 'OFFLINE';
      }

      result.push({
        ...item,
        status,
        is_updating: isUpdating,
      });
    });

    return result.sort((a, b) => a.train_number.localeCompare(b.train_number));
  }, [configuredTrains, locations, mqttTrainFixes, recentlyUpdatedTrains, mqttConnectionStatus]);

  // Fleet Statistics
  const totalRegisteredTrains = unifiedTrains.length;
  const onlineTrainsCount = unifiedTrains.filter((t) => t.is_online && t.has_gps).length;
  const offlineTrainsCount = unifiedTrains.filter((t) => !t.is_online && t.has_gps).length;
  const gpsUnavailableTrainsCount = unifiedTrains.filter((t) => !t.has_gps).length;

  // Filtered train list according to toolbar controls
  const filteredTrains = useMemo(() => {
    return unifiedTrains.filter((t) => {
      if (regionFilter !== 'ALL' && t.region.toUpperCase() !== regionFilter.toUpperCase()) {
        return false;
      }
      if (statusFilter === 'ONLINE' && t.status !== 'ONLINE') return false;
      if (statusFilter === 'OFFLINE' && t.status !== 'OFFLINE') return false;
      if (statusFilter === 'GPS_UNAVAILABLE' && t.status !== 'GPS_UNAVAILABLE') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const matchNum = t.train_number.toLowerCase().includes(q);
        const matchName = t.train_name.toLowerCase().includes(q);
        if (!matchNum && !matchName) return false;
      }

      return true;
    });
  }, [unifiedTrains, regionFilter, statusFilter, searchQuery]);

  // Selected train object
  const activeSelectedTrain = useMemo(() => {
    if (!selectedTrainNumber) return null;
    return unifiedTrains.find((t) => t.train_number === selectedTrainNumber) || null;
  }, [unifiedTrains, selectedTrainNumber]);

  // Initialize Leaflet Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const worldBounds = L.latLngBounds(WORLD_MAP_BOUNDS);
      const map = L.map(mapContainerRef.current, {
        center: [22.5, 82.0],
        zoom: 5,
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

      mapInstanceRef.current = map;
    }

    // ResizeObserver
    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapContainerRef.current) {
      ro = new ResizeObserver(() => {
        if (mapInstanceRef.current) {
          mapInstanceRef.current.invalidateSize({ animate: false });
        }
      });
      ro.observe(mapContainerRef.current);
    }

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
        } catch (e) {}
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        trainMarkersRef.current = {};
        stationMarkersRef.current = {};
        corridorPolylineRef.current = null;
        selectedTrainTrailRef.current = null;
      }
    };
  }, []);

  // Handle delegated button clicks inside Leaflet Popups
  useEffect(() => {
    const handleMapPopupClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const detailsBtn = target.closest('[data-action="view-train-details"]') as HTMLElement;
      if (detailsBtn) {
        const trainNo = detailsBtn.getAttribute('data-train-number');
        if (trainNo) {
          setSelectedTrainNumber(trainNo);
          setActiveScreen('coach-details');
        }
        return;
      }

      const selectBtn = target.closest('[data-action="select-train"]') as HTMLElement;
      if (selectBtn) {
        const trainNo = selectBtn.getAttribute('data-train-number');
        if (trainNo) {
          handleSelectTrain(trainNo);
        }
        return;
      }
    };

    const container = mapContainerRef.current;
    if (container) {
      container.addEventListener('click', handleMapPopupClick);
    }
    return () => {
      if (container) {
        container.removeEventListener('click', handleMapPopupClick);
      }
    };
  }, [setSelectedTrainNumber, setActiveScreen]);

  // Manage Tile Layer (Street vs Satellite)
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

    tileLayer.addTo(map);
    tileLayerRef.current = tileLayer;

    if (currentCenter && currentZoom != null) {
      map.setView(currentCenter, currentZoom, { animate: false });
    }
  }, [tileMode]);

  // Build HTML for Train Marker Pin
  const buildTrainMarkerHtml = (train: UnifiedTrainTrackingItem) => {
    // Determine pin color: Blue (Updating), Green (Online), Red (Offline)
    let pinBg = '#16A34A';
    let pinRing = 'rgba(22, 163, 74, 0.35)';
    let statusLabel = 'ONLINE';

    if (train.is_updating) {
      pinBg = '#2563EB';
      pinRing = 'rgba(37, 99, 235, 0.45)';
      statusLabel = 'UPDATING';
    } else if (train.status === 'ONLINE') {
      pinBg = '#16A34A';
      pinRing = 'rgba(22, 163, 74, 0.35)';
      statusLabel = 'ONLINE';
    } else {
      pinBg = '#DC2626';
      pinRing = 'rgba(220, 38, 38, 0.35)';
      statusLabel = 'OFFLINE';
    }

    const isSelected = selectedTrainNumber === train.train_number;

    return `
      <div class="train-map-marker-wrap ${isSelected ? 'is-selected' : ''}" style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; cursor: pointer; transform: translate3d(0,0,0);">
        <!-- Pulse ring for active/online trains -->
        <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background-color: ${pinRing}; animation: pulse 1.8s infinite; pointer-events: none;"></div>
        
        <!-- Main Circular Pin -->
        <div style="position: relative; width: 34px; height: 34px; border-radius: 50%; background-color: ${pinBg}; border: 2.5px solid #FFFFFF; box-shadow: 0 3px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #FFFFFF; z-index: 2; transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1);">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect width="16" height="16" x="4" y="3" rx="2"></rect>
            <path d="M4 11h16"></path>
            <path d="M12 3v8"></path>
            <path d="m8 19-2 3"></path>
            <path d="m18 22-2-3"></path>
            <circle cx="8" cy="15" r="1"></circle>
            <circle cx="16" cy="15" r="1"></circle>
          </svg>
        </div>

        <!-- Train Number Pill Label -->
        <div style="position: relative; margin-top: 3px; z-index: 3; background-color: rgba(15, 23, 42, 0.94); color: #FFFFFF; font-family: Inter, sans-serif; font-size: 10px; font-weight: 800; padding: 1px 6px; border-radius: 4px; border: 1px solid rgba(255, 255, 255, 0.4); box-shadow: 0 2px 6px rgba(0,0,0,0.3); white-space: nowrap; pointer-events: none;">
          ${train.train_number}
        </div>
      </div>
    `;
  };

  // Build 13-point compact popup HTML
  const buildTrainPopupHtml = (train: UnifiedTrainTrackingItem) => {
    let statusBadge = '<span style="background-color: #ECFDF5; color: #16A34A; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 10px;">ONLINE</span>';
    if (train.is_updating) {
      statusBadge = '<span style="background-color: #EFF6FF; color: #2563EB; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 10px;">UPDATING</span>';
    } else if (train.status === 'OFFLINE') {
      statusBadge = '<span style="background-color: #FEE2E2; color: #DC2626; padding: 2px 7px; border-radius: 4px; font-weight: 800; font-size: 10px;">OFFLINE</span>';
    }

    const latStr = train.current_latitude != null ? `${train.current_latitude.toFixed(5)}° N` : '—';
    const lonStr = train.current_longitude != null ? `${train.current_longitude.toFixed(5)}° E` : '—';
    const speedStr = train.current_speed_kmh != null ? `${train.current_speed_kmh.toFixed(1)} km/h` : '—';
    const lastUpdateStr = train.last_update ? new Date(train.last_update).toLocaleTimeString() : '—';

    return `
      <div style="font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif; font-size: 12px; min-width: 260px; max-width: 300px; line-height: 1.45; color: #0F172A; padding: 2px;">
        <!-- Header -->
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid #E2E8F0; padding-bottom: 6px; margin-bottom: 6px;">
          <div>
            <div style="font-size: 14px; font-weight: 800; color: #1E293B;">Train ${train.train_number}</div>
            <div style="font-size: 11px; font-weight: 600; color: #64748B;">${train.train_name}</div>
          </div>
          <div>${statusBadge}</div>
        </div>

        <!-- 13 Metadata Fields Grid -->
        <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 4px 8px; font-size: 11px; margin-bottom: 8px;">
          <div><span style="color: #64748B;">Region:</span> <strong>${train.region}</strong></div>
          <div><span style="color: #64748B;">Speed:</span> <strong style="color: #2563EB;">${speedStr}</strong></div>
          <div><span style="color: #64748B;">Source:</span> <strong>${train.source_station}</strong></div>
          <div><span style="color: #64748B;">Dest:</span> <strong>${train.destination_station}</strong></div>
          <div><span style="color: #64748B;">Latitude:</span> <strong>${latStr}</strong></div>
          <div><span style="color: #64748B;">Longitude:</span> <strong>${lonStr}</strong></div>
          <div><span style="color: #64748B;">Nearest Stn:</span> <strong>${train.nearest_station || 'Live Corridor'}</strong></div>
          <div><span style="color: #64748B;">Last Fix:</span> <strong>${lastUpdateStr}</strong></div>
          <div><span style="color: #64748B;">Coaches:</span> <strong>${train.total_coaches}</strong></div>
          <div><span style="color: #64748B;">Devices:</span> <strong>${train.connected_devices} Online</strong></div>
        </div>

        <!-- Action Button -->
        <div style="border-top: 1px solid #E2E8F0; padding-top: 8px; display: flex; gap: 6px;">
          <button 
            data-action="view-train-details" 
            data-train-number="${train.train_number}"
            style="flex: 1; display: flex; align-items: center; justify-content: center; gap: 6px; background-color: #2563EB; color: #FFFFFF; border: none; padding: 7px 12px; border-radius: 6px; font-size: 11px; font-weight: 700; cursor: pointer; transition: background 0.15s ease;"
          >
            <span>View Train Details</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M5 12h14"></path>
              <path d="m12 5 7 7-7 7"></path>
            </svg>
          </button>
        </div>
      </div>
    `;
  };

  // Manage Leaflet Markers dynamically (Zero map reload, zero layer churn)
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const visibleTrains = viewMode === 'selected' && activeSelectedTrain
      ? (activeSelectedTrain.has_gps ? [activeSelectedTrain] : [])
      : filteredTrains.filter((t) => t.has_gps);

    const activeTrainNumbers = new Set(visibleTrains.map((t) => t.train_number));

    // 1. Remove markers for trains no longer visible or without GPS
    Object.keys(trainMarkersRef.current).forEach((trainNum) => {
      if (!activeTrainNumbers.has(trainNum)) {
        map.removeLayer(trainMarkersRef.current[trainNum]);
        delete trainMarkersRef.current[trainNum];
      }
    });

    // 2. Add or update markers for visible trains with valid GPS
    visibleTrains.forEach((train) => {
      const lat = train.current_latitude!;
      const lon = train.current_longitude!;

      const existingMarker = trainMarkersRef.current[train.train_number];
      const iconHtml = buildTrainMarkerHtml(train);
      const icon = L.divIcon({
        html: iconHtml,
        className: 'custom-train-div-icon',
        iconSize: [44, 52],
        iconAnchor: [22, 26],
      });

      if (!existingMarker) {
        const marker = L.marker([lat, lon], {
          icon,
          title: `Train ${train.train_number} - ${train.train_name}`,
          zIndexOffset: selectedTrainNumber === train.train_number ? 1000 : 100,
        }).addTo(map);

        marker.bindPopup(buildTrainPopupHtml(train));
        marker.on('click', () => {
          handleSelectTrain(train.train_number);
        });

        trainMarkersRef.current[train.train_number] = marker;
      } else {
        existingMarker.setLatLng([lat, lon]);
        existingMarker.setIcon(icon);
        existingMarker.setZIndexOffset(selectedTrainNumber === train.train_number ? 1000 : 100);
        existingMarker.setPopupContent(buildTrainPopupHtml(train));
      }
    });
  }, [filteredTrains, viewMode, activeSelectedTrain, selectedTrainNumber]);

  // Render Station Markers and Route Corridor Polyline when an individual train is isolated
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (corridorPolylineRef.current) {
      map.removeLayer(corridorPolylineRef.current);
      corridorPolylineRef.current = null;
    }
    Object.values(stationMarkersRef.current).forEach((m) => map.removeLayer(m));
    stationMarkersRef.current = {};

    if (viewMode !== 'selected' || stations.length === 0) return;

    const corridorCoords: [number, number][] = stations
      .filter((s) => s && typeof s.latitude === 'number' && typeof s.longitude === 'number')
      .map((s) => [s.latitude, s.longitude]);

    if (corridorCoords.length >= 2) {
      const isSatellite = tileMode === 'satellite';
      const polyline = L.polyline(corridorCoords, {
        color: isSatellite ? '#38BDF8' : '#1D4ED8',
        weight: 4,
        opacity: 0.9,
        dashArray: '8, 6',
      }).addTo(map);
      corridorPolylineRef.current = polyline;
    }

    stations.forEach((st) => {
      const isDestination = Boolean(st.is_destination);
      const isRefill = st.water_refill_available && !isDestination;
      const isSelected = selectedStationCode === st.code;

      let iconHtml = '';
      if (isDestination) {
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 34px; height: 34px;">
            <div style="background-color: #7C3AED; color: #FFFFFF; border: 2px solid #FFFFFF; border-radius: 6px; padding: 2px 5px; font-weight: 800; font-size: 10px; font-family: Inter, sans-serif; box-shadow: 0 3px 8px rgba(0,0,0,0.35); text-align: center;">
              ${st.code}
            </div>
          </div>
        `;
      } else if (isRefill) {
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 32px; height: 36px;">
            <div style="background-color: #0284C7; color: #FFFFFF; border: 2px solid #FFFFFF; border-radius: 50%; width: 24px; height: 24px; display: flex; align-items: center; justify-content: center; box-shadow: 0 3px 8px rgba(0,0,0,0.3);">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
              </svg>
            </div>
            <div style="background: rgba(15,23,42,0.9); color: #FFF; font-size: 8px; font-weight: 800; padding: 0 3px; border-radius: 3px; font-family: Inter, sans-serif; margin-top: 1px;">
              ${st.code}
            </div>
          </div>
        `;
      } else {
        iconHtml = `
          <div style="position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; width: 26px; height: 30px;">
            <div style="background-color: #FFFFFF; border: 2.5px solid #475569; border-radius: 50%; width: 13px; height: 13px; box-shadow: 0 1px 5px rgba(0,0,0,0.25);"></div>
            <div style="background: rgba(248,250,252,0.95); color: #334155; font-size: 8px; font-weight: 700; padding: 0 3px; border-radius: 2px; font-family: Inter, sans-serif; border: 1px solid #CBD5E1; margin-top: 1px;">
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
      marker.bindPopup(`
        <div style="font-family: Inter, sans-serif; font-size: 12px; min-width: 200px; line-height: 1.5; color: #0F172A;">
          <div style="font-weight: 800; font-size: 13px; margin-bottom: 2px;">${st.name} (${st.code})</div>
          <div style="font-size: 11px; color: #475569;">
            ${st.water_refill_available ? '<span style="color:#059669; font-weight:700;">✓ Water Refill Available</span>' : '<span style="color:#64748B;">Passenger Halt</span>'}<br/>
            Refill Capacity: <strong>${st.water_capacity_liters > 0 ? st.water_capacity_liters.toLocaleString() + ' L' : '—'}</strong><br/>
            Coordinates: <strong>${st.latitude.toFixed(4)}° N, ${st.longitude.toFixed(4)}° E</strong>
          </div>
        </div>
      `);

      marker.on('click', () => {
        setSelectedStationCode(st.code);
        setSelectedEntity(st);
        map.setView([st.latitude, st.longitude], 12, { animate: true });
      });

      stationMarkersRef.current[st.code] = marker;
    });
  }, [stations, viewMode, tileMode, selectedStationCode]);

  // Initial bounds fit once trains or stations are ready
  const initialFitDoneRef = useRef(false);
  useEffect(() => {
    const map = mapInstanceRef.current;
    if (!map || initialFitDoneRef.current) return;

    const trainsWithGps = unifiedTrains.filter((t) => t.has_gps && t.current_latitude != null && t.current_longitude != null);
    if (trainsWithGps.length > 0) {
      const bounds = L.latLngBounds(trainsWithGps.map((t) => [t.current_latitude!, t.current_longitude!]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8, animate: false });
      initialFitDoneRef.current = true;
    }
  }, [unifiedTrains]);

  // Handlers
  const handleSelectTrain = useCallback((trainNum: string) => {
    setSelectedTrainNumber(trainNum);
    setViewMode('selected');
    const target = unifiedTrains.find((t) => t.train_number === trainNum);
    if (!target) return;

    if (target.has_gps && target.current_latitude != null && target.current_longitude != null) {
      mapInstanceRef.current?.flyTo([target.current_latitude, target.current_longitude], 13, { duration: 1.2 });
      setTimeout(() => {
        trainMarkersRef.current[trainNum]?.openPopup();
      }, 1250);
      setFeedbackToast(`Isolated Train ${trainNum} (${target.train_name})`);
    } else {
      setFeedbackToast(`Train ${trainNum} registered — GPS coordinates unavailable.`);
    }

    if (isMobileViewport) {
      setIsMobileBottomSheetOpen(true);
    }
  }, [setSelectedTrainNumber, unifiedTrains, isMobileViewport]);

  const handleReturnToAllTrains = useCallback(() => {
    setViewMode('all');
    setSelectedTrainNumber('');
    setIsMobileBottomSheetOpen(false);
    setSelectedEntity(null);
    setSelectedStationCode('');

    const map = mapInstanceRef.current;
    if (!map) return;

    const trainsWithGps = unifiedTrains.filter((t) => t.has_gps && t.current_latitude != null && t.current_longitude != null);
    if (trainsWithGps.length > 0) {
      const bounds = L.latLngBounds(trainsWithGps.map((t) => [t.current_latitude!, t.current_longitude!]));
      map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8, animate: true });
    }
    setFeedbackToast('Returned to All Trains mode — displaying full registered fleet.');
  }, [setSelectedTrainNumber, unifiedTrains]);

  const handleCenterMap = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    if (viewMode === 'selected' && activeSelectedTrain?.has_gps && activeSelectedTrain.current_latitude != null) {
      map.flyTo([activeSelectedTrain.current_latitude, activeSelectedTrain.current_longitude!], 13, { duration: 1.0 });
      setFeedbackToast(`Centered on Train ${activeSelectedTrain.train_number}`);
      return;
    }

    const trainsWithGps = unifiedTrains.filter((t) => t.has_gps && t.current_latitude != null && t.current_longitude != null);
    if (trainsWithGps.length > 0) {
      const bounds = L.latLngBounds(trainsWithGps.map((t) => [t.current_latitude!, t.current_longitude!]));
      map.fitBounds(bounds, { padding: [50, 50], maxZoom: 8, animate: true });
      setFeedbackToast('Centered map on registered train locations');
    } else {
      map.setView([22.5, 82.0], 5, { animate: true });
      setFeedbackToast('Awaiting GPS fixes — centered on Indian Railway network');
    }
  }, [viewMode, activeSelectedTrain, unifiedTrains]);

  const handleFitAllTrains = useCallback(() => {
    const map = mapInstanceRef.current;
    if (!map) return;

    const trainsWithGps = unifiedTrains.filter((t) => t.has_gps && t.current_latitude != null && t.current_longitude != null);
    if (trainsWithGps.length === 0) {
      setFeedbackToast('No registered trains with active GPS fixes to fit.');
      return;
    }
    const bounds = L.latLngBounds(trainsWithGps.map((t) => [t.current_latitude!, t.current_longitude!]));
    map.fitBounds(bounds, { padding: [60, 60], maxZoom: 8, animate: true });
    setFeedbackToast(`Fitted bounds to ${trainsWithGps.length} active train GPS fixes`);
  }, [unifiedTrains]);

  const handleToggleFullscreen = () => {
    if (!isFullscreen) {
      setIsFullscreen(true);
      if (mapWrapperRef.current?.requestFullscreen) {
        mapWrapperRef.current.requestFullscreen().catch(() => {});
      }
      setFeedbackToast('Entered fullscreen view.');
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      setFeedbackToast('Exited fullscreen view.');
    }
  };

  const handleToggleTileMode = () => {
    const next = tileMode === 'street' ? 'satellite' : 'street';
    setTileMode(next);
    setFeedbackToast(`Switched map layer to ${next === 'satellite' ? 'Esri Satellite' : 'OpenStreetMap'}`);
  };

  // Zoom helpers
  const handleZoomIn = () => mapInstanceRef.current?.zoomIn();
  const handleZoomOut = () => mapInstanceRef.current?.zoomOut();

  // Enriched Stations for Corridor Tab
  const enrichedStations = useMemo(() => {
    const trainLat = activeSelectedTrain?.current_latitude;
    const trainLon = activeSelectedTrain?.current_longitude;
    const hasGps = activeSelectedTrain?.has_gps && trainLat != null && trainLon != null;

    return stations.map((st) => {
      let distanceKm = 0;
      let etaString = '—';
      if (hasGps) {
        distanceKm = calculateTrackDistanceKm(trainLat!, trainLon!, st.latitude, st.longitude);
        etaString = calculateEta(distanceKm, activeSelectedTrain?.current_speed_kmh);
      }
      return {
        ...st,
        distanceKm,
        etaString,
      };
    });
  }, [stations, activeSelectedTrain]);

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
        padding: isMobileViewport ? '8px' : '16px',
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

      {/* =========================================================================
          1. TOP SECTION: TITLE & FLEET TRACKING STATS
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          backgroundColor: '#FFFFFF',
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: isMobileViewport ? '12px 14px' : '14px 20px',
          boxShadow: colors.shadowSubtle,
        }}
      >
        {/* Top Header Bar */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: colors.primarySurface,
                border: `1px solid ${colors.primaryBorder}`,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: colors.primary,
              }}
            >
              <TrainIcon size={20} />
            </div>
            <div>
              <h1
                style={{
                  margin: 0,
                  fontSize: isMobileViewport ? '16px' : '18px',
                  fontWeight: 800,
                  color: colors.textPrimary,
                  fontFamily: typography.fontFamily,
                  letterSpacing: '-0.3px',
                }}
              >
                Live Train Tracking
              </h1>
              <p style={{ margin: 0, fontSize: '11px', color: colors.textMuted }}>
                Real-Time GNSS Multi-Train Tracking & Interactive GIS Fleet Management
              </p>
            </div>
          </div>

          {/* MQTT Telemetry Status Indicator */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 10px',
                borderRadius: '20px',
                fontSize: '11px',
                fontWeight: 700,
                backgroundColor:
                  mqttConnectionStatus === 'CONNECTED'
                    ? '#ECFDF5'
                    : mqttConnectionStatus === 'STALE'
                    ? '#FEF3C7'
                    : '#FEE2E2',
                color:
                  mqttConnectionStatus === 'CONNECTED'
                    ? '#16A34A'
                    : mqttConnectionStatus === 'STALE'
                    ? '#D97706'
                    : '#DC2626',
                border: `1px solid ${
                  mqttConnectionStatus === 'CONNECTED'
                    ? '#A7F3D0'
                    : mqttConnectionStatus === 'STALE'
                    ? '#FDE68A'
                    : '#FECACA'
                }`,
              }}
            >
              <Radio size={12} className={mqttConnectionStatus === 'CONNECTED' ? 'animate-pulse' : ''} />
              <span>
                MQTT: {mqttConnectionStatus === 'CONNECTED' ? 'BROKER LIVE' : mqttConnectionStatus}
              </span>
            </div>
          </div>
        </div>

        {/* 4 Fleet Statistics Metric Badges */}
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: isMobileViewport ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)',
            gap: isMobileViewport ? '8px' : '12px',
          }}
        >
          {/* Total Registered Trains */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #E2E8F0',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', letterSpacing: '0.5px' }}>
                TOTAL REGISTERED
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#1E293B', marginTop: '2px' }}>
                {totalRegisteredTrains}
              </div>
            </div>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#EFF6FF',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#2563EB',
              }}
            >
              <TrainIcon size={16} />
            </div>
          </div>

          {/* Online Trains */}
          <div
            style={{
              backgroundColor: '#F0FDF4',
              border: '1px solid #BBF7D0',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#16A34A', letterSpacing: '0.5px' }}>
                ONLINE TRAINS
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#15803D', marginTop: '2px' }}>
                {onlineTrainsCount}
              </div>
            </div>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#DCFCE7',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#16A34A',
              }}
            >
              <CheckCircle2 size={16} />
            </div>
          </div>

          {/* Offline Trains */}
          <div
            style={{
              backgroundColor: '#FEF2F2',
              border: '1px solid #FECACA',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#DC2626', letterSpacing: '0.5px' }}>
                OFFLINE TRAINS
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#B91C1C', marginTop: '2px' }}>
                {offlineTrainsCount}
              </div>
            </div>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#FEE2E2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#DC2626',
              }}
            >
              <AlertCircle size={16} />
            </div>
          </div>

          {/* GPS Unavailable Trains */}
          <div
            style={{
              backgroundColor: '#F8FAFC',
              border: '1px solid #CBD5E1',
              borderRadius: '8px',
              padding: '10px 14px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ fontSize: '10px', fontWeight: 800, color: '#64748B', letterSpacing: '0.5px' }}>
                GPS UNAVAILABLE
              </div>
              <div style={{ fontSize: '20px', fontWeight: 800, color: '#475569', marginTop: '2px' }}>
                {gpsUnavailableTrainsCount}
              </div>
            </div>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                backgroundColor: '#E2E8F0',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#64748B',
              }}
            >
              <HelpCircle size={16} />
            </div>
          </div>
        </div>
      </div>

      {/* =========================================================================
          2. MAP TOOLBAR (TRAIN SELECTOR, SEARCH, REGION, STATUS, ACTIONS)
         ========================================================================= */}
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '8px',
          backgroundColor: '#FFFFFF',
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          padding: '10px 14px',
          boxShadow: colors.shadowSubtle,
        }}
      >
        {/* Left Side: Selectors & Filters */}
        <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '8px', flex: 1 }}>
          {/* Train Selector Dropdown */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
            <select
              id="train-view-selector"
              value={viewMode === 'all' ? 'ALL' : selectedTrainNumber}
              onChange={(e) => {
                const val = e.target.value;
                if (val === 'ALL') {
                  handleReturnToAllTrains();
                } else {
                  handleSelectTrain(val);
                }
              }}
              style={{
                padding: '7px 12px',
                borderRadius: '6px',
                border: `1px solid ${viewMode === 'selected' ? colors.primary : colors.borderStrong}`,
                backgroundColor: viewMode === 'selected' ? '#EFF6FF' : '#FFFFFF',
                color: viewMode === 'selected' ? colors.primary : colors.textPrimary,
                fontSize: '12px',
                fontWeight: 700,
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value="ALL">All Registered Trains ({totalRegisteredTrains})</option>
              {unifiedTrains.map((t) => (
                <option key={t.train_number} value={t.train_number}>
                  Train {t.train_number} - {t.train_name} ({t.has_gps ? (t.is_online ? 'Online' : 'Offline') : 'No GPS'})
                </option>
              ))}
            </select>

            {/* Clear / Return to All Trains button */}
            {viewMode === 'selected' && (
              <button
                id="btn-return-all-trains"
                onClick={handleReturnToAllTrains}
                title="Return to All Trains"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                  padding: '7px 10px',
                  borderRadius: '6px',
                  backgroundColor: '#F1F5F9',
                  color: '#475569',
                  border: '1px solid #CBD5E1',
                  fontSize: '11px',
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                <RotateCcw size={12} />
                <span>All Trains</span>
              </button>
            )}
          </div>

          {/* Search Train Input */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              backgroundColor: '#F8FAFC',
              border: `1px solid ${colors.borderStrong}`,
              borderRadius: '6px',
              padding: '0 8px',
              height: '32px',
              minWidth: isMobileViewport ? '100%' : '180px',
              flex: isMobileViewport ? '1 1 100%' : 'none',
            }}
          >
            <Search size={14} color="#64748B" />
            <input
              type="text"
              id="location-train-search"
              placeholder="Search train no. or name..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                border: 'none',
                background: 'transparent',
                outline: 'none',
                padding: '4px 6px',
                fontSize: '12px',
                width: '100%',
                color: colors.textPrimary,
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B', padding: 0 }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {/* Region Filter */}
          <select
            id="filter-region-selector"
            value={regionFilter}
            onChange={(e) => setRegionFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">All Regions</option>
            <option value="NORTH">Northern (NR)</option>
            <option value="SOUTH">Southern (SR)</option>
            <option value="EAST">Eastern (ER/SER)</option>
            <option value="WEST">Western (WR/CR)</option>
          </select>

          {/* Status Filter */}
          <select
            id="filter-status-selector"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
              outline: 'none',
            }}
          >
            <option value="ALL">All Statuses</option>
            <option value="ONLINE">Online Only</option>
            <option value="OFFLINE">Offline Only</option>
            <option value="GPS_UNAVAILABLE">GPS Unavailable</option>
          </select>
        </div>

        {/* Right Side: Map Navigation & Tile Controls */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {/* Fit All Trains */}
          <button
            id="btn-fit-all-trains"
            onClick={handleFitAllTrains}
            title="Fit Map Viewport to All Registered Trains"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
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
            <Navigation size={13} color="#0D9488" />
            <span style={{ display: isMobileViewport ? 'none' : 'inline' }}>Fit All Trains</span>
          </button>

          {/* Center Map */}
          <button
            id="btn-center-map"
            onClick={handleCenterMap}
            title="Center Map on Selected Train or Fleet Center"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
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
            <span style={{ display: isMobileViewport ? 'none' : 'inline' }}>Center</span>
          </button>

          {/* Street / Satellite Toggle */}
          <button
            id="btn-toggle-satellite"
            onClick={handleToggleTileMode}
            title={`Toggle Satellite Imagery (${tileMode === 'street' ? 'Currently Street' : 'Currently Satellite'})`}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '4px',
              padding: '6px 10px',
              borderRadius: '6px',
              border: `1px solid ${tileMode === 'satellite' ? '#7C3AED' : colors.borderStrong}`,
              backgroundColor: tileMode === 'satellite' ? '#F5F3FF' : '#FFFFFF',
              color: tileMode === 'satellite' ? '#7C3AED' : colors.textPrimary,
              fontSize: '11px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            <Layers size={13} />
            <span style={{ display: isMobileViewport ? 'none' : 'inline' }}>
              {tileMode === 'satellite' ? 'Satellite' : 'Street'}
            </span>
          </button>

          {/* Fullscreen Toggle */}
          <button
            id="btn-toggle-fullscreen"
            onClick={handleToggleFullscreen}
            title={isFullscreen ? 'Exit Fullscreen' : 'Enter Fullscreen'}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '32px',
              height: '32px',
              borderRadius: '6px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              cursor: 'pointer',
            }}
          >
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* =========================================================================
          3. MAIN MAP CONTAINER
         ========================================================================= */}
      <div
        ref={mapWrapperRef}
        id="location-map-wrapper"
        style={{
          position: 'relative',
          height: isFullscreen ? '100vh' : isMobileViewport ? '55vh' : '520px',
          minHeight: '380px',
          border: isFullscreen ? 'none' : `1px solid ${colors.border}`,
          borderRadius: isFullscreen ? '0px' : `${metrics.cardRadius}px`,
          overflow: 'hidden',
          boxShadow: isFullscreen ? 'none' : colors.shadowSubtle,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Active Selection Floating Pill */}
        {viewMode === 'selected' && activeSelectedTrain && (
          <div
            style={{
              position: 'absolute',
              top: '12px',
              left: '12px',
              zIndex: 1000,
              backgroundColor: 'rgba(15, 23, 42, 0.94)',
              backdropFilter: 'blur(8px)',
              color: '#FFFFFF',
              padding: '6px 12px',
              borderRadius: '8px',
              border: '1px solid #334155',
              boxShadow: '0 4px 14px rgba(0,0,0,0.25)',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              fontSize: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  backgroundColor:
                    activeSelectedTrain.status === 'ONLINE'
                      ? '#16A34A'
                      : activeSelectedTrain.status === 'OFFLINE'
                      ? '#DC2626'
                      : '#64748B',
                }}
              />
              <span style={{ fontWeight: 800 }}>Tracking Train {activeSelectedTrain.train_number}</span>
              <span style={{ color: '#94A3B8', fontSize: '11px' }}>({activeSelectedTrain.train_name})</span>
            </div>
            <button
              onClick={handleReturnToAllTrains}
              style={{
                backgroundColor: '#2563EB',
                border: 'none',
                color: '#FFFFFF',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '11px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              Show All Trains
            </button>
          </div>
        )}

        {/* Geographic Leaflet Container */}
        <div
          ref={mapContainerRef}
          id="location-map-container"
          style={{
            width: '100%',
            height: '100%',
            flex: 1,
            position: 'relative',
            zIndex: 1,
            backgroundColor: tileMode === 'satellite' ? '#0B132B' : '#E2E8F0',
          }}
        />

        {/* Floating Zoom & FAB Controls on Map */}
        <div
          style={{
            position: 'absolute',
            bottom: isMobileViewport ? '16px' : '36px',
            right: '12px',
            zIndex: 1000,
            display: 'flex',
            flexDirection: 'column',
            gap: '6px',
          }}
        >
          {/* Floating Center Button */}
          <button
            onClick={handleCenterMap}
            title="Center Map"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Crosshair size={18} color="#2563EB" />
          </button>

          {/* Floating Fit All Button */}
          <button
            onClick={handleFitAllTrains}
            title="Fit All Trains"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Navigation size={18} color="#0D9488" />
          </button>

          {/* Zoom In */}
          <button
            onClick={handleZoomIn}
            title="Zoom In"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Plus size={18} />
          </button>

          {/* Zoom Out */}
          <button
            onClick={handleZoomOut}
            title="Zoom Out"
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '8px',
              border: `1px solid ${colors.borderStrong}`,
              backgroundColor: '#FFFFFF',
              color: colors.textPrimary,
              boxShadow: '0 2px 8px rgba(0,0,0,0.18)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <Minus size={18} />
          </button>
        </div>

        {/* Legend Bar at Bottom of Map */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '7px 14px',
            backgroundColor: '#F8FAFC',
            borderTop: `1px solid ${colors.border}`,
            fontSize: '11px',
            color: colors.textSecondary,
            flexWrap: 'wrap',
            gap: '8px',
            zIndex: 2,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flexWrap: 'wrap' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#16A34A', display: 'inline-block' }} />
              <span>Online Train</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#DC2626', display: 'inline-block' }} />
              <span>Offline Train</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#2563EB', display: 'inline-block' }} />
              <span>Updating (Live Fix)</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#64748B', display: 'inline-block' }} />
              <span>GPS Unavailable (Table Only)</span>
            </span>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: '#0284C7', display: 'inline-block' }} />
              <span>Refill Facility</span>
            </span>
          </div>
          <div style={{ color: colors.textMuted }}>
            {tileMode === 'satellite' ? 'Imagery © Esri World Imagery' : 'Cartography © OpenStreetMap contributors'}
          </div>
        </div>
      </div>

      {/* =========================================================================
          4. MOBILE BOTTOM SHEET FOR SELECTED TRAIN (MOBILE ONLY)
         ========================================================================= */}
      {isMobileViewport && viewMode === 'selected' && activeSelectedTrain && isMobileBottomSheetOpen && (
        <div
          style={{
            backgroundColor: '#FFFFFF',
            border: `1px solid ${colors.primaryBorder}`,
            borderRadius: '12px',
            padding: '14px',
            boxShadow: '0 8px 24px rgba(0,0,0,0.18)',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '15px', fontWeight: 800, color: colors.textPrimary }}>
                Train {activeSelectedTrain.train_number}
              </div>
              <div style={{ fontSize: '12px', color: colors.textSecondary }}>{activeSelectedTrain.train_name}</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span
                style={{
                  padding: '2px 8px',
                  borderRadius: '4px',
                  fontSize: '11px',
                  fontWeight: 800,
                  backgroundColor:
                    activeSelectedTrain.status === 'ONLINE'
                      ? '#ECFDF5'
                      : activeSelectedTrain.status === 'OFFLINE'
                      ? '#FEE2E2'
                      : '#F1F5F9',
                  color:
                    activeSelectedTrain.status === 'ONLINE'
                      ? '#16A34A'
                      : activeSelectedTrain.status === 'OFFLINE'
                      ? '#DC2626'
                      : '#64748B',
                }}
              >
                {activeSelectedTrain.status}
              </span>
              <button
                onClick={() => setIsMobileBottomSheetOpen(false)}
                style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#64748B' }}
              >
                <X size={16} />
              </button>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', fontSize: '11px' }}>
            <div><span style={{ color: '#64748B' }}>Speed:</span> <strong>{activeSelectedTrain.current_speed_kmh != null ? `${activeSelectedTrain.current_speed_kmh.toFixed(1)} km/h` : '—'}</strong></div>
            <div><span style={{ color: '#64748B' }}>Region:</span> <strong>{activeSelectedTrain.region}</strong></div>
            <div><span style={{ color: '#64748B' }}>Coordinates:</span> <strong>{activeSelectedTrain.current_latitude ? `${activeSelectedTrain.current_latitude.toFixed(4)}° N, ${activeSelectedTrain.current_longitude?.toFixed(4)}° E` : '—'}</strong></div>
            <div><span style={{ color: '#64748B' }}>Nearest Stn:</span> <strong>{activeSelectedTrain.nearest_station || 'Live Corridor'}</strong></div>
          </div>

          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button
              onClick={() => {
                setSelectedTrainNumber(activeSelectedTrain.train_number);
                setActiveScreen('coach-details');
              }}
              style={{
                flex: 1,
                minHeight: '44px',
                backgroundColor: colors.primary,
                color: '#FFFFFF',
                border: 'none',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '13px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '6px',
                cursor: 'pointer',
              }}
            >
              <span>View Train Details</span>
              <ArrowRight size={15} />
            </button>
            <button
              onClick={handleReturnToAllTrains}
              style={{
                padding: '0 14px',
                minHeight: '44px',
                backgroundColor: '#F1F5F9',
                color: '#475569',
                border: '1px solid #CBD5E1',
                borderRadius: '8px',
                fontWeight: 700,
                fontSize: '12px',
                cursor: 'pointer',
              }}
            >
              All Trains
            </button>
          </div>
        </div>
      )}

      {/* =========================================================================
          5. BOTTOM SECTION: MULTI-TRAIN TRACKING TABLE & CORRIDOR TABS
         ========================================================================= */}
      <div
        ref={tableContainerRef}
        style={{
          backgroundColor: '#FFFFFF',
          border: `1px solid ${colors.border}`,
          borderRadius: `${metrics.cardRadius}px`,
          overflow: 'hidden',
          boxShadow: colors.shadowSubtle,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Navigation Tabs Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '8px 16px',
            backgroundColor: '#F8FAFC',
            borderBottom: `1px solid ${colors.border}`,
            flexWrap: 'wrap',
            gap: '8px',
          }}
        >
          {/* Tabs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <button
              id="tab-fleet-tracking"
              onClick={() => setBottomTab('fleet')}
              style={{
                padding: '6px 14px',
                borderRadius: '6px',
                border: `1px solid ${bottomTab === 'fleet' ? colors.primary : 'transparent'}`,
                backgroundColor: bottomTab === 'fleet' ? '#EFF6FF' : 'transparent',
                color: bottomTab === 'fleet' ? colors.primary : colors.textSecondary,
                fontSize: '12px',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <TrainIcon size={14} />
              <span>TRAIN FLEET TRACKING ({filteredTrains.length})</span>
            </button>

            {viewMode === 'selected' && stations.length > 0 && (
              <button
                id="tab-route-corridor"
                onClick={() => setBottomTab('corridor')}
                style={{
                  padding: '6px 14px',
                  borderRadius: '6px',
                  border: `1px solid ${bottomTab === 'corridor' ? colors.primary : 'transparent'}`,
                  backgroundColor: bottomTab === 'corridor' ? '#EFF6FF' : 'transparent',
                  color: bottomTab === 'corridor' ? colors.primary : colors.textSecondary,
                  fontSize: '12px',
                  fontWeight: 800,
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <MapPin size={14} />
                <span>ROUTE CORRIDOR & REFILL HUBS ({stations.length})</span>
              </button>
            )}
          </div>

          <div style={{ fontSize: '11px', color: colors.textMuted }}>
            {bottomTab === 'fleet'
              ? 'Click a row to locate and isolate train on map'
              : `Corridor for Train ${selectedTrainNumber}`}
          </div>
        </div>

        {/* Tab 1 Content: Synchronized Multi-Train Tracking Table */}
        {bottomTab === 'fleet' && (
          <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
            <table
              id="train-fleet-tracking-table"
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
                    fontWeight: 800,
                    letterSpacing: '0.5px',
                  }}
                >
                  <th style={{ padding: '9px 14px' }}>TRAIN NUMBER</th>
                  <th style={{ padding: '9px 14px' }}>TRAIN NAME</th>
                  <th style={{ padding: '9px 14px' }}>REGION</th>
                  <th style={{ padding: '9px 14px' }}>STATUS</th>
                  <th style={{ padding: '9px 14px' }}>LATITUDE</th>
                  <th style={{ padding: '9px 14px' }}>LONGITUDE</th>
                  <th style={{ padding: '9px 14px' }}>SPEED</th>
                  <th style={{ padding: '9px 14px' }}>LAST UPDATE</th>
                  <th style={{ padding: '9px 14px', textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {filteredTrains.length === 0 ? (
                  <tr>
                    <td colSpan={9} style={{ padding: '24px', textAlign: 'center', color: colors.textMuted }}>
                      No registered trains match the selected filters.
                    </td>
                  </tr>
                ) : (
                  filteredTrains.map((train, idx) => {
                    const isSelected = selectedTrainNumber === train.train_number;
                    const latStr = train.current_latitude != null ? `${train.current_latitude.toFixed(5)}° N` : '—';
                    const lonStr = train.current_longitude != null ? `${train.current_longitude.toFixed(5)}° E` : '—';
                    const speedStr = train.current_speed_kmh != null ? `${train.current_speed_kmh.toFixed(1)} km/h` : '—';
                    const timeStr = train.last_update ? new Date(train.last_update).toLocaleTimeString() : '—';

                    return (
                      <tr
                        key={train.train_number}
                        id={`train-row-${train.train_number}`}
                        onClick={() => handleSelectTrain(train.train_number)}
                        style={{
                          borderBottom: `1px solid ${colors.borderSubtle}`,
                          backgroundColor: isSelected
                            ? '#EFF6FF'
                            : idx % 2 === 0
                            ? '#FFFFFF'
                            : '#F8FAFC',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease',
                          borderLeft: isSelected ? `4px solid ${colors.primary}` : '4px solid transparent',
                        }}
                      >
                        {/* Train Number */}
                        <td style={{ padding: '10px 14px' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <TrainIcon size={14} color={isSelected ? colors.primary : '#64748B'} />
                            <strong style={{ fontSize: '12px', color: isSelected ? colors.primary : colors.textPrimary }}>
                              {train.train_number}
                            </strong>
                          </div>
                        </td>

                        {/* Train Name */}
                        <td style={{ padding: '10px 14px', fontWeight: 600, color: colors.textPrimary }}>
                          <div>{train.train_name}</div>
                          <div style={{ fontSize: '10px', color: colors.textMuted }}>
                            {train.source_station} &rarr; {train.destination_station}
                          </div>
                        </td>

                        {/* Region */}
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 700,
                              backgroundColor: '#F1F5F9',
                              color: '#475569',
                              border: '1px solid #E2E8F0',
                            }}
                          >
                            {train.region}
                          </span>
                        </td>

                        {/* Status */}
                        <td style={{ padding: '10px 14px' }}>
                          <span
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '4px',
                              padding: '2px 8px',
                              borderRadius: '4px',
                              fontSize: '10px',
                              fontWeight: 800,
                              backgroundColor:
                                train.status === 'ONLINE'
                                  ? '#ECFDF5'
                                  : train.status === 'OFFLINE'
                                  ? '#FEE2E2'
                                  : '#F1F5F9',
                              color:
                                train.status === 'ONLINE'
                                  ? '#16A34A'
                                  : train.status === 'OFFLINE'
                                  ? '#DC2626'
                                  : '#64748B',
                              border: `1px solid ${
                                train.status === 'ONLINE'
                                  ? '#BBF7D0'
                                  : train.status === 'OFFLINE'
                                  ? '#FECACA'
                                  : '#E2E8F0'
                              }`,
                            }}
                          >
                            <span
                              style={{
                                width: '6px',
                                height: '6px',
                                borderRadius: '50%',
                                backgroundColor:
                                  train.status === 'ONLINE'
                                    ? '#16A34A'
                                    : train.status === 'OFFLINE'
                                    ? '#DC2626'
                                    : '#64748B',
                              }}
                            />
                            <span>{train.status === 'GPS_UNAVAILABLE' ? 'GPS UNAVAILABLE' : train.status}</span>
                          </span>
                        </td>

                        {/* Latitude */}
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px' }}>
                          {latStr}
                        </td>

                        {/* Longitude */}
                        <td style={{ padding: '10px 14px', fontFamily: 'monospace', fontSize: '11px' }}>
                          {lonStr}
                        </td>

                        {/* Speed */}
                        <td style={{ padding: '10px 14px', fontWeight: 700, color: '#0284C7' }}>
                          {speedStr}
                        </td>

                        {/* Last Update */}
                        <td style={{ padding: '10px 14px', color: colors.textSecondary }}>
                          {timeStr}
                        </td>

                        {/* Actions */}
                        <td style={{ padding: '10px 14px', textAlign: 'center' }}>
                          <div style={{ display: 'inline-flex', gap: '4px' }}>
                            <button
                              id={`btn-track-train-${train.train_number}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                handleSelectTrain(train.train_number);
                              }}
                              style={{
                                backgroundColor: isSelected ? colors.primary : '#F1F5F9',
                                color: isSelected ? '#FFFFFF' : colors.textPrimary,
                                border: `1px solid ${isSelected ? colors.primary : colors.borderStrong}`,
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Track
                            </button>
                            <button
                              id={`btn-details-train-${train.train_number}`}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTrainNumber(train.train_number);
                                setActiveScreen('coach-details');
                              }}
                              style={{
                                backgroundColor: '#FFFFFF',
                                color: colors.primary,
                                border: `1px solid ${colors.primaryBorder}`,
                                borderRadius: '4px',
                                padding: '4px 8px',
                                fontSize: '10px',
                                fontWeight: 700,
                                cursor: 'pointer',
                              }}
                            >
                              Details
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Tab 2 Content: Route Corridor & Refill Hubs */}
        {bottomTab === 'corridor' && (
          <div style={{ overflowX: 'auto', maxHeight: '420px', overflowY: 'auto' }}>
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
                  <th style={{ padding: '8px 14px' }}>WATER REFILL STATUS</th>
                  <th style={{ padding: '8px 14px', width: '90px' }}>DISTANCE</th>
                  <th style={{ padding: '8px 14px', width: '90px' }}>ESTIMATED ARRIVAL</th>
                  <th style={{ padding: '8px 14px', width: '130px' }}>CAPACITY</th>
                  <th style={{ padding: '8px 14px', width: '70px', textAlign: 'center' }}>ACTION</th>
                </tr>
              </thead>
              <tbody>
                {enrichedStations.map((st, index) => {
                  const isDestination = st.is_destination;
                  const isRefill = st.water_refill_available && !isDestination;
                  return (
                    <tr
                      key={st.code}
                      onClick={() => {
                        setSelectedStationCode(st.code);
                        setSelectedEntity(st);
                        mapInstanceRef.current?.setView([st.latitude, st.longitude], 12, { animate: true });
                      }}
                      style={{
                        borderBottom: `1px solid ${colors.borderSubtle}`,
                        backgroundColor: index % 2 === 0 ? '#FFFFFF' : colors.surfaceHighlight,
                        cursor: 'pointer',
                      }}
                    >
                      <td style={{ padding: '9px 14px', color: colors.textMuted }}>{index + 1}</td>
                      <td style={{ padding: '9px 12px', fontWeight: 800 }}>{st.code}</td>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{st.name}</td>
                      <td style={{ padding: '9px 14px' }}>
                        {isRefill ? (
                          <span style={{ color: '#059669', fontWeight: 700 }}>✓ Water Refill Available</span>
                        ) : (
                          <span style={{ color: colors.textMuted }}>Standard Stoppage</span>
                        )}
                      </td>
                      <td style={{ padding: '9px 14px', color: '#0284C7', fontWeight: 700 }}>
                        {st.distanceKm > 0 ? `${st.distanceKm.toFixed(1)} km` : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', fontWeight: 600 }}>{st.etaString}</td>
                      <td style={{ padding: '9px 14px' }}>
                        {st.water_capacity_liters > 0 ? `${st.water_capacity_liters.toLocaleString()} L` : '—'}
                      </td>
                      <td style={{ padding: '9px 14px', textAlign: 'center' }}>
                        <button
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            border: `1px solid ${colors.borderStrong}`,
                            backgroundColor: '#FFFFFF',
                            fontSize: '10px',
                            cursor: 'pointer',
                          }}
                        >
                          Locate
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
