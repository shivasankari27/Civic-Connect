import { useState, useMemo, useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import L from 'leaflet'
import { MapContainer, TileLayer, Marker, Popup, useMap, useMapEvents } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'
import { Filter, Layers, MapPin, Tag, AlertCircle, RefreshCw, Eye } from 'lucide-react'
import { getDisplayId } from '@/firebase/complaintId'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { parseCoordinates } from '@/utils/geo'
import {
  MARKER_COLORS,
  filterComplaints,
  clusterComplaints,
  buildHeatmapPoints,
} from '@/utils/mapClustering'

// leaflet.heat expects Leaflet to be available on the browser global.
if (typeof window !== 'undefined') {
  window.L = L
}

// Ensure Leaflet default icons resolve correctly if used as fallback
delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
})

const statusVariant = {
  Resolved: 'success',
  'In Progress': 'warning',
  Pending: 'destructive',
  Rejected: 'secondary',
  Reopened: 'warning',
}

const DEFAULT_CATEGORIES = [
  'Potholes & Road Damage',
  'Streetlight Issues',
  'Water Leakage',
  'Garbage & Sanitation',
  'Noise Pollution',
  'Illegal Construction',
  'Traffic Issues',
  'Other',
]

const DEFAULT_STATUSES = ['Pending', 'In Progress', 'Resolved', 'Rejected', 'Reopened']

/**
 * Creates custom SVG pin icons for color-coded complaint markers.
 * Colors:
 * - Red: High/Critical priority
 * - Amber: Medium priority
 * - Blue: Low priority
 * - Green: Resolved complaints
 */
export function createPinIcon(color = 'blue') {
  const hex = MARKER_COLORS[color]?.hex || MARKER_COLORS.blue.hex
  const html = `
    <div class="civic-pin-wrapper" style="width: 32px; height: 42px; display: flex; align-items: center; justify-content: center; cursor: pointer;">
      <svg width="32" height="42" viewBox="0 0 32 42" fill="none" xmlns="http://www.w3.org/2000/svg" style="filter: drop-shadow(0 2px 4px rgba(0,0,0,0.35)); transition: transform 0.15s ease;">
        <path d="M16 0C7.163 0 0 7.163 0 16C0 27.2 16 42 16 42C16 42 32 27.2 32 16C32 7.163 24.837 0 16 0Z" fill="${hex}"/>
        <circle cx="16" cy="15" r="7" fill="#ffffff"/>
        <circle cx="16" cy="15" r="4.2" fill="${hex}"/>
      </svg>
    </div>
  `
  return L.divIcon({
    className: 'civic-marker-pin',
    html,
    iconSize: [32, 42],
    iconAnchor: [16, 42],
    popupAnchor: [0, -38],
  })
}

/**
 * Creates custom cluster icons showing complaint count and dominant priority color.
 */
export function createClusterIcon(count, color = 'blue') {
  const hex = MARKER_COLORS[color]?.hex || MARKER_COLORS.blue.hex
  const size = count < 10 ? 38 : count < 100 ? 46 : 54
  const html = `
    <div style="width: ${size}px; height: ${size}px; background-color: ${hex}; box-shadow: 0 4px 10px rgba(0,0,0,0.25);"
         class="rounded-full flex items-center justify-center text-white font-bold text-xs sm:text-sm border-2 border-white ring-2 ring-black/10 transition-transform hover:scale-110">
      <span>${count}</span>
    </div>
  `
  return L.divIcon({
    className: 'civic-cluster-pin',
    html,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  })
}

/**
 * Internal controller to fit map bounds to current markers and track zoom changes.
 */
function MapController({ points, onZoomChange }) {
  const map = useMap()
  const prevPointsRef = useRef(null)

  useMapEvents({
    zoomend: () => {
      if (onZoomChange) {
        onZoomChange(map.getZoom())
      }
    },
  })

  useEffect(() => {
    if (!map || !points || points.length === 0) return

    const key = points
      .map((p) => `${p.lat.toFixed(4)},${p.lng.toFixed(4)}`)
      .sort()
      .join(';')

    if (prevPointsRef.current === key) return
    prevPointsRef.current = key

    if (points.length === 1) {
      map.setView([points[0].lat, points[0].lng], Math.max(map.getZoom(), 14), {
        animate: true,
      })
      return
    }

    const bounds = L.latLngBounds(points.map((p) => [p.lat, p.lng]))
    if (bounds.isValid()) {
      map.fitBounds(bounds, {
        padding: [45, 45],
        maxZoom: 16,
        animate: true,
      })
    }
  }, [map, points])

  return null
}

