import { describe, expect, it } from 'vitest'
import {
  getComplaintMarkerColor,
  latLngToPixel,
  pixelDistance,
  filterComplaints,
  clusterComplaints,
  calculateMapBounds,
  buildHeatmapPoints,
} from './mapClustering'

describe('mapClustering utils', () => {
  describe('getComplaintMarkerColor', () => {
    it('returns green for resolved complaints regardless of priority', () => {
      expect(getComplaintMarkerColor({ status: 'Resolved', priority: 'Critical' })).toBe('green')
      expect(getComplaintMarkerColor({ status: 'resolved', priority: 'High' })).toBe('green')
    })

    it('returns red for High and Critical priorities', () => {
      expect(getComplaintMarkerColor({ status: 'Pending', priority: 'Critical' })).toBe('red')
      expect(getComplaintMarkerColor({ status: 'In Progress', priority: 'High' })).toBe('red')
      expect(getComplaintMarkerColor({ status: 'Pending', priority: 'critical' })).toBe('red')
      expect(getComplaintMarkerColor({ status: 'Pending', priority: 'high' })).toBe('red')
    })

    it('returns amber for Medium priority', () => {
      expect(getComplaintMarkerColor({ status: 'Pending', priority: 'Medium' })).toBe('amber')
      expect(getComplaintMarkerColor({ status: 'In Progress', priority: 'medium' })).toBe('amber')
    })

    it('returns blue for Low priority', () => {
      expect(getComplaintMarkerColor({ status: 'Pending', priority: 'Low' })).toBe('blue')
      expect(getComplaintMarkerColor({ status: 'In Progress', priority: 'low' })).toBe('blue')
    })

    it('falls back to SLA breach or category duration when priority is missing', () => {
      // 24h category (Electricity / Streetlight Issues) defaults to red
      expect(getComplaintMarkerColor({ status: 'Pending', category: 'Streetlight Issues' })).toBe('red')
      // 48h category defaults to amber
      expect(getComplaintMarkerColor({ status: 'Pending', category: 'Garbage & Sanitation' })).toBe('amber')
      // 168h category defaults to blue
      expect(getComplaintMarkerColor({ status: 'Pending', category: 'Roads' })).toBe('blue')
      // Null / undefined complaint defaults to blue
      expect(getComplaintMarkerColor(null)).toBe('blue')
    })
  })

  describe('latLngToPixel and pixelDistance', () => {
    it('projects lat/lng into numeric pixels deterministically', () => {
      const p1 = latLngToPixel(28.6139, 77.2090, 12)
      expect(p1.x).toBeGreaterThan(0)
      expect(p1.y).toBeGreaterThan(0)
      expect(Number.isFinite(p1.x)).toBe(true)
      expect(Number.isFinite(p1.y)).toBe(true)
    })

    it('computes distance between two pixel coordinates', () => {
      const dist = pixelDistance({ x: 10, y: 20 }, { x: 10, y: 50 })
      expect(dist).toBe(30)
    })
  })

  describe('filterComplaints', () => {
    const list = [
      { id: '1', complaintId: 'CMP-2026-0001', title: 'Streetlight out', category: 'Streetlight Issues', status: 'Pending', address: 'MG Road' },
      { id: '2', complaintId: 'CMP-2026-0002', title: 'Deep Pothole', category: 'Potholes & Road Damage', status: 'In Progress', address: 'Ring Road' },
      { id: '3', complaintId: 'CMP-2026-0003', title: 'Water Pipe Burst', category: 'Water Leakage', status: 'Resolved', address: 'Station Road' },
    ]

    it('returns all complaints when filter is "All"', () => {
      expect(filterComplaints(list, { category: 'All', status: 'All' })).toHaveLength(3)
    })

    it('filters by category', () => {
      const res = filterComplaints(list, { category: 'Streetlight Issues' })
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('1')
    })

    it('filters by status', () => {
      const res = filterComplaints(list, { status: 'Resolved' })
      expect(res).toHaveLength(1)
      expect(res[0].id).toBe('3')
    })

    it('filters by both category and status', () => {
      const res = filterComplaints(list, { category: 'Streetlight Issues', status: 'Pending' })
      expect(res).toHaveLength(1)
      const empty = filterComplaints(list, { category: 'Streetlight Issues', status: 'Resolved' })
      expect(empty).toHaveLength(0)
    })

    it('filters by search term (id, title, or address)', () => {
      expect(filterComplaints(list, { search: 'CMP-2026-0002' })).toHaveLength(1)
      expect(filterComplaints(list, { search: 'Burst' })).toHaveLength(1)
      expect(filterComplaints(list, { search: 'Station' })).toHaveLength(1)
      expect(filterComplaints(list, { search: 'Nonexistent' })).toHaveLength(0)
    })

    it('handles empty or invalid inputs gracefully', () => {
      expect(filterComplaints(null)).toEqual([])
      expect(filterComplaints(undefined)).toEqual([])
      expect(filterComplaints([])).toEqual([])
    })
  })

  describe('clusterComplaints', () => {
    it('returns empty array when no complaints or no valid coordinates', () => {
      expect(clusterComplaints([])).toEqual([])
      expect(clusterComplaints([{ id: '1', latitude: null, longitude: null }])).toEqual([])
      expect(clusterComplaints([{ id: '1', latitude: 'invalid', longitude: 77.2 }])).toEqual([])
      expect(clusterComplaints(null)).toEqual([])
    })

    it('groups nearby complaints into a cluster', () => {
      // Two points virtually identical / within a few metres in New Delhi
      const items = [
        { id: '1', title: 'Point 1', latitude: 28.613900, longitude: 77.209000, priority: 'High', status: 'Pending' },
        { id: '2', title: 'Point 2', latitude: 28.613910, longitude: 77.209010, priority: 'Medium', status: 'Pending' },
      ]
      // At zoom 12, they will project to within 1-2 pixels
      const clusters = clusterComplaints(items, 12, 50)
      expect(clusters).toHaveLength(1)
      expect(clusters[0].isCluster).toBe(true)
      expect(clusters[0].count).toBe(2)
      expect(clusters[0].complaints).toHaveLength(2)
      // Since one item is High, cluster color should be red
      expect(clusters[0].color).toBe('red')
    })

    it('keeps distant complaints in separate clusters/markers', () => {
      // Delhi vs Bangalore
      const items = [
        { id: '1', title: 'Delhi', latitude: 28.6139, longitude: 77.2090, priority: 'Low' },
        { id: '2', title: 'Bangalore', latitude: 12.9716, longitude: 77.5946, priority: 'Critical' },
      ]
      const clusters = clusterComplaints(items, 10, 50)
      expect(clusters).toHaveLength(2)
      expect(clusters[0].isCluster).toBe(false)
      expect(clusters[0].count).toBe(1)
      expect(clusters[1].isCluster).toBe(false)
      expect(clusters[1].count).toBe(1)
    })

    it('clusters complaints with exact identical coordinates to prevent hiding', () => {
      const items = [
        { id: '1', title: 'First Issue', latitude: 28.6139, longitude: 77.2090 },
        { id: '2', title: 'Second Issue', latitude: 28.6139, longitude: 77.2090 },
        { id: '3', title: 'Third Issue', latitude: 28.6139, longitude: 77.2090 },
      ]
      const clusters = clusterComplaints(items, 18, 50)
      expect(clusters).toHaveLength(1)
      expect(clusters[0].isCluster).toBe(true)
      expect(clusters[0].count).toBe(3)
    })
  })

  describe('calculateMapBounds', () => {
    it('calculates bounding box covering all points', () => {
      const points = [
        { latitude: 28.6, longitude: 77.1 },
        { latitude: 28.8, longitude: 77.3 },
      ]
      const bounds = calculateMapBounds(points)
      expect(bounds).toEqual([
        [28.6, 77.1],
        [28.8, 77.3],
      ])
    })

    it('returns null for empty or invalid points', () => {
      expect(calculateMapBounds([])).toBeNull()
      expect(calculateMapBounds(null)).toBeNull()
      expect(calculateMapBounds([{ latitude: null, longitude: null }])).toBeNull()
    })
  })
})

describe('buildHeatmapPoints', () => {
  it('creates weighted Leaflet tuples for valid complaint coordinates', () => {
    expect(buildHeatmapPoints([
      { id: '1', latitude: 28.6139, longitude: 77.209 },
      { id: '2', coordinates: { lat: 12.9716, lng: 77.5946 } },
    ])).toEqual([
      [28.6139, 77.209, 1],
      [12.9716, 77.5946, 1],
    ])
  })

  it('ignores invalid entries and handles non-array input', () => {
    expect(buildHeatmapPoints([null, {}, { latitude: 100, longitude: 20 }])).toEqual([])
    expect(buildHeatmapPoints(undefined)).toEqual([])
  })
})
