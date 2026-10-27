# Network basemap

`public/world-map.svg` is an equirectangular vector basemap generated from Natural Earth 1:50m country and lake data. It uses the same longitude/latitude projection as the node pins. Country borders, coastlines, lakes, ocean labels and country labels are rendered locally; country labels appear as the camera zooms in.

Sources:
- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_admin_0_countries.geojson
- https://github.com/nvkelso/natural-earth-vector/blob/master/geojson/ne_50m_lakes.geojson
- License: public domain, https://www.naturalearthdata.com/about/terms-of-use/

Rebuild after downloading both source GeoJSON files:

```sh
python3 scripts/build-world-map.py countries.geojson lakes.geojson
```

Geometry is simplified at 0.075 degrees to keep the browser payload small. Borders follow Natural Earth's default de facto representation. Node locations remain approximate IP geolocation; geographical detail does not imply more accurate node coordinates.