/**
 * Adds/removes the Leaflet heat layer as the toggle and filtered points change.
 * Each complaint contributes one unit of weight; overlapping points build density.
 */
function ComplaintHeatmapLayer({ points, enabled }) {
  const map = useMap()
  const [pluginReady, setPluginReady] = useState(false)

  // Load the plugin only after exposing the Leaflet instance globally.
  useEffect(() => {
    let cancelled = false

    if (typeof window !== 'undefined') {
      window.L = L
    }

    import('leaflet.heat')
      .then(() => {
        if (!cancelled) {
          setPluginReady(true)
        }
      })
      .catch((error) => {
        console.error('Failed to load Leaflet heat plugin:', error)
      })

    return () => {
      cancelled = true
    }
  }, [])

  // Add the heat layer only when the plugin is ready and the toggle is enabled.
  useEffect(() => {
    if (
      !pluginReady ||
      !enabled ||
      !Array.isArray(points) ||
      points.length === 0
    ) {
      return undefined
    }

    const heatLayer = L.heatLayer(points, {
      radius: 28,
      blur: 22,
      maxZoom: 17,
      max: 3,
      gradient: {
        0.2: '#2563eb',
        0.4: '#06b6d4',
        0.6: '#84cc16',
        0.8: '#f59e0b',
        1.0: '#dc2626',
      },
    })

    heatLayer.addTo(map)

    return () => {
      if (map.hasLayer(heatLayer)) {
        map.removeLayer(heatLayer)
      }
    }
  }, [map, points, enabled, pluginReady])

  return null
}

/**
 * ComplaintsMap Component
 *
 * Interactive Leaflet GIS Map with marker clustering, color-coded priority pins,
 * dynamic category and status filtering, auto-fitting bounds, and rich popups.
 */
