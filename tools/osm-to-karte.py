#!/usr/bin/env python3
"""Wandelt einen Overpass-Export (JSON mit `out geom`) von Schwarzach in die
kompakte Spielkarte public/schwarzach/karte.js um.

Aufruf:  python3 tools/osm-to-karte.py export.json [relationen.json ...] public/schwarzach/karte.js
(mehrere Overpass-Exporte werden zusammengeführt, z. B. Wege + Multipolygone)

Koordinaten werden in Meter um den Dorfplatz projiziert und mit SCALE
(Pixel pro Meter) in Spielpixel umgerechnet. Daten: (c) OpenStreetMap-Mitwirkende, ODbL.
"""
import json, math, sys

LAT0, LON0 = 47.44746, 9.76400  # Dorfplatz (Gemeindeamt, Am Dorfplatz 2)
SCALE = 3.0  # Pixel pro Meter
KX = math.cos(math.radians(LAT0)) * 111320.0
KY = 110540.0
# Spielbereich (Meter um den Dorfplatz)
XMIN, XMAX, YMIN, YMAX = -1700, 1500, -1500, 1500


def proj(lat, lon):
    return ((lon - LON0) * KX * SCALE, -(lat - LAT0) * KY * SCALE)


def inside_m(x, y, pad=0):
    return XMIN * SCALE - pad <= x <= XMAX * SCALE + pad and YMIN * SCALE - pad <= y <= YMAX * SCALE + pad


def simplify(pts, eps):
    """Douglas-Peucker, pts = [(x,y),...]"""
    if len(pts) < 3:
        return pts
    ax, ay = pts[0]; bx, by = pts[-1]
    dx, dy = bx - ax, by - ay
    L = math.hypot(dx, dy) or 1e-9
    imax, dmax = 0, -1
    for i in range(1, len(pts) - 1):
        px, py = pts[i]
        d = abs(dy * px - dx * py + bx * ay - by * ax) / L
        if d > dmax:
            imax, dmax = i, d
    if dmax > eps:
        a = simplify(pts[: imax + 1], eps)
        b = simplify(pts[imax:], eps)
        return a[:-1] + b
    return [pts[0], pts[-1]]


def simplify_ring(pts, eps):
    """Geschlossener Ring: am weitesten entfernten Punkt teilen, dann beide Hälften vereinfachen."""
    if len(pts) < 5:
        return pts
    ax, ay = pts[0]
    k = max(range(len(pts)), key=lambda i: (pts[i][0] - ax) ** 2 + (pts[i][1] - ay) ** 2)
    a = simplify(pts[: k + 1], eps)
    b = simplify(pts[k:], eps)
    return a[:-1] + b


def flat(pts):
    out = []
    for x, y in pts:
        out += [round(x), round(y)]
    return out


ROAD = {  # highway -> (code, breite in Metern)
    'motorway': 1, 'trunk': 1, 'primary': 1, 'secondary': 2, 'tertiary': 3,
    'primary_link': 2, 'secondary_link': 3, 'tertiary_link': 3,
    'residential': 4, 'unclassified': 4, 'living_street': 5, 'service': 6,
    'pedestrian': 7, 'footway': 8, 'path': 8, 'cycleway': 9, 'track': 10, 'steps': 8,
}

# Spielbreite der Straßen in Metern (absichtlich breiter als echt, damit man gut fahren kann)
RW = {1: 17, 2: 15, 3: 14, 4: 12, 5: 10, 6: 8, 7: 10, 8: 3.5, 9: 4, 10: 5}
SIDEWALK = 4.0      # Gehsteig in Metern, frei von Häusern
SHRINK = 0.85       # Häuser etwas kleiner, damit mehr Platz dazwischen ist


def seg_dist(px, py, ax, ay, bx, by):
    dx, dy = bx - ax, by - ay
    l = dx * dx + dy * dy or 1e-9
    t = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / l))
    cx, cy = ax + t * dx, ay + t * dy
    return math.hypot(px - cx, py - cy), cx, cy


