"""Tissue cutaway block.

A schematic cross-section, not to scale. Skin surface is z = 0 and tissue
runs downward. The front face (-Y) is the cut face the learner looks at.

Fixed pieces: epidermis, dermis (with the wavy ridge line between them),
hair follicles, small vessels and a nerve in the upper tissue.

Depth-adjustable pieces: fat and muscle are open-sided shells much taller
than needed; the app clips each to its layer with two planes, so the lobule
and fibre detail never stretches. Fascia and periosteum are thin bands the
app slides onto the layer boundaries, and the bone block slides below them.
"""

import math
import random

import bmesh
import bpy
from mathutils import Vector

import deltoid_lib as L

W = 0.070          # width (x)
D = 0.040          # depth (y)
X0, X1 = -W / 2, W / 2
Y0, Y1 = -D / 2, D / 2
SKIN = 0.0025      # epidermis + dermis
DEEP = 0.060       # shells run this far down
BONE = 0.011


def _cells(seed, cell, sx=1.0, sy=1.0):
    """Cellular (Voronoi) field. Returns f(u, v) -> (edge, cell_id), where
    edge is 0 on a cell border and rises to ~1 in the middle of a cell."""
    rnd = random.Random(seed)
    cache = {}

    def pt(i, j):
        key = (i, j)
        if key not in cache:
            cache[key] = (i + 0.15 + 0.7 * rnd.random(), j + 0.15 + 0.7 * rnd.random(), rnd.random())
        return cache[key]

    def f(u, v):
        gu, gv = u / (cell * sx), v / (cell * sy)
        i0, j0 = math.floor(gu), math.floor(gv)
        best = (9.0, 9.0, 0.0)
        for i in range(i0 - 1, i0 + 2):
            for j in range(j0 - 1, j0 + 2):
                px, py, pid = pt(i, j)
                d = math.hypot(px - gu, py - gv)
                if d < best[0]:
                    best = (d, best[0], pid)
                elif d < best[1]:
                    best = (best[0], d, best[2])
        return min(1.0, (best[1] - best[0]) * 2.2), best[2]

    return f


def _mix(a, b, t):
    return tuple(a[i] + (b[i] - a[i]) * t for i in range(3))


def _relief_wall(bm, col, origin, eu, ev, out, lu, lv, step, fn):
    """A wall with relief. fn(u, v) -> (push_out_metres, rgb). The push
    fades to nothing at the vertical edges so neighbouring walls meet."""
    nu = max(2, round(lu / step))
    nv = max(2, round(lv / step))
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            u, v = lu * i / nu, lv * j / nv
            push, rgb = fn(u, v)
            fade = min(1.0, min(u, lu - u) / 0.0012)
            vert = bm.verts.new(origin + eu * u + ev * v + out * (push * fade))
            row.append((vert, rgb))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            quad = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            face = bm.faces.new([q[0] for q in quad])
            for loop, q in zip(face.loops, quad):
                loop[col] = (q[1][0], q[1][1], q[1][2], 1.0)
    return grid


def _flat_wall(bm, col, corners, rgb):
    face = bm.faces.new([bm.verts.new(c) for c in corners])
    for loop in face.loops:
        loop[col] = (rgb[0], rgb[1], rgb[2], 1.0)


def _finish(name, bm, sc, mat, smooth=True):
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = L.new_mesh_object(name, bm, sc, mat, smooth=smooth)
    return ob


def _shell(name, sc, mat, z_top, z_bot, front_fn, side_fn, base_rgb, step=0.0010):
    """Open-sided shell: front and right walls carry relief, left and back
    are plain. No top or bottom; the app clips it to its layer."""
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    h = z_top - z_bot
    down = Vector((0, 0, -1))
    _relief_wall(bm, col, Vector((X0, Y0, z_top)), Vector((1, 0, 0)), down, Vector((0, -1, 0)), W, h, step, front_fn)
    _relief_wall(bm, col, Vector((X1, Y0, z_top)), Vector((0, 1, 0)), down, Vector((1, 0, 0)), D, h, step, side_fn)
    _flat_wall(bm, col, [(X1, Y1, z_top), (X0, Y1, z_top), (X0, Y1, z_bot), (X1, Y1, z_bot)], base_rgb)
    _flat_wall(bm, col, [(X0, Y1, z_top), (X0, Y0, z_top), (X0, Y0, z_bot), (X0, Y1, z_bot)], base_rgb)
    return _finish(name, bm, sc, mat)


