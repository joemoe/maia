#!/usr/bin/env python3
"""Wandelt einen Overpass-Export (JSON mit `out geom`) von Schwarzach in die
kompakte Spielkarte public/schwarzach/karte.js um.

Aufruf:  python3 tools/osm-to-karte.py export.json [relationen.json ...] public/schwarzach/karte.js
(mehrere Overpass-Exporte werden zusammengeführt, z. B. Wege + Multipolygone)

Koordinaten werden in Meter um den Dorfplatz projiziert und mit SCALE
(Pixel pro Meter) in Spielpixel umgerechnet. Daten: (c) OpenStreetMap-Mitwirkende, ODbL.
"""
import json, math, re, sys

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


# Wichtige Orte: key -> Suchangaben. 'name' = Regex auf OSM-Namen, 'adr' = (Straße, Hausnummer),
# 'll' = Notfall-Koordinate. Quelle der Liste: schwarzach.at (Einrichtungen, Gastronomie, Gesundheit).
ORTE = {
    'gemeindeamt': {'adr': ('Am Dorfplatz', '2')},
    'gorani': {'adr': ('Gutenbergstraße', '6')},
    'spar': {'adr': ('Hofsteigstraße', '50')},
    'sutter': {'adr': ('Gutenbergstraße', '4')},
    'mangold': {'name': r'^Bäckerei Mangold$'},
    'kirche': {'name': r'^Hl\. Sebastian$'},
    'schule': {'name': r'^Mittelschule Schwarzach$'},
    'volksschule': {'name': r'^Volksschule Schwarzach$'},
    'buecherei': {'adr': ('Hofsteigstraße', '68'), 'll': (47.4446, 9.7627)},
    'schuelerbetreuung': {'adr': ('Hofsteigstraße', '64a')},
    'bahnhof': {'ll': (47.4461, 9.7542)},
    'bauhof': {'adr': ('Gleisweg', '8')},
    'rieger': {'name': r'^Rieger Orgelbau$'},
    'russmedia': {'adr': ('Gutenbergstraße', '1')},
    'hofsteiger': {'adr': ('Am Dorfplatz', '4')},
    'pub': {'name': r"^S'pub$"},
    'deluxe': {'adr': ('Hofsteigstraße', '63')},
    'gemeindesaal': {'adr': ('Gebhard-Schwärzler-Straße', '15'), 'name': r'^Gemeindesaal$'},
    'kigadorf': {'adr': ('Webergasse', '2')},
    'kigaminderach': {'adr': ('An der Minderach', '6')},
    'senioren': {'adr': ('Weidachstraße', '4')},
    'loacker': {'adr': ('Weidachstraße', '2')},
    'memos': {'adr': ('Hofsteigstraße', '51')},
    'stuba': {'name': r'^Schwarzach Stuba$'},
    'subirerhof': {'name': r'^Subirerhof$'},
    'apotheke': {'adr': ('Hofsteigstraße', '53')},
    'arzt': {'adr': ('Am Dorfplatz', '1')},
    'zahnarzt': {'adr': ('Hofsteigstraße', '62')},
    'tierarzt': {'adr': ('Hofsteigstraße', '52')},
    'krankenpflege': {'adr': ('Hofsteigstraße', '76')},
    'lebenshilfe': {'adr': ('Hofsteigstraße', '112')},
    'feuerwehr': {'name': r'^Ortsfeuerwehr Schwarzach$'},
    'sparkasse': {'name': r'^Dornbirner Sparkasse'},
    'fussballplatz': {'sport': 'soccer'},
}


def hausnr(s):
    m = re.match(r'(\d+)', s)
    return int(m.group(1)) if m else None


def finde_orte(elements):
    adr, named = {}, []
    for el in elements:
        t = el.get('tags', {})
        if el['type'] == 'node' and 'lat' in el:
            x, y = proj(el['lat'], el['lon'])
        elif el.get('geometry') and el['type'] == 'way':
            g = [q for q in el['geometry'] if q]
            x, y = proj(sum(q['lat'] for q in g) / len(g), sum(q['lon'] for q in g) / len(g))
        else:
            continue
        if math.hypot(x, y) > 1700 * SCALE:
            continue
        if t.get('leisure') == 'pitch' and t.get('sport'):
            named.append(('sport:' + t['sport'], x, y))
        if 'addr:street' in t and 'addr:housenumber' in t and math.hypot(x, y) < 1300 * SCALE:
            adr.setdefault(t['addr:street'].lower(), []).append((t['addr:housenumber'].lower(), x, y))
        if t.get('name'):
            named.append((t['name'], x, y))
    out, wie = {}, {}
    for key, spec in ORTE.items():
        pos = None
        if 'adr' in spec:
            st, nr = spec['adr']
            c = [(math.hypot(x, y), x, y) for n, x, y in adr.get(st.lower(), []) if n == nr.lower()]
            if c:
                pos = min(c)[1:]; wie[key] = 'Adresse'
        if not pos and 'name' in spec:
            c = [(math.hypot(x, y), x, y) for n, x, y in named if re.search(spec['name'], n)]
            if c:
                pos = min(c)[1:]; wie[key] = 'Name'
        if not pos and 'sport' in spec:
            c = [(math.hypot(x, y), x, y) for n, x, y in named if n == 'sport:' + spec['sport']]
            if c:
                pos = min(c)[1:]; wie[key] = 'Sportplatz'
        if not pos and 'adr' in spec:  # nächste Hausnummer in derselben Straße
            st, nr = spec['adr']; z = hausnr(nr)
            c = [(abs(hausnr(n) - z), math.hypot(x, y), x, y, n) for n, x, y in adr.get(st.lower(), []) if hausnr(n) is not None and hausnr(n) % 2 == z % 2]
            if c and min(c)[0] <= 6:
                pos = min(c)[2:4]; wie[key] = 'ungefähr (Nachbar Nr. ' + min(c)[4] + ')'
        if not pos and 'll' in spec:
            pos = proj(*spec['ll']); wie[key] = 'Koordinate'
        if pos:
            out[key] = [round(pos[0]), round(pos[1])]
        else:
            wie[key] = 'NICHT GEFUNDEN'
    return out, wie