def fit_buildings(buildings, roads):
    """Häuser verkleinern bzw. von breiten Spiel-Straßen wegschieben."""
    CELL = 60 * SCALE
    grid = {}
    segs = []
    for code, _, tunnel, f in roads:
        if tunnel:
            continue
        need = (RW[code] / 2 + (SIDEWALK if code <= 7 else 1.0)) * SCALE
        for i in range(0, len(f) - 2, 2):
            ax, ay, bx, by = f[i], f[i + 1], f[i + 2], f[i + 3]
            k = len(segs); segs.append((ax, ay, bx, by, need))
            for gy in range(int(min(ay, by) // CELL) - 1, int(max(ay, by) // CELL) + 2):
                for gx in range(int(min(ax, bx) // CELL) - 1, int(max(ax, bx) // CELL) + 2):
                    grid.setdefault((gx, gy), []).append(k)

    def worst(pts):
        w = None
        for x, y in pts:
            for k in grid.get((int(x // CELL), int(y // CELL)), ()):
                ax, ay, bx, by, need = segs[k]
                d, cx, cy = seg_dist(x, y, ax, ay, bx, by)
                if d < need and (w is None or need - d > w[0]):
                    w = (need - d, x - cx, y - cy, d)
        return w

    out = []
    dropped = 0
    for b in buildings:
        f = b[3]
        pts = [(f[i], f[i + 1]) for i in range(0, len(f), 2)]
        mx = sum(x for x, _ in pts) / len(pts); my = sum(y for _, y in pts) / len(pts)
        sc = SHRINK
        ox = oy = 0.0
        ok = False
        for _ in range(14):
            cur = [(mx + ox + (x - mx) * sc, my + oy + (y - my) * sc) for x, y in pts]
            w = worst(cur)
            if not w:
                ok = True; break
            over, nx, ny, d = w
            moved = math.hypot(ox, oy)
            if d > 0.5 and moved < 8 * SCALE:
                l = math.hypot(nx, ny) or 1
                ox += nx / l * (over + 1); oy += ny / l * (over + 1)
            else:
                sc *= 0.85
            if sc < 0.35:
                break
        if not ok:
            if b[2] < 0 and b[0] not in 'KRS':  # wichtige Gebäude (Kirche, Gemeindeamt, Schule, benannte) immer behalten
                dropped += 1
                continue
            cur = [(mx + ox * 0.5 + (x - mx) * 0.7, my + oy * 0.5 + (y - my) * 0.7) for x, y in pts]
        out.append([b[0], b[1], b[2], flat(cur)])
    return out, dropped


AREA = {  # tag=value -> code
    ('landuse', 'grass'): 'g', ('landuse', 'meadow'): 'm', ('landuse', 'farmland'): 'f',
    ('landuse', 'orchard'): 'o', ('landuse', 'forest'): 'w', ('natural', 'wood'): 'w',
    ('landuse', 'residential'): 'r', ('landuse', 'commercial'): 'c', ('landuse', 'retail'): 'c',
    ('landuse', 'industrial'): 'i', ('landuse', 'cemetery'): 'k', ('amenity', 'grave_yard'): 'k',
    ('landuse', 'construction'): 'b', ('landuse', 'religious'): 'k',
    ('leisure', 'park'): 'p', ('leisure', 'playground'): 'y', ('leisure', 'pitch'): 's',
    ('leisure', 'sports_centre'): 's', ('leisure', 'garden'): 'p', ('leisure', 'swimming_pool'): 'a',
    ('natural', 'water'): 'a', ('landuse', 'basin'): 'a', ('natural', 'scrub'): 'w',
    ('natural', 'grassland'): 'm', ('landuse', 'village_green'): 'g', ('amenity', 'parking'): 'P',
    ('amenity', 'school'): 'S', ('amenity', 'kindergarten'): 'S', ('landuse', 'education'): 'S', ('landuse', 'railway'): 'i',
}


def rings(members):
    """Äußere Teilstücke eines Multipolygons zu geschlossenen Ringen verbinden."""
    parts = [[(g['lat'], g['lon']) for g in m['geometry'] if g] for m in members
             if m.get('type') == 'way' and m.get('role', 'outer') in ('outer', '') and m.get('geometry')]
    out = []
    while parts:
        ring = parts.pop(0)
        changed = True
        while ring[0] != ring[-1] and changed:
            changed = False
            for i, q in enumerate(parts):
                if q[0] == ring[-1]: ring += q[1:]
                elif q[-1] == ring[-1]: ring += q[::-1][1:]
                elif q[-1] == ring[0]: ring = q[:-1] + ring
                elif q[0] == ring[0]: ring = q[::-1][:-1] + ring
                else: continue
                parts.pop(i); changed = True; break
        if len(ring) > 3 and ring[0] == ring[-1]:
            out.append(ring)
    return out


def area_code(t):
    for k in ('leisure', 'amenity', 'natural', 'landuse'):
        if k in t and (k, t[k]) in AREA:
            return AREA[(k, t[k])]
    return None


def bkind(t):
    b = t.get('building', 'yes')
    a = t.get('amenity', '')
    if b in ('church', 'chapel', 'cathedral') or a == 'place_of_worship':
        return 'K'
    if a in ('townhall',) or t.get('office') == 'government':
        return 'R'
    if b in ('school', 'kindergarten') or a in ('school', 'kindergarten'):
        return 'S'
    if b in ('industrial', 'warehouse', 'manufacture'):
        return 'I'
    if b in ('commercial', 'retail', 'supermarket', 'office') or 'shop' in t:
        return 'C'
    if b in ('garage', 'garages', 'shed', 'carport', 'roof', 'hut'):
        return 'G'
    if b in ('farm', 'barn', 'farm_auxiliary', 'stable'):
        return 'F'
    if b in ('apartments',):
        return 'A'
    return 'H'


def main(srcs, dst):
    seen, elements = set(), []
    for src in srcs:
        for el in json.load(open(src, encoding='utf-8')).get('elements', []):
            k = (el['type'], el['id'])
            if k in seen:
                continue
            seen.add(k)
            if el['type'] == 'relation' and el.get('tags', {}).get('type') == 'multipolygon' and 'boundary' not in el['tags']:
                # Multipolygon -> ein Pseudo-Weg pro äußerem Ring
                for j, ring in enumerate(rings(el.get('members', []))):
                    elements.append({'type': 'way', 'id': f"r{el['id']}-{j}", 'tags': el['tags'],
                                     'geometry': [{'lat': a, 'lon': b} for a, b in ring]})
                continue
            elements.append(el)
    data = {'elements': elements}
    names, name_ix = [], {}

    def nid(n):
        if not n:
            return -1
        if n not in name_ix:
            name_ix[n] = len(names); names.append(n)
        return name_ix[n]

    roads, buildings, areas, water, rail, pois, boundary = [], [], [], [], [], [], []
    for el in data.get('elements', []):
        t = el.get('tags', {})
        typ = el['type']
        if typ == 'node':
            if 'lat' not in el or not t.get('name'):
                continue
            x, y = proj(el['lat'], el['lon'])
            if inside_m(x, y):
                pois.append({'n': t['name'], 'x': round(x), 'y': round(y), 'k': t.get('amenity') or t.get('shop') or t.get('tourism') or t.get('historic') or t.get('office') or t.get('craft') or '',
                             'a': (t.get('addr:street', '') + ' ' + t.get('addr:housenumber', '')).strip()})
            continue
        if typ == 'relation':
            if t.get('boundary') == 'administrative' and t.get('name') == 'Schwarzach':
                for m in el.get('members', []):
                    if m.get('role') == 'outer' and 'geometry' in m:
                        boundary.append(flat([proj(g['lat'], g['lon']) for g in m['geometry']]))
            elif t.get('name') and 'center' in el:
                pass
            continue
        geom = el.get('geometry')
        if not geom:
            continue
        pts = [proj(g['lat'], g['lon']) for g in geom if g]
        if not any(inside_m(x, y, 300) for x, y in pts):
            continue
        closed = len(pts) > 3 and pts[0] == pts[-1]
        if 'building' in t:
            if not closed:
                continue
            p = simplify_ring(pts, 0.8)
            if len(p) < 4:
                continue
            lv = t.get('building:levels')
            try:
                lv = max(1, min(12, int(float(lv))))
            except (TypeError, ValueError):
                lv = 0
            buildings.append([bkind(t), lv, nid(t.get('name')), flat(p[:-1])])
            if t.get('name'):
                cx = sum(x for x, _ in p[:-1]) / (len(p) - 1); cy = sum(y for _, y in p[:-1]) / (len(p) - 1)
                pois.append({'n': t['name'], 'x': round(cx), 'y': round(cy), 'k': t.get('amenity') or t.get('shop') or t.get('building'), 'a': (t.get('addr:street', '') + ' ' + t.get('addr:housenumber', '')).strip()})
            continue
        hw = t.get('highway')
        if hw in ROAD:
            if t.get('area') == 'yes' and closed:
                areas.append(['P', flat(simplify_ring(pts, 1.5)[:-1])])
                continue
            name = t.get('name')
            # unwichtige Wege weglassen (Zufahrten, Feldwege, namenlose Fußwege)
            if not name and hw in ('service', 'track', 'path', 'footway', 'cycleway', 'steps'):
                continue
            if t.get('access') in ('private', 'no') and hw in ('service', 'track'):
                continue
            roads.append([ROAD[hw], nid(name), 1 if t.get('tunnel') == 'yes' or t.get('layer', '0').startswith('-') else 0, flat(simplify(pts, 1.0))])
            continue
        if 'railway' in t and t['railway'] in ('rail', 'light_rail'):
            if t.get('tunnel') != 'yes':
                rail.append(flat(simplify(pts, 1.0)))
            continue
        if 'railway' in t and t['railway'] == 'platform' and closed:
            areas.append(['P', flat(simplify_ring(pts, 1.0)[:-1])])
            continue
        if t.get('waterway') in ('river', 'stream', 'canal', 'ditch', 'drain'):
            if t.get('tunnel') in ('culvert', 'yes'):
                continue
            w = {'river': 14, 'canal': 8, 'stream': 5}.get(t['waterway'], 2.5)
            water.append([w, nid(t.get('name')), flat(simplify(pts, 1.5))])
            continue
        c = area_code(t)
        if c and closed:
            p = simplify_ring(pts, 2.0)
            if len(p) >= 4:
                areas.append([c, flat(p[:-1])])
            if t.get('name') and c in 'psykS':
                cx = sum(x for x, _ in p[:-1]) / (len(p) - 1); cy = sum(y for _, y in p[:-1]) / (len(p) - 1)
                pois.append({'n': t['name'], 'x': round(cx), 'y': round(cy), 'k': t.get('leisure') or t.get('amenity') or t.get('landuse'), 'a': ''})

    buildings, dropped = fit_buildings(buildings, roads)
    print(f'{dropped} Häuser passten nicht neben die breiteren Straßen und wurden weggelassen')

    # große Flächen zuerst zeichnen
    def area_size(a):
        f = a[1]; xs = f[0::2]; ys = f[1::2]
        return (max(xs) - min(xs)) * (max(ys) - min(ys))
    areas.sort(key=area_size, reverse=True)
    roads.sort(key=lambda r: -r[0])  # kleine Wege zuerst, Hauptstraßen oben

    out = {
        'src': '(c) OpenStreetMap-Mitwirkende, ODbL',
        'origin': [LAT0, LON0], 'scale': SCALE, 'rw': RW, 'sidewalk': SIDEWALK,
        'bounds': [XMIN * SCALE, YMIN * SCALE, XMAX * SCALE, YMAX * SCALE],
        'names': names, 'roads': roads, 'buildings': buildings, 'areas': areas,
        'water': water, 'rail': rail, 'pois': pois, 'boundary': boundary,
    }
    js = '// Automatisch erzeugt aus OpenStreetMap-Daten (c) OpenStreetMap-Mitwirkende, ODbL.\n' \
         '// Neu erzeugen: python3 tools/osm-to-karte.py <overpass.json> public/schwarzach/karte.js\n' \
         'window.KARTE=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(dst, 'w', encoding='utf-8').write(js)
    print(f'{len(roads)} Straßen, {len(buildings)} Gebäude, {len(areas)} Flächen, {len(water)} Gewässer, {len(rail)} Gleise, {len(pois)} Orte, {len(js)//1024} KB')


if __name__ == '__main__':
    main(sys.argv[1:-1], sys.argv[-1])
