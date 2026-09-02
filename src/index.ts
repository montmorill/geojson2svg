import type { Feature, GeoJSON, Geometry } from 'geojson'
import type { Extent, ObjectAttributes, Options, Origin, ScreenDims } from './types.js'
import { converter } from './converter.js'
import { bbox, deepMerge } from './utils.js'

export type {
  DynamicAttribute,
  Extent,
  ObjectAttributes,
  Options,
  Origin,
  ScreenDims,
  StaticAttribute,
} from './types.js'

type ExtentTuple = [number, number, number, number]

function convertExtent(
  extent: ExtentTuple,
  coordinateConverter: NonNullable<Options['coordinateConverter']>,
): ExtentTuple {
  const leftBottom = coordinateConverter([extent[0], extent[1]])
  const rightTop = coordinateConverter([extent[2], extent[3]])
  return [...leftBottom, ...rightTop]
}

export class GeoJSON2SVG {
  declare mapExtentFromGeojson: boolean | undefined
  declare options: Options
  declare viewportSize: ScreenDims
  declare coordinateConverter: Options['coordinateConverter']
  declare mapExtent: Extent | undefined | null
  declare res: number | null

  constructor(options: Options = {}) {
    if (!options.mapExtent) {
      // throw new
      //   Error('One of the parameter is must: mapExtent or mapExtentFromGeojson');
      this.mapExtentFromGeojson = true
    }
    else {
      this.mapExtentFromGeojson = options.mapExtentFromGeojson
    }
    if (options.fitTo && !/^(?:width|height)$/i.test(options.fitTo)) {
      throw new Error('"fitTo" option should be "width" or "height" ')
    }
    this.options = options
    this.viewportSize = options.viewportSize || { width: 256, height: 256 }
    if (
      options.coordinateConverter
      && typeof options.coordinateConverter !== 'function'
    ) {
      throw new Error('"coordinateConverter" option should be function')
    }
    this.coordinateConverter = options.coordinateConverter
    if (options.mapExtent && this.coordinateConverter) {
      const rightTop = this.coordinateConverter(
        [options.mapExtent.right, options.mapExtent.top],
      )
      const leftBottom = this.coordinateConverter(
        [options.mapExtent.left, options.mapExtent.bottom],
      )
      this.mapExtent = {
        left: leftBottom[0],
        bottom: leftBottom[1],
        right: rightTop[0],
        top: rightTop[1],
      }
    }
    else {
      // yes, it may be undefined in case of mapExtentFromGeojson is true
      this.mapExtent = options.mapExtent
    }
    if (this.mapExtent) {
      this.res = this.calResolution(
        this.mapExtent,
        this.viewportSize,
        this.options.fitTo,
      )
    }
  }

  calResolution(extent: Extent, size: ScreenDims, fitTo?: string): number {
    const xres = (extent.right - extent.left) / size.width
    const yres = (extent.top - extent.bottom) / size.height
    if (fitTo) {
      if (fitTo.toLowerCase() === 'width') {
        return xres
      }
      else if (fitTo.toLowerCase() === 'height') {
        return yres
      }
      else {
        throw new Error('"fitTo" option should be "width" or "height" ')
      }
    }
    else {
      return Math.max(xres, yres)
    }
  }

  convert(geojson: GeoJSON, options?: Options): string[] {
    let resetExtent = false
    if (!this.res && this.mapExtentFromGeojson) {
      resetExtent = true
      let extent = bbox(geojson) // output extent is an array
      if (this.coordinateConverter) {
        extent = convertExtent(extent, this.coordinateConverter)
      }
      this.mapExtent = {
        left: extent[0],
        bottom: extent[1],
        right: extent[2],
        top: extent[3],
      }
      this.res = this.calResolution(
        this.mapExtent,
        this.viewportSize,
        this.options.fitTo,
      )
    }
    const opt = deepMerge({}, this.options, options || {}) as Options
    let svgElements: string[] = []
    if (geojson.type === 'FeatureCollection') {
      for (let i = 0; i < geojson.features.length; i++) {
        svgElements = svgElements.concat(
          this.convertFeature(geojson.features[i], opt),
        )
      }
    }
    else if (geojson.type === 'Feature') {
      svgElements = this.convertFeature(geojson, opt)
    }
    else if (geojson.type === 'GeometryCollection') {
      for (let i = 0; i < geojson.geometries.length; i++) {
        svgElements = svgElements.concat(
          this.convertGeometry(geojson.geometries[i], opt),
        )
      }
    }
    else if (converter[geojson.type]) {
      svgElements = this.convertGeometry(geojson, opt)
    }
    else {
      throw new Error('Geojson type not supported.')
    }
    if (resetExtent) {
      this.res = null
      this.mapExtent = null
    }
    if (opt.callback)
      opt.callback.call(this, svgElements)
    return svgElements
  }

