import React, {
  Component,
  useEffect,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
} from 'react';
import L, { type Map as LeafletMap, type LayerGroup as LeafletLayerGroup } from 'leaflet';
import type { IncidentSummary } from '@godavari/shared';

export interface OperationalMapProps {
  incidents: IncidentSummary[];
  selectedIncidentId: string | null;
  onSelectIncident: (id: string) => void;
  tileUrl?: string;
  attribution?: string;
}

// Fictional demonstration zones around fictional Godavari riverfront demo sector
export const FICTIONAL_DEMO_ZONES = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    code: 'DEMO-Z01',
    name: 'Amber Loop',
    center: [17.005, 81.775] as [number, number],
    radius: 350,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    code: 'DEMO-Z02',
    name: 'Paper Lantern Walk',
    center: [17.008, 81.782] as [number, number],
    radius: 300,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    code: 'DEMO-Z03',
    name: 'Mango-Glass Garden',
    center: [16.998, 81.785] as [number, number],
    radius: 400,
  },
  {
    id: '00000000-0000-4000-8000-000000000104',
    code: 'DEMO-Z04',
    name: 'Copper Thread Court',
    center: [16.994, 81.778] as [number, number],
    radius: 320,
  },
  {
    id: '00000000-0000-4000-8000-000000000105',
    code: 'DEMO-Z05',
    name: 'Indigo Ferry Pier',
    center: [17.002, 81.77] as [number, number],
    radius: 380,
  },
  {
    id: '00000000-0000-4000-8000-000000000106',
    code: 'DEMO-Z06',
    name: 'Lotus Court',
    center: [17.012, 81.778] as [number, number],
    radius: 340,
  },
];

// Fictional simulated team base stations (NEVER claim these are live GPS)
export const SIMULATED_TEAM_STATIONS = [
  {
    name: 'Team Alpha Station',
    position: [17.006, 81.773] as [number, number],
    capability: 'MEDICAL',
  },
  {
    name: 'Team Bravo Station',
    position: [16.996, 81.781] as [number, number],
    capability: 'CROWD_MANAGEMENT',
  },
  {
    name: 'Team Charlie Station',
    position: [17.009, 81.785] as [number, number],
    capability: 'GENERAL_RESCUE',
  },
];

interface MapErrorBoundaryProps {
  children: ReactNode;
  incidents: IncidentSummary[];
  onSelectIncident: (id: string) => void;
}

interface MapErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class MapErrorBoundary extends Component<MapErrorBoundaryProps, MapErrorBoundaryState> {
  override state: MapErrorBoundaryState = {
    hasError: false,
    errorMessage: null,
  };

