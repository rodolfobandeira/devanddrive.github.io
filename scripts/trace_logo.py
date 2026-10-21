"""Trace the raster logo into vector outlines (marching squares + RDP).

Usage: python3 scripts/trace_logo.py images/dev-and-drive.png images/dev-and-drive-outline.svg
Requires numpy and Pillow.
"""
import sys
import numpy as np
from PIL import Image

src, dst = sys.argv[1], sys.argv[2]
img = np.asarray(Image.open(src).convert('RGB')).astype(float)
r, g, b = img[..., 0], img[..., 1], img[..., 2]

fields = {
    'white': np.minimum(np.minimum(r, g), b),
    'blue': np.clip(b - r, 0, 255),
}
colors = {'white': '#ffffff', 'blue': '#0096ff'}
T = 128.0


def trace(f):
    f = np.pad(f, 1)
    h, w = f.shape
    inside = f > T

    def interp(a, b, pa, pb):
        t = (T - a) / (b - a) if b != a else 0.5
        return (pa[0] + t * (pb[0] - pa[0]), pa[1] + t * (pb[1] - pa[1]))

    def edge_point(e):
        kind, x, y = e
        if kind == 'h':
            return interp(f[y, x], f[y, x + 1], (x, y), (x + 1, y))
        return interp(f[y, x], f[y + 1, x], (x, y), (x, y + 1))

    adj = {}

    def link(a, b):
        adj.setdefault(a, []).append(b)
        adj.setdefault(b, []).append(a)

    for y in range(h - 1):
        for x in range(w - 1):
            tl, tr, br, bl = inside[y, x], inside[y, x + 1], inside[y + 1, x + 1], inside[y + 1, x]
            case = tl * 8 + tr * 4 + br * 2 + bl
            if case in (0, 15):
                continue
            top, right, bottom, left = ('h', x, y), ('v', x + 1, y), ('h', x, y + 1), ('v', x, y)
            center = (f[y, x] + f[y, x + 1] + f[y + 1, x + 1] + f[y + 1, x]) / 4 > T
            segs = {
                1: [(left, bottom)], 2: [(bottom, right)], 3: [(left, right)],
                4: [(top, right)], 6: [(top, bottom)], 7: [(left, top)],
                8: [(left, top)], 9: [(top, bottom)], 11: [(top, right)],
                12: [(left, right)], 13: [(bottom, right)], 14: [(left, bottom)],
                5: [(left, top), (bottom, right)] if not center else [(left, bottom), (top, right)],
                10: [(top, right), (left, bottom)] if not center else [(left, top), (bottom, right)],
            }[case]
            for a, b in segs:
                link(a, b)

    loops, seen = [], set()
    for start in adj:
        if start in seen:
            continue
        loop, prev, cur = [], None, start
        while cur not in seen:
            seen.add(cur)
            loop.append(edge_point(cur))
            nxt = [n for n in adj[cur] if n != prev and n not in seen]
            if not nxt:
                break
            prev, cur = cur, nxt[0]
        if len(loop) > 8:
            loops.append([(px - 1, py - 1) for px, py in loop])
    return loops


def rdp(points, eps):
    if len(points) < 3:
        return points
    a, b = np.array(points[0]), np.array(points[-1])
    pts = np.array(points)
    d = b - a
    norm = np.hypot(*d)
    if norm == 0:
        dists = np.hypot(*(pts - a).T)
    else:
        dists = np.abs(d[0] * (pts[:, 1] - a[1]) - d[1] * (pts[:, 0] - a[0])) / norm
    i = int(np.argmax(dists))
    if dists[i] > eps:
        return rdp(points[:i + 1], eps)[:-1] + rdp(points[i:], eps)
    return [points[0], points[-1]]


def simplify_loop(loop, eps=0.4):
    # Split the closed loop at its farthest point pair so RDP has stable anchors
    half = len(loop) // 2
    return rdp(loop[:half + 1], eps)[:-1] + rdp(loop[half:] + [loop[0]], eps)[:-1]


paths = []
for name, field in fields.items():
    d = []
    for loop in trace(field):
        pts = simplify_loop(loop)
        d.append('M' + ' L'.join(f'{x:.1f},{y:.1f}' for x, y in pts) + ' Z')
    paths.append(f'  <path id="{name}" fill="{colors[name]}" fill-rule="evenodd" d="{" ".join(d)}"/>')
    print(name, len(d), 'loops', sum(s.count('L') + 1 for s in d), 'points', file=sys.stderr)

with open(dst, 'w') as out:
    out.write('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 800">\n')
    out.write('\n'.join(paths) + '\n</svg>\n')
