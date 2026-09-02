import type {
  GeoJSON,
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from 'geojson'

// --- deepMerge ---
// Port of the 'extend' package's `extend(true, {}, ...)` deep merge.
// Semantics preserved:
// - recurses into plain objects and arrays (arrays merged element-wise)
// - source keys whose value is `undefined` are skipped
// - target object is mutated in place

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || Object.prototype.toString.call(value) !== '[object Object]')
    return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function deepMerge<T extends object>(
  target: T,
  ...sources: Array<object | null | undefined>
): T {
  for (const source of sources) {
    if (source == null)
      continue
    for (const key of Object.keys(source)) {
      const copy = (source as Record<string, any>)[key]
      const src = (target as Record<string, any>)[key]
      // Prevent never-ending loop
      if (copy === target)
        continue
      if (copy === undefined)
        continue
      if (
        copy !== null
        && typeof copy === 'object'
        && (isPlainObject(copy) || Array.isArray(copy))
      ) {
        const clone = Array.isArray(copy)
          ? (Array.isArray(src) ? src : [])
          : (isPlainObject(src) ? src : {})
        // Never move original objects, clone them
        ;(target as Record<string, any>)[key] = deepMerge(clone, copy)
      }
      else {
        ;(target as Record<string, any>)[key] = copy
      }
    }
  }
  return target
}

// --- bbox ---
// Port of the 'geojson-bbox' package.

function getCoordinatesDump(gj: GeoJSON): Position[] {
  let coords: Position[]
  if (gj.type === 'Point') {
    coords = [gj.coordinates]
  }
  else if (gj.type === 'LineString' || gj.type === 'MultiPoint') {
    coords = gj.coordinates
  }
  else if (gj.type === 'Polygon' || gj.type === 'MultiLineString') {
    coords = gj.coordinates.reduce<Position[]>((dump, part) => {
      return dump.concat(part)
    }, [])
  }
  else if (gj.type === 'MultiPolygon') {
    coords = gj.coordinates.reduce<Position[]>((dump, poly) => {
      return dump.concat(poly.reduce<Position[]>((points, part) => {
        return points.concat(part)
      }, []))
    }, [])
  }
  else if (gj.type === 'Feature') {
    coords = getCoordinatesDump(gj.geometry)
  }
  else if (gj.type === 'GeometryCollection') {
    coords = gj.geometries.reduce<Position[]>((dump, g) => {
      return dump.concat(getCoordinatesDump(g))
    }, [])
  }
  else if (gj.type === 'FeatureCollection') {
    coords = gj.features.reduce<Position[]>((dump, f) => {
      return dump.concat(getCoordinatesDump(f))
    }, [])
  }
  else {
    throw new Error('Geojson type not supported.')
  }
  return coords
}

export function bbox(gj: GeoJSON): [number, number, number, number] {
  if (!Object.hasOwn(gj, 'type'))
    throw new Error('Geojson type not supported.')
  const coords = getCoordinatesDump(gj)
  const initial: [number, number, number, number] = [
    Number.POSITIVE_INFINITY,
    Number.POSITIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
    Number.NEGATIVE_INFINITY,
  ]
  return coords.reduce<[number, number, number, number]>((prev, coord) => {
    return [
      Math.min(coord[0], prev[0]),
      Math.min(coord[1], prev[1]),
      Math.max(coord[0], prev[2]),
      Math.max(coord[1], prev[3]),
    ] as [number, number, number, number]
  }, initial)
}

// --- explode ---
// Port of the 'multigeojson' package's explode function.

export function explode(geom: MultiPoint): Point[]
export function explode(geom: MultiLineString): LineString[]
export function explode(geom: MultiPolygon): Polygon[]
export function explode(geom: GeoJSON): false
export function explode(geom: GeoJSON): Point[] | LineString[] | Polygon[] | false {
  const multies = ['MultiPoint', 'MultiLineString', 'MultiPolygon']
  if (multies.includes(geom.type)) {
    const multi = geom as MultiPoint | MultiLineString | MultiPolygon
    return multi.coordinates.map((part) => {
      const single: Record<string, any> = {}
      single.type = multi.type.replace('Multi', '')
      single.coordinates = part
      if ((multi as any).crs)
        single.crs = (multi as any).crs
      return single as Point
    })
  }
  else {
    return false
  }
}