export function ComplaintsMap({
  complaints = [],
  isAdmin = false,
  height = '540px',
  className = '',
  initialCategory = 'All',
  initialStatus = 'All',
}) {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory)
  const [selectedStatus, setSelectedStatus] = useState(initialStatus)
  const [searchTerm, setSearchTerm] = useState('')
  const [currentZoom, setCurrentZoom] = useState(12)
  const [heatmapEnabled, setHeatmapEnabled] = useState(false)

  // Extract all categories dynamically from complaints, merged with defaults
  const availableCategories = useMemo(() => {
    const set = new Set(DEFAULT_CATEGORIES)
    if (Array.isArray(complaints)) {
      for (const c of complaints) {
        if (c?.category) set.add(c.category)
      }
    }
    return ['All', ...Array.from(set)]
  }, [complaints])

  // Count total complaints with and without valid coordinates
  const { totalWithCoords, totalMissingCoords } = useMemo(() => {
    let withCoords = 0
    let missing = 0
    if (Array.isArray(complaints)) {
      for (const c of complaints) {
        if (parseCoordinates(c)) {
          withCoords++
        } else {
          missing++
        }
      }
    }
    return { totalWithCoords: withCoords, totalMissingCoords: missing }
  }, [complaints])

  // Apply filters
  const filteredComplaints = useMemo(() => {
    return filterComplaints(complaints, {
      category: selectedCategory,
      status: selectedStatus,
      search: searchTerm,
    })
  }, [complaints, selectedCategory, selectedStatus, searchTerm])

  // Points with valid coordinates from filtered results
  const validFilteredPoints = useMemo(() => {
    const list = []
    for (const c of filteredComplaints) {
      const coords = parseCoordinates(c)
      if (coords) {
        list.push({ ...c, coords, lat: coords.lat, lng: coords.lng })
      }
    }
    return list
  }, [filteredComplaints])

  // Convert filtered complaints into Leaflet heat points [latitude, longitude, weight].
  const heatmapPoints = useMemo(() => {
    return buildHeatmapPoints(validFilteredPoints)
  }, [validFilteredPoints])

  // Compute marker clusters based on current zoom level
  const clusters = useMemo(() => {
    return clusterComplaints(validFilteredPoints, currentZoom, 50)
  }, [validFilteredPoints, currentZoom])

  // Default map center (Centroid of valid points, or New Delhi as fallback)
  const defaultCenter = useMemo(() => {
    if (validFilteredPoints.length > 0) {
      const avgLat = validFilteredPoints.reduce((s, p) => s + p.lat, 0) / validFilteredPoints.length
      const avgLng = validFilteredPoints.reduce((s, p) => s + p.lng, 0) / validFilteredPoints.length
      return [avgLat, avgLng]
    }
    return [28.6139, 77.209]
  }, [validFilteredPoints])

  const hasActiveFilters = selectedCategory !== 'All' || selectedStatus !== 'All' || searchTerm.trim() !== ''

  const handleResetFilters = () => {
    setSelectedCategory('All')
    setSelectedStatus('All')
    setSearchTerm('')
  }

  const getDetailsUrl = (complaint) => {
    return isAdmin ? `/admin/reports/${complaint.id}` : `/report/${complaint.id}`
  }

  // Gracefully handle SSR / non-browser environments
  if (typeof window === 'undefined') {
    return (
      <div
        className={`w-full rounded-xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900 flex items-center justify-center p-8 text-gray-500 ${className}`}
        style={{ minHeight: height }}
      >
        GIS Map view is loading...
      </div>
    )
  }

  return (
    <div
      className={`flex flex-col rounded-xl border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 shadow-sm overflow-hidden ${className}`}
    >
      {/* Map Header & Filter Toolbar */}
      <div className="p-4 border-b border-gray-200 dark:border-gray-800 bg-gray-50/70 dark:bg-gray-900/50 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-primary-100 dark:bg-primary-950 text-primary-600 dark:text-primary-400">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-gray-100 text-sm sm:text-base flex items-center gap-2">
                Interactive GIS Map
                <Badge variant="outline" className="text-xs font-normal">
                  {validFilteredPoints.length} Pinned
                </Badge>
              </h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Visualizing civic complaints with cluster aggregation and status tracking
              </p>
            </div>
          </div>

          {/* Color Legend */}
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-red-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300">High / Critical</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-amber-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300">Medium</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-blue-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300">Low</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-3 h-3 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-gray-600 dark:text-gray-300">Resolved</span>
            </div>
          </div>
        </div>

        {/* Dynamic Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 pt-1">
          {/* Category Filter */}
          <div className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-gray-400 shrink-0" />
            <select
              aria-label="Filter complaints by category"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-700bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 py-1.5 px-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              {availableCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'All' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <div>
            <select
              aria-label="Filter complaints by status"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              className="text-xs rounded-lg border border-gray-300 dark:border-gray-700bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 py-1.5 px-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            >
              <option value="All">All Statuses</option>
              {DEFAULT_STATUSES.map((st) => (
                <option key={st} value={st}>
                  {st}
                </option>
              ))}
            </select>
          </div>

          {/* Quick Search */}
          <div className="flex-1 min-w-[150px] max-w-[240px]">
            <input
              type="text"
              aria-label="Search map complaints"
              placeholder="Search by ID, title..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full text-xs rounded-lg border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 py-1.5 px-2.5 focus:ring-2 focus:ring-primary-500 focus:outline-none"
            />
          </div>

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetFilters}
              className="h-8 text-xs text-gray-500 hover:text-gray-700 dark:text-gray-400 gap-1"
            >
              <RefreshCw className="w-3 h-3" /> Reset
            </Button>
          )}

          <Button
            type="button"
            variant={heatmapEnabled ? 'default' : 'outline'}
            size="sm"
            aria-label="Toggle complaint heatmap"
            aria-pressed={heatmapEnabled}
            onClick={() => setHeatmapEnabled((enabled) => !enabled)}
            className="h-8 text-xs gap-1"
          >
            <Layers className="w-3 h-3" />
            {heatmapEnabled ? 'Hide heatmap' : 'Show heatmap'}
          </Button>

          {totalMissingCoords > 0 && (
            <div className="ml-auto flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 px-2.5 py-1 rounded-md border border-amber-200 dark:border-amber-900/50">
              <AlertCircle className="w-3 h-3 shrink-0" />
              <span>{totalMissingCoords} without GPS</span>
            </div>
          )}
        </div>
      </div>

      {/* Main Map Canvas */}
      <div className="relative w-full overflow-hidden" style={{ height }}>
        {validFilteredPoints.length === 0 ? (
          <div className="absolute inset-0 z-10 flex flex-col items-center justify-center p-6 bg-gray-50/90 dark:bg-gray-900/90 text-center backdrop-blur-xs">
            <div className="p-3 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-400mb-3">
              <MapPin className="w-8 h-8" />
            </div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 text-base mb-1">
              {totalWithCoords === 0
                ? 'No Complaints with Location Coordinates'
                : 'No Complaints Match Selected Filters'}
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mb-4">
              {totalWithCoords === 0
                ? 'None of the submitted complaints have valid GPS coordinates to display on the map.'
                : 'Try adjusting or clearing your category, status, or search filters to view complaints.'}
            </p>
            {hasActiveFilters && (
              <Button size="sm" variant="outline" onClick={handleResetFilters} className="text-xs">
                Clear Filters
              </Button>
            )}
          </div>
        ) : null}

        <MapContainer
          center={defaultCenter}
          zoom={12}
          scrollWheelZoom={true}
          style={{ width: '100%', height: '100%' }}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <MapController points={validFilteredPoints} onZoomChange={setCurrentZoom} />
          <ComplaintHeatmapLayer points={heatmapPoints} enabled={heatmapEnabled} />

          {clusters.map((item) => {
            if (item.isCluster) {
              return (
                <Marker
                  key={item.id}
                  position={[item.lat, item.lng]}
                  icon={createClusterIcon(item.count, item.color)}
                >
                  <Popup className="civic-cluster-popup" minWidth={260} maxWidth={320}>
                    <div className="p-1 space-y-2 text-gray-900">
                      <div className="flex items-center justify-between border-b pb-1.5">
                        <h4 className="font-semibold text-xs sm:text-sm text-gray-900">
                          Cluster ({item.count} complaints)
                        </h4>
                        <Badge variant="secondary" className="text-[10px]">
                          Zoom in to expand
                        </Badge>
                      </div>
                      <div className="max-h-48 overflow-y-auto space-y-2 divide-y divide-gray-100 pr-1">
                        {item.complaints.slice(0, 8).map((c) => (
                          <div key={c.id || getDisplayId(c)} className="pt-1.5 first:pt-0">
                            <div className="flex items-center justify-between text-xs font-mono text-gray-500">
                              <span>{getDisplayId(c)}</span>
                              <Badge
                                variant={statusVariant[c.status] || 'default'}
                                className="text-[9px] py-0 px-1.5 capitalize"
                              >
                                {c.status || 'Pending'}
                              </Badge>
                            </div>
                            <p className="text-xs font-medium text-gray-900 truncate mt-0.5">
                              {c.title || 'Untitled complaint'}
                            </p>
                            <Link
                              to={getDetailsUrl(c)}
                              className="text-[11px] text-primary-600 hover:underline inline-flex items-center gap-1 mt-0.5"
                            >
                              View details &rarr;
                            </Link>
                          </div>
                        ))}
                        {item.complaints.length > 8 && (
                          <p className="text-[11px] text-gray-400 italic text-center pt-1">
                            + {item.complaints.length - 8} more complaints in this area
                          </p>
                        )}
                      </div>
                    </div>
                  </Popup>
                </Marker>
              )
            }

            const complaint = item.complaints[0]
            const photoUrl = complaint.imageUrl || complaint.photos?.[0] || null
            const displayId = getDisplayId(complaint)
            const detailsUrl = getDetailsUrl(complaint)

            return (
              <Marker
                key={complaint.id || displayId}
                position={[item.lat, item.lng]}
                icon={createPinIcon(item.color)}
              >
                <Popup className="civic-complaint-popup" minWidth={240} maxWidth={300}>
                  <div className="p-1 space-y-2 text-gray-900">
                    {photoUrl && (
                      <div className="overflow-hidden rounded-md bg-gray-100 max-h-32">
                        <img
                          src={photoUrl}
                          alt={complaint.title || 'Complaint photo'}
                          className="w-full h-28 object-cover transition-transform hover:scale-105"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none'
                          }}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-xs font-semibold text-gray-500">
                        {displayId}
                      </span>
                      <Badge
                        variant={statusVariant[complaint.status] || 'default'}
                        className="text-[10px] py-0 px-2 capitalize"
                      >
                        {complaint.status || 'Pending'}
                      </Badge>
                    </div>

                    <h4 className="font-semibold text-sm line-clamp-2 leading-tight text-gray-900">
                      {complaint.title || 'Untitled Complaint'}
                    </h4>

                    <div className="text-xs text-gray-500 space-y-0.5">
                      {complaint.category && (
                        <p className="flex items-center gap-1">
                          <Tag className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{complaint.category}</span>
                        </p>
                      )}
                      {complaint.address && (
                        <p className="flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-gray-400 shrink-0" />
                          <span className="truncate">{complaint.address}</span>
                        </p>
                      )}
                    </div>

                    {complaint.priority && (
                      <div className="text-[11px] text-gray-600 flex items-center gap-1">
                        <span className="font-medium">Priority:</span>
                        <span className="capitalize">{complaint.priority}</span>
                      </div>
                    )}

                    <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                      <Link
                        to={detailsUrl}
                        className="text-xs font-medium text-primary-600 hover:text-primary-700 hover:underline flex items-center gap-1"
                      >
                        <Eye className="w-3 h-3" /> View Details &rarr;
                      </Link>
                    </div>
                  </div>
                </Popup>
              </Marker>
            )
          })}
        </MapContainer>
      </div>
    </div>
  )
}

export default ComplaintsMap
