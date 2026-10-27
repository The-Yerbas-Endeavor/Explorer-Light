#!/usr/bin/env python3
"""Build the equirectangular basemap from Natural Earth 1:50m GeoJSON.
Usage: python3 scripts/build-world-map.py countries.geojson lakes.geojson
Sources: https://github.com/nvkelso/natural-earth-vector/tree/master/geojson
Natural Earth data is public domain: https://www.naturalearthdata.com/about/terms-of-use/
"""
import json, math, sys, html
from pathlib import Path

def simplify(points, tolerance=.075):
    if len(points) <= 4:
        return points
    a, b = points[0], points[-1]
    dx, dy = b[0]-a[0], b[1]-a[1]
    length = dx*dx+dy*dy
    best, index = 0, 0
    for i, p in enumerate(points[1:-1], 1):
        t = max(0, min(1, ((p[0]-a[0])*dx+(p[1]-a[1])*dy)/length)) if length else 0
        distance = (p[0]-a[0]-t*dx)**2+(p[1]-a[1]-t*dy)**2
        if distance > best:
            best, index = distance, i
    if best > tolerance*tolerance:
        return simplify(points[:index+1], tolerance)[:-1]+simplify(points[index:], tolerance)
    return [a, b]

def project(p):
    return (round((p[0]+180)*10, 1), round((90-p[1])*10, 1))

def geometry_path(geometry):
    polygons = geometry['coordinates'] if geometry['type'] == 'MultiPolygon' else [geometry['coordinates']]
    paths = []
    for polygon in polygons:
        for ring in polygon:
            # Retain at least the original ring if simplification would erase an island.
            points = simplify(ring)
            if len(points) < 4:
                points = ring
            if len(points) < 4:
                continue
            values = [project(p) for p in points]
            paths.append('M'+'L'.join(f'{x:g},{y:g}' for x,y in values)+'Z')
    return ''.join(paths)

countries = json.load(open(sys.argv[1]))['features']
lakes = json.load(open(sys.argv[2]))['features']
parts = ['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 3600 1800" preserveAspectRatio="none" class="network-map-vector" aria-hidden="true">', '<g class="map-land">']
for feature in countries:
    parts.append('<path fill-rule="evenodd" d="'+geometry_path(feature['geometry'])+'"/>')
parts.append('</g><g class="map-lakes">')
for feature in lakes:
    if feature['geometry']['type'] in ['Polygon', 'MultiPolygon']:
        parts.append('<path d="'+geometry_path(feature['geometry'])+'"/>')
parts.append('</g><g class="map-ocean-labels">')
for name, lon, lat in [('NORTH ATLANTIC',-38,26),('SOUTH ATLANTIC',-18,-34),('NORTH PACIFIC',-145,22),('SOUTH PACIFIC',-132,-36),('INDIAN OCEAN',77,-30)]:
    x,y=project([lon,lat]);parts.append(f'<text x="{x:g}" y="{y:g}">{name}</text>')
parts.append('</g><g class="map-country-labels">')
placed=[]
for feature in sorted(countries, key=lambda f:f['properties'].get('LABELRANK',9)):
    p=feature['properties']
    if p.get('LABELRANK',9)>4: continue
    name=p.get('NAME_EN') or p.get('NAME')
    if name == 'Antarctica': continue
    x,y=project([p['LABEL_X'],p['LABEL_Y']])
    if any(abs(x-px)<max(75,len(name)*5) and abs(y-py)<35 for px,py in placed): continue
    placed.append((x,y))
    rank='major' if p['LABELRANK']<=2 else 'minor'
    parts.append(f'<text class="map-label-{rank}" x="{x:g}" y="{y:g}">{html.escape(name)}</text>')
parts.append('</g></svg>')
out=Path(__file__).resolve().parent.parent/'public/world-map.svg'
out.write_text(''.join(parts)+'\n')
print(f'{out.name}: {out.stat().st_size:,} bytes, {len(countries)} countries, {len(placed)} labels')