def _prism(name, sc, mat, top_fn, bot_fn, rgb, margin=0.0, step=0.00025):
    """Closed slab extruded front to back; top and bottom follow profiles."""
    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    n = round((W + 2 * margin) / step)
    ya, yb = Y0 - margin, Y1 + margin
    cols = []
    for i in range(n + 1):
        x = X0 - margin + (W + 2 * margin) * i / n
        zt, zb = top_fn(x), bot_fn(x)
        cols.append([bm.verts.new((x, ya, zt)), bm.verts.new((x, ya, zb)),
                     bm.verts.new((x, yb, zt)), bm.verts.new((x, yb, zb))])
    faces = []
    for a, b in zip(cols[:-1], cols[1:]):
        faces.append(bm.faces.new((a[0], b[0], b[1], a[1])))      # front
        faces.append(bm.faces.new((a[2], a[3], b[3], b[2])))      # back
        faces.append(bm.faces.new((a[0], a[2], b[2], b[0])))      # top
        faces.append(bm.faces.new((a[1], b[1], b[3], a[3])))      # bottom
    a, b = cols[0], cols[-1]
    faces.append(bm.faces.new((a[0], a[1], a[3], a[2])))
    faces.append(bm.faces.new((b[0], b[2], b[3], b[1])))
    for f in faces:
        for loop in f.loops:
            loop[col] = (rgb[0], rgb[1], rgb[2], 1.0)
    return _finish(name, bm, sc, mat, smooth=False)


def _tube_object(name, sc, mat, sections, seg=10, sub=5):
    bm = bmesh.new()
    L.add_tube(bm, sections, seg=seg, sub=sub, ref=(0, 1, 0))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L.new_mesh_object(name, bm, sc, mat)


