import { describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

// Mock Firebase services to prevent auth/invalid-api-key during node tests
vi.mock('@/firebase/services', () => ({ auth: {}, db: {} }))
vi.mock('leaflet.heat', () => ({}))

// Polyfill window for rendering in node test environment
if (typeof window === 'undefined') {
  globalThis.window = {
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }
}

import { ComplaintsMap, createPinIcon, createClusterIcon } from './ComplaintsMap'
import { parseCoordinates } from '@/utils/geo'
import {
  getComplaintMarkerColor,
  buildHeatmapPoints,
  filterComplaints,
  clusterComplaints,
} from '@/utils/mapClustering'

// Mock Leaflet
vi.mock('leaflet', () => {
  const L = {
    Icon: {
      Default: {
        mergeOptions: vi.fn(),
        prototype: {},
      },
    },
    divIcon: vi.fn((opts) => ({ ...opts, _isDivIcon: true })),
    heatLayer: vi.fn((points, options) => ({
      addTo: vi.fn(),
      setLatLngs: vi.fn(),
      points,
      options,
    })),
    latLngBounds: vi.fn((pts) => ({
      isValid: () => Array.isArray(pts) && pts.length > 0,
    })),
  }
  return { default: L, ...L }
})

// Mock React-Leaflet
vi.mock('react-leaflet', () => ({
  MapContainer: ({ children, center }) => (
    <div data-testid="map-container" data-center={JSON.stringify(center)}>
      {children}
    </div>
  ),
  TileLayer: ({ url, attribution }) => (
    <div data-testid="tile-layer" data-url={url} data-attribution={attribution} />
  ),
  Marker: ({ children, position, icon }) => (
    <div
      data-testid="map-marker"
      data-position={JSON.stringify(position)}
      data-icon-class={icon?.className}
      data-icon-html={icon?.html}
    >
      {children}
    </div>
  ),
  Popup: ({ children, className }) => (
    <div data-testid="map-popup" className={className}>
      {children}
    </div>
  ),
  useMap: () => ({
    setView: vi.fn(),
    fitBounds: vi.fn(),
    getZoom: () => 12,
  }),
  useMapEvents: vi.fn(),
}))

// Mock React Router Link
vi.mock('react-router-dom', () => ({
  Link: ({ to, children, className }) => (
    <a href={to} className={className} data-testid="router-link">
      {children}
    </a>
  ),
}))

describe('ComplaintsMap Component and GIS Utilities', () => {
  const sampleComplaints = [
    {
      id: 'c1',
      complaintId: 'CMP-2026-0001',
      title: 'Major water main leakage on Main St',
      category: 'Water Leakage',
      status: 'Pending',
      priority: 'High',
      latitude: 28.6139,
      longitude: 77.209,
      address: 'Main St, Block A',
      imageUrl: 'https://example.com/photo1.jpg',
    },
    {
      id: 'c2',
      complaintId: 'CMP-2026-0002',
      title: 'Streetlight flicker near park',
      category: 'Streetlight Issues',
      status: 'In Progress',
      priority: 'Medium',
      latitude: 28.6145,
      longitude: 77.2095,
      address: 'Park Avenue',
    },
    {
      id: 'c3',
      complaintId: 'CMP-2026-0003',
      title: 'Resolved pothole',
      category: 'Potholes & Road Damage',
      status: 'Resolved',
      priority: 'Low',
      latitude: 28.62,
      longitude: 77.22,
      address: 'Ring Road',
    },
    {
      id: 'c4',
      complaintId: 'CMP-2026-0004',
      title: 'Issue with missing GPS',
      category: 'Other',
      status: 'Pending',
      latitude: null,
      longitude: null,
      address: 'Unknown location',
    },
  ]

  describe('1. Marker Coordinate Calculations', () => {
    it('correctly parses and validates various coordinate formats', () => {
      expect(parseCoordinates({ latitude: 28.6139, longitude: 77.209 })).toEqual({
        lat: 28.6139,
        lng: 77.209,
      })
      expect(parseCoordinates({ lat: 12.9716, lng: 77.5946 })).toEqual({
        lat: 12.9716,
        lng: 77.5946,
      })
      expect(parseCoordinates({ latitude: '28.6139', longitude: '77.2090' })).toEqual({
        lat: 28.6139,
        lng: 77.209,
      })
    })

    it('rejects missing, null, or out-of-range coordinates gracefully', () => {
      expect(parseCoordinates(null)).toBeNull()
      expect(parseCoordinates({})).toBeNull()
      expect(parseCoordinates({ latitude: null, longitude: 77.209 })).toBeNull()
      expect(parseCoordinates({ latitude: 'bad', longitude: 77.209 })).toBeNull()
      expect(parseCoordinates({ latitude: 120, longitude: 77.209 })).toBeNull() // Lat > 90
      expect(parseCoordinates({ latitude: 28, longitude: 200 })).toBeNull() // Lng > 180
    })
  })

  describe('2. Empty State Handling', () => {
    it('renders empty state when complaint list is completely empty', () => {
      const html = renderToStaticMarkup(<ComplaintsMap complaints={[]} />)
      expect(html).toContain('No Complaints with Location Coordinates')
      expect(html).toContain('None of the submitted complaints have valid GPS coordinates')
    })

    it('renders empty state when all complaints lack valid coordinates', () => {
      const noCoords = [
        { id: '1', title: 'A', latitude: null, longitude: null },
        { id: '2', title: 'B', latitude: 'none', longitude: 'none' },
      ]
      const html = renderToStaticMarkup(<ComplaintsMap complaints={noCoords} />)
      expect(html).toContain('No Complaints with Location Coordinates')
      expect(html).toContain('2 without GPS')
    })

    it('shows informative notice when some complaints are missing GPS', () => {
      const html = renderToStaticMarkup(<ComplaintsMap complaints={sampleComplaints} />)
      expect(html).toContain('1 without GPS')
      expect(html).toContain('3 Pinned')
    })
  })

  describe('3. Marker Color-Coding', () => {
    it('assigns red for High and Critical priorities', () => {
      expect(getComplaintMarkerColor({ priority: 'Critical', status: 'Pending' })).toBe('red')
      expect(getComplaintMarkerColor({ priority: 'High', status: 'Pending' })).toBe('red')
    })

    it('assigns amber for Medium priority', () => {
      expect(getComplaintMarkerColor({ priority: 'Medium', status: 'Pending' })).toBe('amber')
    })

    it('assigns blue for Low priority', () => {
      expect(getComplaintMarkerColor({ priority: 'Low', status: 'Pending' })).toBe('blue')
    })

    it('assigns green for Resolved status regardless of original priority', () => {
      expect(getComplaintMarkerColor({ priority: 'Critical', status: 'Resolved' })).toBe('green')
      expect(getComplaintMarkerColor({ priority: 'High', status: 'resolved' })).toBe('green')
    })

    it('creates SVG pin icons with appropriate fill colors', () => {
      const redPin = createPinIcon('red')
      expect(redPin.html).toContain('#ef4444')
      const greenPin = createPinIcon('green')
      expect(greenPin.html).toContain('#10b981')
      const amberPin = createPinIcon('amber')
      expect(amberPin.html).toContain('#f59e0b')
      const bluePin = createPinIcon('blue')
      expect(bluePin.html).toContain('#3b82f6')
    })
  })

  describe('4. Marker Clustering', () => {
    it('creates cluster icon displaying the number of clustered complaints', () => {
      const clusterIcon = createClusterIcon(5, 'red')
      expect(clusterIcon.html).toContain('5')
      expect(clusterIcon.html).toContain('#ef4444')
    })

    it('clusters complaints that are physically close to prevent overlap', () => {
      const nearbyComplaints = [
        { id: '1', latitude: 28.613901, longitude: 77.209001, priority: 'High' },
        { id: '2', latitude: 28.613902, longitude: 77.209002, priority: 'Low' },
      ]
      const clusters = clusterComplaints(nearbyComplaints, 12, 50)
      expect(clusters).toHaveLength(1)
      expect(clusters[0].isCluster).toBe(true)
      expect(clusters[0].count).toBe(2)
      // Dominant color reflects highest priority (red)
      expect(clusters[0].color).toBe('red')
    })

    it('keeps geographically separated complaints as individual pins', () => {
      const farComplaints = [
        { id: '1', latitude: 28.6139, longitude: 77.2090 }, // Delhi
        { id: '2', latitude: 19.0760, longitude: 72.8777 }, // Mumbai
      ]
      const clusters = clusterComplaints(farComplaints, 12, 50)
      expect(clusters).toHaveLength(2)
      expect(clusters[0].isCluster).toBe(false)
      expect(clusters[1].isCluster).toBe(false)
    })
  })

  describe('5. Interactive Popups and Content Display', () => {
    it('renders popups with display ID, title, status badge, and details link', () => {
      const html = renderToStaticMarkup(
        <ComplaintsMap complaints={[sampleComplaints[0]]} isAdmin={false} />
      )
      // Display ID
      expect(html).toContain('CMP-2026-0001')
      // Title
      expect(html).toContain('Major water main leakage on Main St')
      // Status
      expect(html).toContain('Pending')
      // Address
      expect(html).toContain('Main St, Block A')
      // Thumbnail image
      expect(html).toContain('https://example.com/photo1.jpg')
      // Citizen details link
      expect(html).toContain('href="/report/c1"')
    })

    it('renders admin details link when isAdmin is true', () => {
      const html = renderToStaticMarkup(
        <ComplaintsMap complaints={[sampleComplaints[0]]} isAdmin={true} />
      )
      expect(html).toContain('href="/admin/reports/c1"')
    })
  })

  describe('6. Dynamic Category & Status Filters', () => {
    it('filters complaints by category', () => {
      const waterOnly = filterComplaints(sampleComplaints, { category: 'Water Leakage' })
      expect(waterOnly).toHaveLength(1)
      expect(waterOnly[0].id).toBe('c1')
    })

    it('filters complaints by status', () => {
      const resolvedOnly = filterComplaints(sampleComplaints, { status: 'Resolved' })
      expect(resolvedOnly).toHaveLength(1)
      expect(resolvedOnly[0].id).toBe('c3')
    })

    it('renders filtered map when initialCategory or initialStatus is supplied', () => {
      const html = renderToStaticMarkup(
        <ComplaintsMap complaints={sampleComplaints} initialCategory="Water Leakage" />
      )
      expect(html).toContain('CMP-2026-0001')
      expect(html).not.toContain('CMP-2026-0002')
    })
  })

  describe('7. Complaint Heatmap Toggle', () => {
    it('renders the heatmap toggle disabled by default', () => {
      const html = renderToStaticMarkup(<ComplaintsMap complaints={sampleComplaints} />)
      expect(html).toContain('Toggle complaint heatmap')
      expect(html).toContain('aria-pressed="false"')
      expect(html).toContain('Show heatmap')
    })

    it('prepares heatmap points only for complaints with valid coordinates', () => {
      expect(buildHeatmapPoints(sampleComplaints)).toEqual([
        [28.6139, 77.209, 1],
        [28.6145, 77.2095, 1],
        [28.62, 77.22, 1],
      ])
    })

    it('returns no heatmap points for empty, invalid, or missing inputs', () => {
      expect(buildHeatmapPoints([])).toEqual([])
      expect(buildHeatmapPoints(null)).toEqual([])
      expect(buildHeatmapPoints([{ latitude: null, longitude: null }, null])).toEqual([])
    })
  })

  describe('8. Error Handling & Edge Cases', () => {
    it('handles undefined or null complaints prop without throwing', () => {
      expect(() => renderToStaticMarkup(<ComplaintsMap complaints={null} />)).not.toThrow()
      expect(() => renderToStaticMarkup(<ComplaintsMap complaints={undefined} />)).not.toThrow()
    })

    it('handles malformed complaint objects without crashing', () => {
      const malformed = [
        null,
        undefined,
        {},
        { id: 'broken', latitude: 'not-a-number' },
        { id: 'valid', latitude: 28.6, longitude: 77.2, title: null, status: null },
      ]
      expect(() => renderToStaticMarkup(<ComplaintsMap complaints={malformed} />)).not.toThrow()
    })
  })
})
