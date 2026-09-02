import chai from 'chai'
import merge from 'deepmerge'
import { JSDOM } from 'jsdom'
import parsePath from 'parse-svg-path'
import proj4 from 'proj4'
import { GeoJSON2SVG } from '../dist/index.js'
import testData from './testdata.js'

const { expect, assert } = chai
const basics = ['Point', 'LineString', 'Polygon', 'MultiPoint', 'MultiLineString', 'MultiPolygon']

describe('geojson2svg', () => {
  const precision = testData.precision
  describe('Test geojson2svg class and instance', () => {
    it('GeoJSON2SVG is function', () => {
      // eslint-disable-next-line no-unused-expressions
      expect(typeof GeoJSON2SVG === 'function').to.be.true
    })
    const converter = new GeoJSON2SVG(testData.options)
    it('converter is an instance of GeoJSON2SVG', () => {
      assert.instanceOf(converter, GeoJSON2SVG)
    })
    it('converter has method convert', () => {
      assert.isFunction(converter.convert)
    })
    it('converter has method convertFeature', () => {
      assert.isFunction(converter.convertFeature)
    })
    it('converter has method convertGeometry', () => {
      assert.isFunction(converter.convertGeometry)
    })
  })

  describe('Test all geojson types for \'convert\' function', () => {
    const converter = new GeoJSON2SVG(testData.options)
    testData.geojsons.forEach((data) => {
      it(`${data.type} {output: "path",explode: false,r:2}`, () => {
        let options = { output: 'path' }
        options = merge(options, testData.options)
        const actualPaths = converter.convert(data.geojson, options)
        assertPath(actualPaths, data.path, data.geojson.type, precision)
      })
      it(`${data.type} {output: "svg",explode: false,r:2}`, () => {
        const actualSVGs = converter.convert(data.geojson, testData.options)
        assertSVG(actualSVGs, data.svg, data.geojson.type, precision)
      })
    })
  })

  describe('Test all options of \'convert\' function', () => {
    const converter = new GeoJSON2SVG(testData.options)
    it('Point while output svg as Circle', () => {
      const converter = new GeoJSON2SVG(testData.options)
      const actualSVGs = converter.convert(
        { type: 'Point', coordinates: [50, 50] },
        { pointAsCircle: true },
      )
      expect(actualSVGs).to.be.an('array')
      expect(actualSVGs.length).to.be.equal(1)
      const actSVGEle = string2dom(actualSVGs)
      expect(actSVGEle.nodeName).to.be.equal('CIRCLE')
      expect(actSVGEle.hasAttribute('cx'))
      expect(Number.parseFloat(actSVGEle.getAttribute('cx')))
        .to
        .be
        .closeTo(127.77777777777777, precision)
      expect(actSVGEle.hasAttribute('cy'))
      expect(Number.parseFloat(actSVGEle.getAttribute('cy')))
        .to
        .be
        .closeTo(22.22222222222222, precision)
      expect(actSVGEle.hasAttribute('r'))
      expect(actSVGEle.getAttribute('r'))
        .to
        .be
        .equal('2')
    })
    it('Output svg coordinates precision', () => {
      const geojson = { type: 'LineString', coordinates: [[10, 10], [15, 20], [30, 10]] }
      const expSVGs = ['<path d="M105.556,44.444 108.333,38.889 116.667,44.444"/>']
      const converter = new GeoJSON2SVG(testData.options)
      const actualSVGs = converter.convert(geojson, { precision: 3 })
      expect(actualSVGs).to.be.an('array')
      expect(actualSVGs.length).to.be.equal(1)
      expect(actualSVGs).to.be.deep.equal(expSVGs)
    })
    it('Output svg coordinates precision with negative value', () => {
      const geojson = { type: 'LineString', coordinates: [[10, 10], [15, 20], [30, 10]] }
      const converter = new GeoJSON2SVG(testData.options)
      // precision -1 rounds to tens: x 105.55..,108.33..,116.66.. -> 110,110,120
      // y 44.44..,38.88..,44.44.. -> 40,40,40
      const actualPaths = converter.convert(geojson, { output: 'path', precision: -1 })
      expect(actualPaths).to.be.deep.equal(['M110,40 110,40 120,40'])
      // precision -2 rounds to hundreds: x -> 100,100,100, y -> 0,0,0
      const actualPaths2 = converter.convert(geojson, { output: 'path', precision: -2 })
      expect(actualPaths2).to.be.deep.equal(['M100,0 100,0 100,0'])
    })
    it('Feature {output: "path",explode: false}', () => {
      const actualPaths = converter.convert(testData.feature.geojson, { output: 'path', explode: false })
      assertPath(actualPaths, testData.feature.path, testData.feature.geojson.type, precision)
    })
    it('Feature {output: "svg",explode: false}', () => {
      const actualSVGs = converter.convert(testData.feature.geojson, {
        output: 'svg',
        explode: false,
        attributes: { id: 'id1', style: 'stroke: #000066; fill: 3333ff;' },
      })
      assertSVG(actualSVGs, testData.feature.svg, testData.feature.geojson.geometry.type, precision)
    })
    it('Feature {output: "path",explode: true}', () => {
      if (basics.includes(testData.feature.geojson.type)) {
        const actualPaths = converter.convert(testData.feature.geojson, { output: 'path', explode: true })
        assertPath(actualPaths, testData.feature.path_explode, testData.feature.geojson.type, precision)
      }
    })
    it('Feature {output: "svg",explode: true}', () => {
      if (basics.includes(testData.feature.geojson.type)) {
        const actualSVGs = converter.convert(testData.feature.geojson, {
          output: 'svg',
          explode: true,
          attributes: { id: 'id1', style: 'stroke: #000066; fill: 3333ff;' },
        })
        assertSVG(actualSVGs, testData.feature.svg, testData.feature.geojson.geometry.type, precision)
      }
    })
    it('FeatureCollection {output: "path",explode: false}', () => {
      const actualPaths = converter.convert(testData.featureCollection.geojson, { output: 'path', explode: false })
      expect(actualPaths).to.be.an('array')
      const expPaths = testData.featureCollection.path
      expect(actualPaths.length).to.be.equal(expPaths.length)
      for (let i = 0; i < expPaths.length; i++) {
        assertPath([actualPaths[i]], [expPaths[i]], testData.featureCollection.geojson.features[i].geometry.type, precision)
      }
    })
    it('Polygon fit to width', () => {
      const converter2 = new GeoJSON2SVG(
        {
          viewportSize: { width: 300, height: 100 },
          mapExtent: { left: -180, bottom: -90, right: 180, top: 90 },
          fitTo: 'width',
          output: 'svg',
          explode: false,
        },
      )
      const actualData = converter2.convert(
        testData['Polygon fit to width'].geojson,
      )
      assertSVG(
        actualData,
        testData['Polygon fit to width'].svg,
        testData['Polygon fit to width'].geojson.type,
        precision,
      )
    })
    it('center: content centered within viewport', () => {
      const converter = new GeoJSON2SVG({
        viewportSize: { width: 200, height: 100 },
        mapExtent: { left: 0, bottom: 0, right: 100, top: 100 },
        center: true,
      })
      const actualPaths = converter.convert(
        { type: 'LineString', coordinates: [[0, 0], [100, 100]] },
        { output: 'path' },
      )
      // extent 100x100 in viewport 200x100 -> content box 100x100 centered
      // horizontally: x from 50 to 150, y from 0 to 100
      expect(actualPaths).to.be.deep.equal(['M50,100 150,0'])
    })
    it('center with fitTo: the axis that does not fill the viewport is centered', () => {
      const converter = new GeoJSON2SVG({
        viewportSize: { width: 400, height: 100 },
        mapExtent: { left: 0, bottom: 0, right: 100, top: 100 },
        fitTo: 'height',
      })
      const actualPaths = converter.convert(
        { type: 'LineString', coordinates: [[0, 0], [100, 100]] },
        { output: 'path', center: true },
      )
      // fitTo height -> res = yres = 1, content 100x100 in viewport 400x100
      // centered horizontally: x from 150 to 250
      expect(actualPaths).to.be.deep.equal(['M150,100 250,0'])
    })
    it('attributes true: pass through all feature properties', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: true,
      })
      const svgStr = converter.convert({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
          properties: { foo: 'fooVal-1', num: 10, flag: false, nil: null, missing: undefined },
        }, {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[10, 10], [100, 100]] },
          properties: { foo: 'fooVal-2', nested: { a: 1 } },
        }],
      })
      const svgEle1 = string2dom(svgStr[0])
      expect(svgEle1.getAttribute('foo')).to.be.equal('fooVal-1')
      expect(svgEle1.getAttribute('num')).to.be.equal('10')
      expect(svgEle1.getAttribute('flag')).to.be.equal('false')
      expect(svgEle1.getAttribute('nil')).to.be.equal('null')
      expect(svgEle1.hasAttribute('missing')).to.equal(false)
      const svgEle2 = string2dom(svgStr[1])
      expect(svgEle2.getAttribute('foo')).to.be.equal('fooVal-2')
      expect(svgEle2.hasAttribute('num')).to.equal(false)
      expect(svgEle2.getAttribute('nested')).to.be.equal('[object Object]')
    })
    it('attributes do not override geometry attributes', () => {
      const converter = new GeoJSON2SVG(testData.options)
      const svgStr = converter.convert(
        { type: 'LineString', coordinates: [[10, 10], [15, 20], [30, 10]] },
        { attributes: { d: 'overridden', class: 'foo' } },
      )
      const ele = string2dom(svgStr)
      expect(ele.getAttribute('d')).to.be.equal('M105.55555555555556,44.44444444444444 108.33333333333333,38.888888888888886 116.66666666666666,44.44444444444444')
      expect(ele.getAttribute('class')).to.be.equal('foo')
    })
    it('svg attribute values are XML escaped', () => {
      const converter = new GeoJSON2SVG(testData.options)
      const svgStr = converter.convert(
        { type: 'LineString', coordinates: [[10, 10], [15, 20], [30, 10]] },
        { attributes: { title: 'a"b&c<d>' } },
      )
      const ele = string2dom(svgStr)
      expect(ele.getAttribute('title')).to.be.equal('a"b&c<d>')
    })
    it('polygon output has fill-rule evenodd', () => {
      const converter = new GeoJSON2SVG(testData.options)
      const svgStr = converter.convert(
        { type: 'Polygon', coordinates: [[[30, 10], [40, 40], [20, 40], [10, 20], [30, 10]]] },
      )
      const ele = string2dom(svgStr)
      expect(ele.getAttribute('fill-rule')).to.be.equal('evenodd')
    })
    it('array attributes are ignored for plain geometry', () => {
      const converter = new GeoJSON2SVG(testData.options)
      const svgStr = converter.convert(
        { type: 'LineString', coordinates: [[10, 10], [15, 20], [30, 10]] },
        { attributes: ['properties.foo'] },
      )
      const ele = string2dom(svgStr)
      expect(ele.hasAttribute('0')).to.equal(false)
      expect(ele.attributes.length).to.be.equal(1)
    })

    it('Add attributes to svg based on each feature properties:', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: ['properties.foo', 'properties.bar', 'properties.baz'],
      })
      const svgStr = converter.convert({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
          properties: { foo: 'fooVal-1', bar: 'barVal-1', baz: 'bazVal-1' },
        }, {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[10, 10], [100, 100]] },
          properties: { foo: 'fooVal-2', bar: 'barVal-2' },
        }],
      })

      const svgEle1 = string2dom(svgStr[0])
      expect(svgEle1).to.respondTo('getAttribute')
      expect(svgEle1.getAttribute('foo')).to.be.equal('fooVal-1')
      expect(svgEle1.getAttribute('bar')).to.be.equal('barVal-1')
      expect(svgEle1.getAttribute('baz')).to.be.equal('bazVal-1')

      const svgEle2 = string2dom(svgStr[1])
      expect(svgEle2).to.respondTo('getAttribute')
      expect(svgEle2.getAttribute('foo')).to.be.equal('fooVal-2')
      expect(svgEle2.getAttribute('bar')).to.be.equal('barVal-2')
      // eslint-disable-next-line no-unused-expressions
      expect(svgEle2.getAttribute('baz')).to.be.null
    })

    it('Add attributes to svg based on each feature properties and static attributes also:', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: [
          {
            property: 'properties.foo',
            type: 'dynamic',
            key: 'id',
          },
          {
            property: 'properties.baz',
            type: 'dynamic',
          },
          {
            property: 'bar',
            value: 'barStatic',
            type: 'static',
          },
          {
            property: 'properties.baz',
            type: 'dynamic',
          },
          {
            property: 'properties.qux',
            type: 'dynamic',
          },
        ],
      })
      const svgStr = converter.convert({
        type: 'FeatureCollection',
        features: [{
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
          properties: { foo: 'fooVal-1', bar: 'barVal-1', baz: 'bazVal-1', qux: 0 },
        }, {
          type: 'Feature',
          geometry: { type: 'LineString', coordinates: [[10, 10], [100, 100]] },
          properties: { foo: 'fooVal-2', bar: 'barVal-2', baz: false, qux: null },
        }],
      })
      const svgEle1 = string2dom(svgStr[0])
      expect(svgEle1).to.respondTo('getAttribute')
      expect(svgEle1.getAttribute('id')).to.be.equal('fooVal-1')
      expect(svgEle1.getAttribute('bar')).to.be.equal('barStatic')
      expect(svgEle1.getAttribute('baz')).to.be.equal('bazVal-1')
      expect(svgEle1.getAttribute('qux')).to.be.equal('0')
      // eslint-disable-next-line no-unused-expressions
      expect(svgEle1.getAttribute('foo')).to.be.null

      const svgEle2 = string2dom(svgStr[1])
      expect(svgEle2).to.respondTo('getAttribute')
      expect(svgEle2.getAttribute('id')).to.be.equal('fooVal-2')
      expect(svgEle2.getAttribute('bar')).to.be.equal('barStatic')
      expect(svgEle2.getAttribute('baz')).to.be.equal('false')
      expect(svgEle2.getAttribute('qux')).to.be.equal('null')
      // eslint-disable-next-line no-unused-expressions
      expect(svgEle2.getAttribute('foo')).to.be.null
    })

    it('Add given attributes in options to all svg elements: '
      + 'pass attributes in constructor', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: { class: 'foo' },
      })
      const output = converter.convert(
        { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
      )
      const outputEle = string2dom(output)
      expect(outputEle).to.respondTo('getAttribute')
      expect(outputEle.getAttribute('class')).to.be.equal('foo')
    })
    it('Add given attributes in options to all svg elements: '
      + 'pass attributes in .convert', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: { class: 'foo', id: 'foo-1' },
      })
      const output = converter.convert(
        { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
        { attributes: { class: 'foo', id: 'foo-1' } },
      )
      const outputEle = string2dom(output)
      expect(outputEle).to.respondTo('getAttribute')
      expect(outputEle.getAttribute('class')).to.be.equal('foo')
      expect(outputEle.getAttribute('id')).to.be.equal('foo-1')
    })
    it('Add id to svg: as feature.id', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: { class: 'foo' },
      })
      const output = converter.convert({
        type: 'Feature',
        id: 'foo-1',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
      })
      const outputEle = string2dom(output)
      expect(outputEle).to.respondTo('getAttribute')
      expect(outputEle.getAttribute('class')).to.be.equal('foo')
      expect(outputEle.getAttribute('id')).to.be.equal('foo-1')
    })
    it('Add id to svg: as feature.properties.id', () => {
      const converter = new GeoJSON2SVG({
        mapExtent: testData.mercatorExtent,
        attributes: { class: 'foo' },
      })
      const output = converter.convert({
        type: 'Feature',
        geometry: { type: 'LineString', coordinates: [[0, 0], [1000, 1000]] },
        properties: { id: 'foo-1', name: 'bar' },
      })
      const outputEle = string2dom(output)
      expect(outputEle).to.respondTo('getAttribute')
      expect(outputEle.getAttribute('class')).to.be.equal('foo')
      expect(outputEle.getAttribute('id')).to.be.equal('foo-1')
    })

    it('Extent from geojson', () => {
      const converter = new GeoJSON2SVG({
        mapExtentFromGeojson: true,
      })
      const actualData = converter.convert(
        testData['Extent from geojson'].geojson,
      )
      assertSVG(
        actualData,
        testData['Extent from geojson'].svg,
        testData['Extent from geojson'].geojson.type,
        precision,
      )
    })

    it('coordinateConverter options', () => {
      const forward = proj4('WGS84', 'EPSG:3857').forward
      const converter = new GeoJSON2SVG({
        mapExtentFromGeojson: true,
        viewportSize: { width: 800, height: 60 },
        fitTo: 'width',
        coordinateConverter: forward,
      })
      const actualData = converter.convert(
        testData['coordinateConverter option'].geojson,
      )
      assertSVG(
        actualData,
        testData['coordinateConverter option'].svg,
        testData['coordinateConverter option'].geojson.type,
        precision,
      )
    })
  })
})

