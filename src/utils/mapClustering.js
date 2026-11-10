import { parseCoordinates } from './geo'
import { getSlaDurationHours, isSlaBreached } from './sla'

export const MARKER_COLORS = {
  red: { hex: '#ef4444', label: 'High / Critical', bgClass: 'bg-red-500' },
  amber: { hex: '#f59e0b', label: 'Medium', bgClass: 'bg-amber-500' },
  blue: { hex: '#3b82f6', label: 'Low', bgClass: 'bg-blue-500' },
  green: { hex: '#10b981', label: 'Resolved', bgClass: 'bg-emerald-500' },
}

/**
 * Determines the color for a complaint marker based on requirements:
 * - Red: High/Critical priority
 * - Amber: Medium priority
 * - Blue: Low priority
 * - Green: Resolved complaints
 */
export function getComplaintMarkerColor(complaint) {
  if (!complaint) return 'blue'

  const status = (complaint.status || '').toLowerCase()
  if (status === 'resolved') {
    return 'green'
  }

  const priority = (complaint.priority || '').toLowerCase()
  if (priority === 'critical' || priority === 'high') {
    return 'red'
  }
  if (priority === 'medium') {
    return 'amber'
  }
  if (priority === 'low') {
    return 'blue'
  }

  // Fallback based on SLA breach and category duration
  if (isSlaBreached(complaint)) {
    return 'red'
  }

  const duration = getSlaDurationHours(complaint.category, complaint.department)
  if (duration <= 24) {
    return 'red'
  }
  if (duration <= 48) {
    return 'amber'
  }
  return 'blue'
}

/**
 * Converts lat/lng coordinates to standard Web Mercator pixel coordinates at a given zoom level.
 * Independent of DOM / browser environment.
 */
export function latLngToPixel(lat, lng, zoom) {
  const siny = Math.min(Math.max(Math.sin((lat * Math.PI) / 180), -0.9999), 0.9999)
  const scale = 256 * Math.pow(2, zoom)
  const x = scale * (0.5 + lng / 360)
  const y = scale * (0.5 - Math.log((1 + siny) / (1 - siny)) / (4 * Math.PI))
  return { x, y }
}

/**
 * Calculates pixel distance between two projected points.
 */
export function pixelDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

/**
 * Filters a list of complaints by category, status, and optional search query.
 */
export function filterComplaints(complaints, { category = 'All', status = 'All', search = '' } = {}) {
  if (!Array.isArray(complaints)) return []

  return complaints.filter((c) => {
    if (!c) return false

    if (category && category !== 'All' && c.category !== category) {
      return false
    }

    if (status && status !== 'All' && (c.status || '').toLowerCase() !== status.toLowerCase()) {
      return false
    }

    if (search && search.trim()) {
      const q = search.trim().toLowerCase()
      const id = (c.complaintId || '').toLowerCase()
      const title = (c.title || '').toLowerCase()
      const addr = (c.address || '').toLowerCase()
      if (!id.includes(q) && !title.includes(q) && !addr.includes(q)) {
        return false
      }
    }

    return true
  })
}

/**
 * Clusters complaints with valid coordinates at a given zoom level.
 * Groups complaints whose screen pixel distance is <= radiusPixels.
 */
export function clusterComplaints(items, zoom = 12, radiusPixels = 50) {
  if (!Array.isArray(items) || items.length === 0) return []

  const valid = []
  for (const item of items) {
    if (!item) continue
    const coords = parseCoordinates(item.coordinates || item)
    if (coords) {
      const pixel = latLngToPixel(coords.lat, coords.lng, zoom)
      valid.push({
        complaint: item,
        lat: coords.lat,
        lng: coords.lng,
        x: pixel.x,
        y: pixel.y,
        color: getComplaintMarkerColor(item),
      })
    }
  }

  if (valid.length === 0) return []

  const clusters = []
  const visited = new Set()

  for (let i = 0; i < valid.length; i++) {
    if (visited.has(i)) continue
    visited.add(i)

    const clusterItems = [valid[i]]
    let sumLat = valid[i].lat
    let sumLng = valid[i].lng
    let minLat = valid[i].lat
    let maxLat = valid[i].lat
    let minLng = valid[i].lng
    let maxLng = valid[i].lng

    for (let j = i + 1; j < valid.length; j++) {
      if (visited.has(j)) continue
      const dist = Math.hypot(valid[i].x - valid[j].x, valid[i].y - valid[j].y)
      if (dist <= radiusPixels) {
        visited.add(j)
        clusterItems.push(valid[j])
        sumLat += valid[j].lat
        sumLng += valid[j].lng
        minLat = Math.min(minLat, valid[j].lat)
        maxLat = Math.max(maxLat, valid[j].lat)
        minLng = Math.min(minLng, valid[j].lng)
        maxLng = Math.max(maxLng, valid[j].lng)
      }
    }

    const count = clusterItems.length

    let clusterColor = 'blue'
    if (clusterItems.some((ci) => ci.color === 'red')) {
      clusterColor = 'red'
    } else if (clusterItems.some((ci) => ci.color === 'amber')) {
      clusterColor = 'amber'
    } else if (clusterItems.every((ci) => ci.color === 'green')) {
      clusterColor = 'green'
    }

    clusters.push({
      id: `cluster-${valid[i].complaint.id || i}-${count}`,
      isCluster: count > 1,
      count,
      lat: sumLat / count,
      lng: sumLng / count,
      complaints: clusterItems.map((ci) => ci.complaint),
      bounds: [
        [minLat, minLng],
        [maxLat, maxLng],
      ],
      color: clusterColor,
    })
  }

  return clusters
}

/**
 * Calculates a bounding box [[minLat, minLng], [maxLat, maxLng]] from points.
 */
export function calculateMapBounds(points) {
  if (!Array.isArray(points) || points.length === 0) return null

  let minLat = Infinity
  let maxLat = -Infinity
  let minLng = Infinity
  let maxLng = -Infinity

  let validCount = 0

  for (const p of points) {
    const coords = parseCoordinates(p)
    if (coords) {
      validCount++
      if (coords.lat < minLat) minLat = coords.lat
      if (coords.lat > maxLat) maxLat = coords.lat
      if (coords.lng < minLng) minLng = coords.lng
      if (coords.lng > maxLng) maxLng = coords.lng
    }
  }

  if (validCount === 0) return null
  return [
    [minLat, minLng],
    [maxLat, maxLng],
  ]
}

/**
 * Converts complaints (or map points) into Leaflet heat-layer tuples.
 * Invalid coordinates are ignored; every valid complaint contributes weight 1,
 * allowing overlapping complaints to accumulate into higher-density hotspots.
 */
export function buildHeatmapPoints(items) {
  if (!Array.isArray(items)) return []

  return items.flatMap((item) => {
    if (!item) return []
    const coords = parseCoordinates(item.coordinates || item)
    return coords ? [[coords.lat, coords.lng, 1]] : []
  })
}
