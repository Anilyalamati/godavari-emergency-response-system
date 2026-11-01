declare module 'leaflet' {
  export interface LatLngLiteral {
    lat: number;
    lng: number;
  }

  export type LatLngTuple = [number, number];
  export type LatLngExpression = LatLngLiteral | LatLngTuple;

  export interface MapOptions {
    center?: LatLngExpression;
    zoom?: number;
    minZoom?: number;
    maxZoom?: number;
    attributionControl?: boolean;
    zoomControl?: boolean;
  }

  export interface TileLayerOptions {
    attribution?: string;
    maxZoom?: number;
    minZoom?: number;
    subdomains?: string | string[];
    errorTileUrl?: string;
    [key: string]: unknown;
  }

  export interface IconOptions {
    iconUrl?: string;
    iconRetinaUrl?: string;
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    shadowUrl?: string;
    shadowSize?: [number, number];
    shadowAnchor?: [number, number];
    className?: string;
  }

  export interface DivIconOptions {
    html?: string | HTMLElement | false;
    bgPos?: [number, number];
    iconSize?: [number, number];
    iconAnchor?: [number, number];
    popupAnchor?: [number, number];
    className?: string;
  }

  export interface CircleMarkerOptions {
    radius?: number;
    color?: string;
    weight?: number;
    opacity?: number;
    fillColor?: string;
    fillOpacity?: number;
    dashArray?: string;
  }

  export type PolygonOptions = CircleMarkerOptions;

  export interface Layer {
    addTo(map: Map | LayerGroup): this;
    remove(): this;
  }

  export interface LayerGroup extends Layer {
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    clearLayers(): this;
  }

  export interface Marker extends Layer {
    getLatLng(): LatLngLiteral;
    setLatLng(latlng: LatLngExpression): this;
    bindPopup(content: string | HTMLElement): this;
    openPopup(): this;
    closePopup(): this;
    on(event: string, fn: (...args: unknown[]) => void): this;
  }

  export interface Circle extends Layer {
    getLatLng(): LatLngLiteral;
    getRadius(): number;
    setLatLng(latlng: LatLngExpression): this;
    setRadius(radius: number): this;
    bindPopup(content: string | HTMLElement): this;
  }

  export interface Polygon extends Layer {
    bindPopup(content: string | HTMLElement): this;
    setStyle(style: PolygonOptions): this;
  }

  export interface TileLayer extends Layer {
    on(event: string, fn: (...args: unknown[]) => void): this;
  }

  export interface Map {
    setView(center: LatLngExpression, zoom?: number): this;
    getZoom(): number;
    getCenter(): LatLngLiteral;
    fitBounds(bounds: [LatLngExpression, LatLngExpression] | LatLngExpression[]): this;
    addLayer(layer: Layer): this;
    removeLayer(layer: Layer): this;
    remove(): this;
    on(event: string, fn: (...args: unknown[]) => void): this;
  }

  export class Icon {
    constructor(options: IconOptions);
  }

  export class DivIcon {
    constructor(options: DivIconOptions);
  }

  export function map(element: string | HTMLElement, options?: MapOptions): Map;
  export function tileLayer(urlTemplate: string, options?: TileLayerOptions): TileLayer;
  export function marker(
    latlng: LatLngExpression,
    options?: { icon?: Icon | DivIcon; title?: string },
  ): Marker;
  export function circle(latlng: LatLngExpression, options?: CircleMarkerOptions): Circle;
  export function polygon(
    latlngs: LatLngExpression[] | LatLngExpression[][],
    options?: PolygonOptions,
  ): Polygon;
  export function layerGroup(layers?: Layer[]): LayerGroup;
  export function divIcon(options?: DivIconOptions): DivIcon;
  export function icon(options?: IconOptions): Icon;

  const L: {
    map: typeof map;
    tileLayer: typeof tileLayer;
    marker: typeof marker;
    circle: typeof circle;
    polygon: typeof polygon;
    layerGroup: typeof layerGroup;
    divIcon: typeof divIcon;
    icon: typeof icon;
  };

  export default L;
}