def zaeune(buildings, roads):
    """Gartenzäune um einen Teil der Wohnhäuser: Rechteck mit Abstand zum Haus, eine Seite hat ein Tor.
    Nur dort, wo der Zaun weder eine Straße noch ein Nachbarhaus berührt."""
    PAD = 4.5 * SCALE
    segs = []
    for code, _, tunnel, f in roads:
        need = (RW[code] / 2 + (SIDEWALK if code <= 7 else 1.0)) * SCALE + 4
        for i in range(0, len(f) - 2, 2):
            segs.append((f[i], f[i + 1], f[i + 2], f[i + 3], need))
    CELL = 80 * SCALE
    grid = {}
    for k, (ax, ay, bx, by, need) in enumerate(segs):
        for gy in range(int(min(ay, by) // CELL) - 1, int(max(ay, by) // CELL) + 2):
            for gx in range(int(min(ax, bx) // CELL) - 1, int(max(ax, bx) // CELL) + 2):
                grid.setdefault((gx, gy), []).append(k)
    boxes = []
    for b in buildings:
        f = b[3]; xs = f[0::2]; ys = f[1::2]
        boxes.append((min(xs), min(ys), max(xs), max(ys)))
    bgrid = {}
    for k, (x0, y0, x1, y1) in enumerate(boxes):
        for gy in range(int(y0 // CELL), int(y1 // CELL) + 1):
            for gx in range(int(x0 // CELL), int(x1 // CELL) + 1):
                bgrid.setdefault((gx, gy), []).append(k)
    out = []
    for k, b in enumerate(buildings):
        if b[0] != 'H' or (k * 2654435761) % 100 >= 70:
            continue
        x0, y0, x1, y1 = boxes[k]
        if (x1 - x0) * (y1 - y0) < (7 * SCALE) ** 2:
            continue
        fx0, fy0, fx1, fy1 = x0 - PAD, y0 - PAD, x1 + PAD, y1 + PAD
        ok = True
        cells = {(gx, gy) for gy in range(int(fy0 // CELL), int(fy1 // CELL) + 1) for gx in range(int(fx0 // CELL), int(fx1 // CELL) + 1)}
        for c in cells:
            for j in bgrid.get(c, ()):
                if j != k:
                    a0, b0, a1, b1 = boxes[j]
                    if a0 < fx1 + 2 and a1 > fx0 - 2 and b0 < fy1 + 2 and b1 > fy0 - 2:
                        ok = False; break
            if not ok:
                break
        if not ok:
            continue
        n = 10
        rand = [(fx0 + (fx1 - fx0) * i / n, y) for i in range(n + 1) for y in (fy0, fy1)] + [(x, fy0 + (fy1 - fy0) * i / n) for i in range(n + 1) for x in (fx0, fx1)]
        best = None
        for x, y in rand:
            for j in grid.get((int(x // CELL), int(y // CELL)), ()):
                ax, ay, bx, by, need = segs[j]
                d, cx, cy = seg_dist(x, y, ax, ay, bx, by)
                if d < need:
                    ok = False; break
                if best is None or d < best[0]:
                    best = (d, cx, cy)
            if not ok:
                break
        if not ok:
            continue
        # Tor auf der Seite, die der nächsten Straße zugewandt ist
        gate = (k * 7) % 4
        if best:
            mx, my = (fx0 + fx1) / 2, (fy0 + fy1) / 2
            dx, dy = best[1] - mx, best[2] - my
            gate = (1 if dx > 0 else 3) if abs(dx) > abs(dy) else (2 if dy > 0 else 0)
        out.append([round(fx0), round(fy0), round(fx1), round(fy1), gate])
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

    orte, wie = finde_orte(elements)
    for k in ORTE:
        print(f'  Ort {k:18s} {wie[k]}')
    buildings, dropped = fit_buildings(buildings, roads)
    fences = zaeune(buildings, roads)
    print(f'{len(fences)} Gartenzäune')
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
        'water': water, 'rail': rail, 'pois': pois, 'boundary': boundary, 'orte': orte, 'fences': fences,
    }
    js = '// Automatisch erzeugt aus OpenStreetMap-Daten (c) OpenStreetMap-Mitwirkende, ODbL.\n' \
         '// Neu erzeugen: python3 tools/osm-to-karte.py <overpass.json> public/schwarzach/karte.js\n' \
         'window.KARTE=' + json.dumps(out, ensure_ascii=False, separators=(',', ':')) + ';\n'
    open(dst, 'w', encoding='utf-8').write(js)
    print(f'{len(roads)} Straßen, {len(buildings)} Gebäude, {len(areas)} Flächen, {len(water)} Gewässer, {len(rail)} Gleise, {len(pois)} Orte, {len(js)//1024} KB')


if __name__ == '__main__':
    main(sys.argv[1:-1], sys.argv[-1])