function assertSVG(actualSVGs, expSVGs, type, precision) {
  expect(actualSVGs).to.be.an('array')
  expect(actualSVGs.length).to.be.equal(expSVGs.length)
  // for(var i=0;i<expSVGs.length; i++) {
  const expSVGEle = string2dom(expSVGs)
  const actSVGEle = string2dom(actualSVGs)
  expect(actSVGEle.nodeName).to.be.equal('PATH')
  // eslint-disable-next-line no-unused-expressions
  expect(actSVGEle.hasAttribute('d')).to.be.true
  const expPaths = expSVGEle.getAttribute('d')
  const actPaths = actSVGEle.getAttribute('d')
  assertPath([actPaths], [expPaths], type, precision)
  // }
}

function assertPath(actualPaths, expPaths, type, precision) {
  expect(actualPaths).to.be.an('array')
  expect(actualPaths.length).to.be.equal(expPaths.length)
  let actPathObj
  let expPathObj
  let checkCoord = true
  for (let i = 0; i < actualPaths.length; i++) {
    actPathObj = parsePath(actualPaths[i])
    expPathObj = parsePath(expPaths[i])
    expect(actPathObj).to.be.an('array')
    expect(actPathObj.length).to.be.equal(expPathObj.length)
    // check each path moves
    for (let j = 0; j < expPathObj.length; j++) {
      expect(actPathObj[j].length).to.equal(expPathObj[j].length)
      // compare move command
      expect(actPathObj[j][0]).to.equal(expPathObj[j][0])
      // do not check for polygon's last close command
      checkCoord = !(j === expPathObj.length - 1 && (type === 'Polygon'
        || type === 'MultiPolygon'))
      if (checkCoord) {
        for (let k = 1; k < expPathObj[j].length; k++) {
          expect(actPathObj[j][k]).to.be.closeTo(expPathObj[j][k], precision)
        }
        /* //compare x coordinate
        expect(actPathObj[j][1]).to.be.closeTo(expPathObj[j][1],precision);
        //compare y coordinate
        expect(actPathObj[j][2]).to.be.closeTo(expPathObj[j][2],precision); */
      }
    }
  }
}

function string2dom(str) {
  return (new JSDOM(str)).window.document.body.firstChild
}