  convertFeature(feature: Feature, options: Options): string[] {
    if (!feature && !(feature as Feature).geometry)
      return undefined as never
    const opt = deepMerge({}, this.options, options || {}) as Options
    if (opt.attributes === true) {
      // pass through all feature properties as attributes
      const props = feature.properties
      const attrs: ObjectAttributes = {}
      if (props) {
        for (const key in props) {
          if (Object.hasOwn(props, key) && props[key] !== undefined)
            attrs[key] = props[key]
        }
      }
      opt.attributes = attrs
    }
    else if (opt.attributes && Array.isArray(opt.attributes)) {
      const arr = opt.attributes
      opt.attributes = arr.reduce<ObjectAttributes>((sum, property) => {
        if (typeof property === 'string') {
          let val
          const key = property.split('.').pop()!
          try {
            val = valueAt(feature, property)
          }
          catch {
            val = undefined
          }
          if (val !== undefined)
            sum[key] = val as string
        }
        else if (typeof property === 'object' && property.type && property.property) {
          if (property.type === 'dynamic') {
            let val
            const key = property.key ? property.key : property.property.split('.').pop()!
            try {
              val = valueAt(feature, property.property)
            }
            catch {
              val = undefined
            }
            if (val !== undefined)
              sum[key] = val as string
          }
          else if (property.type === 'static' && property.value) {
            sum[property.property] = property.value
          }
        }
        return sum
      }, {})
    }
    else {
      opt.attributes = opt.attributes || {}
    }
    const attrs = opt.attributes as ObjectAttributes
    const id = attrs.id
      || feature.id
      || (feature.properties && feature.properties.id
        ? feature.properties.id
        : null)
    if (id)
      attrs.id = id as any
    return this.convertGeometry(feature.geometry, opt)
  }

  convertGeometry(geom: Geometry, options: Options): string[] {
    if (converter[geom.type]) {
      const opt = deepMerge({}, this.options, options || {}) as Options
      const output = opt.output || 'svg'
      const res = this.res!
      const extent = this.mapExtent!
      const origin: Origin = { x: extent.left, y: extent.top }
      if (opt.center) {
        // shift the origin so the converted content is centered within the viewport
        origin.x -= (res * this.viewportSize.width - (extent.right - extent.left)) / 2
        origin.y += (res * this.viewportSize.height - (extent.top - extent.bottom)) / 2
      }
      const paths = converter[geom.type](geom, res, origin, opt)
      const attrs = opt.attributes
        && typeof opt.attributes === 'object'
        && !Array.isArray(opt.attributes)
        ? (opt.attributes as ObjectAttributes)
        : {}
      let svgJsons: ObjectAttributes[]
      let svgEles: string[]
      if (output.toLowerCase() === 'svg') {
        svgJsons = paths.map((path) => {
          return pathToSvgJson(path, geom.type, attrs, opt)
        })
        svgEles = svgJsons.map((json) => {
          return jsonToSvgElement(json, geom.type, opt)
        })
        return svgEles
      }
      else {
        return paths
      }
    }
    else {
      throw new Error('Geojson type not supported.')
    }
  }
}

function pathToSvgJson(
  path: string,
  type: string,
  attributes: ObjectAttributes,
  opt: Options,
): ObjectAttributes {
  let svg: ObjectAttributes = {}
  const pointAsCircle = opt && Object.hasOwn(opt, 'pointAsCircle')
    ? opt.pointAsCircle
    : false
  if ((type === 'Point' || type === 'MultiPoint') && pointAsCircle) {
    svg.cx = path.split(',')[0]
    svg.cy = path.split(',')[1]
    svg.r = String(opt && opt.r ? opt.r : '1')
  }
  else {
    svg = { d: path }
    if (type === 'Polygon' || type === 'MultiPolygon')
      svg['fill-rule'] = 'evenodd'
  }
  for (const key in attributes) {
    // geometry attributes are not overridable through user attributes
    if (key === 'd' || key === 'cx' || key === 'cy' || key === 'r')
      continue
    svg[key] = attributes[key]
  }
  return svg
}

function jsonToSvgElement(json: ObjectAttributes, type: string, opt: Options): string {
  const pointAsCircle = opt && Object.hasOwn(opt, 'pointAsCircle')
    ? opt.pointAsCircle
    : false
  let ele = '<path'
  if ((type === 'Point' || type === 'MultiPoint') && pointAsCircle) {
    ele = '<circle'
  }
  for (const key in json) {
    ele += ` ${key}="${escapeXml(String(json[key]))}"`
  }
  ele += '/>'
  return ele
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}

function valueAt(obj: Record<string, any>, path: string): any {
  // taken from http://stackoverflow.com/a/6394168/713573
  function index(prev: Record<string, any>, cur: string, i: number, arr: string[]): any {
    if (Object.hasOwn(prev, cur)) {
      return prev[cur]
    }
    else {
      throw new Error(`${arr.slice(0, i + 1).join('.')} is not a valid property path`)
    }
  }
  return path.split('.').reduce(index, obj)
}