def build():
    sc = L.activate(L.get_scene("Deltoid_Tissue"))
    L.clear_prefixed(sc, "Tissue_")
    c = lambda h: L.srgb(h)[:3]
    mats = dict(
        epi=L.material("Tissue_Mat_Epidermis", L.srgb("#e8c3ae"), 0.6),
        derm=L.material("Tissue_Mat_Dermis", L.srgb("#d99a86"), 0.7),
        fat=L.material("Tissue_Mat_Fat", L.srgb("#efd27e"), 0.55),
        fascia=L.material("Tissue_Mat_Fascia", L.srgb("#f3ece0"), 0.5),
        muscle=L.material("Tissue_Mat_Muscle", L.srgb("#b0483f"), 0.6),
        bone=L.material("Tissue_Mat_Bone", L.srgb("#ece4cf"), 0.5),
        hair=L.material("Tissue_Mat_Hair", L.srgb("#5a4638"), 0.6),
        artery=L.material("Tissue_Mat_Artery", L.srgb("#c23a34"), 0.5),
        vein=L.material("Tissue_Mat_Vein", L.srgb("#3f5fa8"), 0.5),
        nerve=L.material("Tissue_Mat_Nerve", L.srgb("#e3c64a"), 0.5),
    )

    def ridge(x):                       # wavy line between epidermis and dermis
        return -0.00075 - 0.00024 * math.sin(2 * math.pi * x / 0.0015)

    def derm_bot(x):
        return -SKIN - 0.00012 * math.sin(2 * math.pi * x / 0.011)

    _prism("Tissue_Epidermis", sc, mats["epi"], lambda x: 0.0, ridge, c("#e8c3ae"))
    _prism("Tissue_Dermis", sc, mats["derm"], ridge, derm_bot, c("#d99a86"))

    # --- fat: rounded lobules separated by pale strands
    fat_f, fat_s = _cells(11, 0.0036), _cells(12, 0.0036)
    lob, strand = c("#f1d583"), c("#f7ecc6")

    def fat_fn(field):
        def fn(u, v):
            e, pid = field(u, v)
            t = e ** 0.6
            rgb = _mix(strand, _mix(lob, c("#e9c46a"), pid * 0.5), t)
            return 0.00045 * t, rgb
        return fn

    _shell("Tissue_Fat", sc, mats["fat"], -0.0020, -DEEP, fat_fn(fat_f), fat_fn(fat_s), lob)

    # --- muscle: long fibre bundles on the cut face, bundle ends on the side
    mus_f, mus_s = _cells(21, 0.0021, sx=14.0), _cells(22, 0.0022)
    red, dark = c("#b5493f"), c("#7c2b27")

    def mus_front(u, v):
        e, pid = mus_f(u, v + 0.0006 * math.sin(u * 180.0))
        t = e ** 0.5
        rgb = _mix(dark, _mix(red, c("#c45c50"), pid), t)
        return 0.00030 * t + 0.00004 * math.sin(v * 9000.0), rgb

    def mus_side(u, v):
        e, pid = mus_s(u, v)
        t = e ** 0.5
        return 0.00030 * t, _mix(dark, _mix(red, c("#c45c50"), pid), t)

    _shell("Tissue_Muscle", sc, mats["muscle"], -0.0080, -DEEP - 0.004, mus_front, mus_side, red)

    # --- thin bands the app places on the layer boundaries (local z = 0)
    def band(x, amp, period, phase):
        return amp * math.sin(2 * math.pi * x / period + phase)

    _prism("Tissue_Fascia", sc, mats["fascia"], lambda x: 0.00035 + band(x, 0.00016, 0.009, 0.4),
           lambda x: -0.00035 + band(x, 0.00016, 0.009, 0.4), c("#f3ece0"), margin=0.00055, step=0.0005)
    _prism("Tissue_Periosteum", sc, mats["fascia"], lambda x: 0.00030 + band(x, 0.00008, 0.013, 1.1),
           lambda x: -0.00030 + band(x, 0.00008, 0.013, 1.1), c("#f6f0e4"), margin=0.00055, step=0.0005)

    # --- bone: dense outer layer over spongy bone (local z = 0 is its top)
    bone_f, bone_s = _cells(31, 0.0019), _cells(32, 0.0019)
    cream, marrow = c("#efe7d2"), c("#a8574a")
    cortex = 0.0026

    def bone_fn(field):
        def fn(u, v):
            if v < cortex:
                return 0.0, cream
            e, _pid = field(u, v)
            t = min(1.0, (v - cortex) / 0.0008)
            pore = e ** 1.6 * t
            return -0.00050 * pore, _mix(cream, marrow, pore)
        return fn

    bm = bmesh.new()
    col = bm.loops.layers.color.new("Col")
    down = Vector((0, 0, -1))
    _relief_wall(bm, col, Vector((X0, Y0, 0)), Vector((1, 0, 0)), down, Vector((0, -1, 0)), W, BONE, 0.0006, bone_fn(bone_f))
    _relief_wall(bm, col, Vector((X1, Y0, 0)), Vector((0, 1, 0)), down, Vector((1, 0, 0)), D, BONE, 0.0006, bone_fn(bone_s))
    _flat_wall(bm, col, [(X1, Y1, 0), (X0, Y1, 0), (X0, Y1, -BONE), (X1, Y1, -BONE)], cream)
    _flat_wall(bm, col, [(X0, Y1, 0), (X0, Y0, 0), (X0, Y0, -BONE), (X0, Y1, -BONE)], cream)
    _flat_wall(bm, col, [(X0, Y0, 0), (X0, Y1, 0), (X1, Y1, 0), (X1, Y0, 0)], cream)
    _flat_wall(bm, col, [(X0, Y0, -BONE), (X1, Y0, -BONE), (X1, Y1, -BONE), (X0, Y1, -BONE)], cream)
    _finish("Tissue_Bone", bm, sc, mats["bone"])

    # --- hair follicles, small vessels and a nerve in the upper tissue
    yf = Y0 - 0.00015
    bm = bmesh.new()
    for x, lean in ((-0.024, 0.35), (0.004, 0.30), (0.026, 0.38)):
        L.add_tube(bm, [(Vector((x + lean * 0.0042, yf, 0.0042)), 0.00007, 0.00007),
                        (Vector((x, yf, 0.0)), 0.00011, 0.00011),
                        (Vector((x - lean * 0.0020, yf, -0.0020)), 0.00017, 0.00017),
                        (Vector((x - lean * 0.0034, yf, -0.0034)), 0.00021, 0.00021)], seg=8, sub=3, ref=(0, 1, 0))
        L.add_ball(bm, (x - lean * 0.0036, yf, -0.0036), 0.00034, seg=10)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    L.new_mesh_object("Tissue_Hair", bm, sc, mats["hair"])

    def vessel(name, mat, z, r, phase, loops):
        bm = bmesh.new()
        secs = []
        for i in range(15):
            x = X0 + 0.0008 + (W - 0.0016) * i / 14
            secs.append((Vector((x, yf, z + 0.00028 * math.sin(i * 1.3 + phase))), r, r))
        L.add_tube(bm, secs, seg=10, sub=3, ref=(0, 1, 0))
        for x in loops:                 # small loops rising toward the skin ridges
            L.add_tube(bm, [(Vector((x, yf, z)), r * 0.55, r * 0.55), (Vector((x + 0.0005, yf, -0.0022)), r * 0.42, r * 0.42),
                            (Vector((x + 0.0009, yf, -0.0011)), r * 0.34, r * 0.34)], seg=8, sub=3, ref=(0, 1, 0))
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        L.new_mesh_object(name, bm, sc, mat)

    vessel("Tissue_Arteriole", mats["artery"], -0.0041, 0.00030, 0.0, (-0.027, -0.012, 0.007, 0.021))
    vessel("Tissue_Venule", mats["vein"], -0.0052, 0.00036, 1.7, (-0.020, -0.004, 0.014, 0.029))
    vessel("Tissue_Nerve", mats["nerve"], -0.0063, 0.00022, 3.1, (-0.016, 0.018))

    # --- reference points for the app
    L.add_empty("Tissue_Ref_SkinSurface", (0, Y0, 0), sc, size=0.004)
    L.add_empty("Tissue_Ref_DermisBottom", (0, Y0, -SKIN), sc, size=0.004)
    L.add_empty("Tissue_Ref_Entry", (0.010, Y0 - 0.0012, 0), sc, size=0.004)
    L.add_empty("Tissue_View", (0, 0, -0.012), sc, kind="CUBE", size=1.0, scale=(W / 2 + 0.004, D / 2, 0.062))

    out = {}
    for ob in sc.collection.all_objects:
        if ob.name.startswith("Tissue_") and ob.type == "MESH":
            out[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    out["total_tris"] = sum(out.values())
    return out
