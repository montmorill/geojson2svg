import type {
  LineString,
  MultiLineString,
  MultiPoint,
  MultiPolygon,
  Point,
  Polygon,
  Position,
} from 'geojson'
import type { Options, Origin } from './types.js'
import { explode } from './utils.js'

export type ConverterFn = (geom: any, res: number, origin: Origin, opt: Options) => string[]

function getCoordString(
  coords: Position[],
  res: number,
  origin: Origin,
  precision: number | undefined,
  opt: Options,
): string {
  // origin - svg image origin
  const convertedCoords = coords.map((coord) => {
    if (opt.coordinateConverter) {
      coord = opt.coordinateConverter(coord as [number, number])
    }
    return [(coord[0] - origin.x) / res, (origin.y - coord[1]) / res]
  })
  const coordStr = convertedCoords.map((coord) => {
    return `${formatCoordinate(coord[0], precision)},${formatCoordinate(coord[1], precision)}`
  })
  return coordStr.join(' ')
}

function formatCoordinate(value: number, precision: number | undefined): string {
  if (!precision)
    return String(value)
  if (precision > 0 && Number.isInteger(precision))
    return value.toFixed(precision)
  // round to the nearest 10^-precision:
  // negative integers -> tens/hundreds/..., fractional -> powers like 10^0.5
  const factor = 10 ** -precision
  const rounded = Math.round(value / factor) * factor
  // strip floating point noise introduced by fractional factors
  return String(Number(rounded.toPrecision(12)))
}

function point(geom: Point, res: number, origin: Origin, opt: Options): string[] {
  const r = opt && opt.r ? opt.r : 1
  const pointAsCircle = opt && Object.hasOwn(opt, 'pointAsCircle')
    ? opt.pointAsCircle
    : false
  const coords = getCoordString([geom.coordinates], res, origin, opt.precision, opt)
  if (pointAsCircle) {
    return [coords]
  }
  else {
    return [
      `M${coords} m${-r},0 a${r},${r} 0 1,1 ${2 * r},0 a${r},${r} 0 1,1 ${-2 * r},0`,
    ]
  }
}

function multiPoint(geom: MultiPoint, res: number, origin: Origin, opt: Options): string[] {
  const shouldExplode = opt && Object.hasOwn(opt, 'explode')
    ? opt.explode
    : false
  const paths = explode(geom).map((single) => {
    return point(single, res, origin, opt)[0]
  })
  if (!shouldExplode)
    return [paths.join(' ')]
  return paths
}

function lineString(geom: LineString, res: number, origin: Origin, opt: Options): string[] {
  const coords = getCoordString(geom.coordinates, res, origin, opt.precision, opt)
  const path = `M${coords}`
  return [path]
}

function multiLineString(geom: MultiLineString, res: number, origin: Origin, opt: Options): string[] {
  const shouldExplode = opt && Object.hasOwn(opt, 'explode')
    ? opt.explode
    : false
  const paths = explode(geom).map((single) => {
    return lineString(single, res, origin, opt)[0]
  })
  if (!shouldExplode)
    return [paths.join(' ')]
  return paths
}

function polygon(geom: Polygon, res: number, origin: Origin, opt: Options): string[] {
  let holes: Position[][] | undefined
  const mainStr = getCoordString(geom.coordinates[0], res, origin, opt.precision, opt)
  if (geom.coordinates.length > 1) {
    holes = geom.coordinates.slice(1, geom.coordinates.length)
  }
  let path = `M${mainStr}`
  if (holes) {
    for (let i = 0; i < holes.length; i++) {
      path += ` M${getCoordString(holes[i], res, origin, opt.precision, opt)}`
    }
  }
  path += 'Z'
  return [path]
}

function multiPolygon(geom: MultiPolygon, res: number, origin: Origin, opt: Options): string[] {
  // NOTE: original had opt.hasOwnProperty('explode') WITHOUT the `opt &&` guard — kept for parity
  const shouldExplode = Object.hasOwn(opt, 'explode')
    ? opt.explode
    : false
  const paths = explode(geom).map((single) => {
    return polygon(single, res, origin, opt)[0]
  })
  if (!shouldExplode)
    return [`${paths.join(' ').replace(/Z/g, '')}Z`]
  return paths
}

export const converter: Record<string, ConverterFn> = {
  Point: point,
  MultiPoint: multiPoint,
  LineString: lineString,
  MultiLineString: multiLineString,
  Polygon: polygon,
  MultiPolygon: multiPolygon,
}