  static getDerivedStateFromError(error: Error): MapErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  override componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('OperationalMap failed to render:', error, info);
  }

  override render() {
    if (this.state.hasError) {
      return (
        <div className="map-fallback-panel" role="region" aria-label="Incident Locations Fallback">
          <div className="map-fallback-banner">
            <strong>Map tiles / renderer unavailable.</strong>
            <span>
              Triage and response workflows remain fully active. Location data is displayed below.
            </span>
          </div>
          <table className="map-fallback-table">
            <thead>
              <tr>
                <th>Incident ID</th>
                <th>Category</th>
                <th>Coordinates</th>
                <th>Source</th>
                <th>Landmark / Notes</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {this.props.incidents.map((incident) => (
                <tr key={incident.id}>
                  <td>
                    <code>{incident.id.slice(0, 8)}</code>
                  </td>
                  <td>{incident.category}</td>
                  <td>
                    {incident.latitude !== undefined &&
                    incident.latitude !== null &&
                    incident.longitude !== undefined &&
                    incident.longitude !== null
                      ? `${incident.latitude.toFixed(5)}, ${incident.longitude.toFixed(5)}`
                      : 'No coordinates'}
                  </td>
                  <td>
                    <span
                      className={`source-badge source-${incident.locationSource.toLowerCase()}`}
                    >
                      {incident.locationSource}
                    </span>
                  </td>
                  <td>{incident.landmark || incident.summary.slice(0, 40)}</td>
                  <td>
                    <button
                      type="button"
                      className="btn-link"
                      onClick={() => this.props.onSelectIncident(incident.id)}
                    >
                      Inspect
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return this.props.children;
  }
}

function calculateLocationStaleness(capturedAt: string | null | undefined): string {
  if (!capturedAt) return 'Timestamp unknown';
  const capturedTime = new Date(capturedAt).getTime();
  const now = Date.now();
  const diffSec = Math.max(0, Math.floor((now - capturedTime) / 1000));
  if (diffSec < 60) return `Captured ${diffSec}s ago`;
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) {
    return diffMin > 15 ? `Stale (${diffMin}m ago)` : `Captured ${diffMin}m ago`;
  }
  const diffHours = Math.floor(diffMin / 60);
  return `Stale (${diffHours}h ago)`;
}

export function OperationalMapInternal({
  incidents,
  selectedIncidentId,
  onSelectIncident,
  tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
  attribution = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
}: OperationalMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<LeafletMap | null>(null);
  const layersGroupRef = useRef<LeafletLayerGroup | null>(null);
  const [tileErrorOccurred, setTileErrorOccurred] = useState(false);

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current) return;

    try {
      // Clean up previous map if exists
      if (mapInstanceRef.current) {
        mapInstanceRef.current.remove();
        mapInstanceRef.current = null;
      }

      const map = L.map(mapContainerRef.current, {
        center: [17.001, 81.78],
        zoom: 14,
        attributionControl: true,
      });

      const tileLayer = L.tileLayer(tileUrl, {
        attribution,
        maxZoom: 19,
      });

      tileLayer.on('tileerror', () => {
        setTileErrorOccurred(true);
      });

      tileLayer.addTo(map);

      const layersGroup = L.layerGroup().addTo(map);
      layersGroupRef.current = layersGroup;
      mapInstanceRef.current = map;

      return () => {
        layersGroup.clearLayers();
        map.remove();
        mapInstanceRef.current = null;
        layersGroupRef.current = null;
      };
    } catch (err) {
      console.warn(
        'Leaflet map initialization warning (falling back to DOM table if unrecoverable):',
        err,
      );
    }
  }, [tileUrl, attribution]);

  // Update Markers and Zones
  useEffect(() => {
    const map = mapInstanceRef.current;
    const layersGroup = layersGroupRef.current;
    if (!map || !layersGroup) return;

    layersGroup.clearLayers();

    // 1. Render Fictional Demo Zones with dashed borders
    FICTIONAL_DEMO_ZONES.forEach((zone) => {
      const circleZone = L.circle(zone.center, {
        radius: zone.radius,
        color: '#a5a79b',
        weight: 2,
        dashArray: '6, 6',
        fillColor: '#e8d2b5',
        fillOpacity: 0.15,
      });

      circleZone.bindPopup(`
        <div style="font-family: inherit; font-size: 13px;">
          <div style="font-weight: 700; color: #590907;">${zone.name} (${zone.code})</div>
          <div style="margin-top: 4px; font-size: 11px; color: #b45309; font-weight: 600;">
            ⚠️ DEMO ZONE (Fictional)
          </div>
          <div style="font-size: 11px; color: #6b635b; margin-top: 2px;">
            Simulated demonstration area. Not a real-world boundary.
          </div>
        </div>
      `);

      circleZone.addTo(layersGroup);
    });

    // 2. Render Simulated Team Base Stations (Explicitly labeled NOT live GPS)
    SIMULATED_TEAM_STATIONS.forEach((station) => {
      const stationIcon = L.divIcon({
        className: 'simulated-team-marker',
        html: `
          <div style="
            background: #2b3a4a;
            color: #ffffff;
            padding: 3px 6px;
            border-radius: 4px;
            font-size: 10px;
            font-weight: 700;
            white-space: nowrap;
            box-shadow: 0 1px 3px rgba(0,0,0,0.3);
            border: 1px solid #ffffff;
          ">
            🏢 ${station.name}
          </div>
        `,
        iconSize: [110, 24],
        iconAnchor: [55, 12],
      });

      const stationMarker = L.marker(station.position, { icon: stationIcon });
      stationMarker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px;">
          <div style="font-weight: 700; color: #2b3a4a;">${station.name}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 2px;">
            Capability: ${station.capability}
          </div>
          <div style="font-size: 11px; color: #b45309; margin-top: 4px; font-weight: 600;">
            ℹ️ Simulated Base Station (NOT Live GPS)
          </div>
        </div>
      `);
      stationMarker.addTo(layersGroup);
    });

    // 3. Render Incident Markers
    incidents.forEach((incident) => {
      const lat = incident.latitude ?? (incident.zoneId ? 17.002 : null);
      const lng = incident.longitude ?? (incident.zoneId ? 81.778 : null);

      if (lat === null || lng === null) return;

      const isGps = incident.locationSource === 'GPS';
      const isSelected = incident.id === selectedIncidentId;
      const staleness = calculateLocationStaleness(incident.locationCapturedAt);

      // Distinct styling: Green/Blue for GPS, Warm Amber/Orange for Manual
      const markerColor = isGps ? '#059669' : '#d97706';
      const markerBorder = isSelected ? '#590907' : '#ffffff';
      const pulseAnimation = isSelected ? 'box-shadow: 0 0 0 4px #590907;' : '';

      const markerHtml = `
        <div style="
          background-color: ${markerColor};
          color: #ffffff;
          width: ${isSelected ? '28px' : '22px'};
          height: ${isSelected ? '28px' : '22px'};
          border-radius: 50%;
          border: 2px solid ${markerBorder};
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
          ${pulseAnimation}
        ">
          ${isGps ? '📍' : '📌'}
        </div>
      `;

      const customIcon = L.divIcon({
        className: 'incident-marker-icon',
        html: markerHtml,
        iconSize: [isSelected ? 28 : 22, isSelected ? 28 : 22],
        iconAnchor: [isSelected ? 14 : 11, isSelected ? 14 : 11],
      });

      const marker = L.marker([lat, lng], { icon: customIcon });

      marker.on('click', () => {
        onSelectIncident(incident.id);
      });

      const accuracyBadge =
        isGps && incident.locationAccuracyM
          ? `<span style="background: #e6f4ea; color: #137333; padding: 2px 5px; border-radius: 3px; font-weight: 700; font-size: 10px;">
               GPS Accuracy: ±${Math.round(incident.locationAccuracyM)}m
             </span>`
          : `<span style="background: #fef3c7; color: #92400e; padding: 2px 5px; border-radius: 3px; font-weight: 600; font-size: 10px;">
               Manual / Landmark Selection (${incident.locationSource})
             </span>`;

      marker.bindPopup(`
        <div style="font-family: inherit; font-size: 12px; min-width: 180px;">
          <div style="font-weight: 700; color: #590907; margin-bottom: 2px;">
            ${incident.category} (${incident.priority})
          </div>
          <div style="margin-bottom: 4px;">
            ${accuracyBadge}
          </div>
          <div style="font-size: 11px; color: #4b5563; margin-bottom: 4px;">
            ${incident.landmark ? `<strong>Landmark:</strong> ${incident.landmark}` : incident.summary.slice(0, 60)}
          </div>
          <div style="font-size: 10px; color: #6b7280; margin-bottom: 6px;">
            🕒 ${staleness}
          </div>
          <button
            type="button"
            onclick="window.__selectIncident && window.__selectIncident('${incident.id}')"
            style="
              background: #590907;
              color: #fdf8f2;
              border: none;
              padding: 4px 8px;
              border-radius: 4px;
              cursor: pointer;
              font-size: 11px;
              font-weight: 600;
              width: 100%;
            "
          >
            Inspect in Review Panel
          </button>
        </div>
      `);

      marker.addTo(layersGroup);

      // If GPS, also render accuracy circle
      if (isGps && incident.locationAccuracyM && incident.locationAccuracyM > 0) {
        const accuracyCircle = L.circle([lat, lng], {
          radius: incident.locationAccuracyM,
          color: '#059669',
          weight: 1,
          fillColor: '#10b981',
          fillOpacity: 0.12,
        });
        accuracyCircle.addTo(layersGroup);
      }
    });

    // Provide global callback for popup inspect button
    (window as unknown as { __selectIncident?: (id: string) => void }).__selectIncident =
      onSelectIncident;

    return () => {
      delete (window as unknown as { __selectIncident?: (id: string) => void }).__selectIncident;
    };
  }, [incidents, selectedIncidentId, onSelectIncident]);

  return (
    <div
      className="operational-map-wrapper"
      style={{ position: 'relative', width: '100%', height: '100%', minHeight: '380px' }}
    >
      {tileErrorOccurred && (
        <div
          role="status"
          className="map-tile-warning"
          style={{
            position: 'absolute',
            top: '10px',
            left: '10px',
            right: '10px',
            zIndex: 1000,
            background: '#fffbeb',
            border: '1px solid #fde68a',
            color: '#92400e',
            padding: '8px 12px',
            borderRadius: '6px',
            fontSize: '12px',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
          }}
        >
          ⚠️ <strong>Map tiles unavailable or offline.</strong> Incident triage, assignment, and
          response workflows remain fully active.
        </div>
      )}

      <div
        ref={mapContainerRef}
        className="leaflet-map-container"
        data-testid="operational-map-container"
        style={{
          width: '100%',
          height: '100%',
          minHeight: '380px',
          borderRadius: '8px',
          background: '#f5ede2',
        }}
      />
    </div>
  );
}

export function OperationalMap(props: OperationalMapProps) {
  return (
    <MapErrorBoundary incidents={props.incidents} onSelectIncident={props.onSelectIncident}>
      <OperationalMapInternal {...props} />
    </MapErrorBoundary>
  );
}
