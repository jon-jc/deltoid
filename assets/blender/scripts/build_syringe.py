"""Syringe with separate barrel, graduations, plunger, fluid, hub and needle.

Modelled along Z with the needle pointing down (-Z). The origin is where
the needle leaves the hub, so the app can scale the needle's length from
that point and slide the plunger along the same axis. Real-world scale:
a 3 mL barrel about 10 mm across, needle modelled at 1 inch (25.4 mm).
"""

import math

import bmesh
import bpy
from mathutils import Matrix, Vector

import deltoid_lib as L

NEEDLE_LEN = L.INCH
NEEDLE_R = 0.00034
HUB_TOP = 0.0190
BARREL_Z0 = 0.0240          # start of the straight barrel (plunger fully in)
BARREL_Z1 = 0.0890
BARREL_R = 0.0050
WALL = 0.00065
ML = 0.0163                 # barrel length per millilitre


def _lathe(bm, profile, seg=40, cap_start=True, cap_end=True):
    """Revolve a list of (radius, z) points around Z."""
    rings = []
    for r, z in profile:
        rings.append([bm.verts.new((r * math.cos(2 * math.pi * s / seg), r * math.sin(2 * math.pi * s / seg), z))
                      for s in range(seg)])
    faces = []
    for a, b in zip(rings[:-1], rings[1:]):
        for s in range(seg):
            s2 = (s + 1) % seg
            faces.append(bm.faces.new((a[s], a[s2], b[s2], b[s])))
    if cap_start:
        faces.append(bm.faces.new(list(reversed(rings[0]))))
    if cap_end:
        faces.append(bm.faces.new(rings[-1]))
    return faces


def _box(bm, lo, hi):
    x0, y0, z0 = lo
    x1, y1, z1 = hi
    v = [bm.verts.new(p) for p in ((x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0),
                                   (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1))]
    for idx in ((0, 3, 2, 1), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)):
        bm.faces.new([v[i] for i in idx])


def _object(name, bm, sc, mat, angle=35.0):
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = L.new_mesh_object(name, bm, sc, mat, smooth=True)
    # keep rims and steps crisp
    ang = math.radians(angle)
    bm2 = bmesh.new()
    bm2.from_mesh(ob.data)
    sharp = [e for e in bm2.edges if len(e.link_faces) == 2 and e.calc_face_angle(0.0) > ang]
    if sharp:
        bmesh.ops.split_edges(bm2, edges=sharp)
    bm2.to_mesh(ob.data)
    bm2.free()
    return ob


def build():
    sc = L.activate(L.get_scene("Deltoid_Syringe"))
    L.clear_prefixed(sc, "Syringe_")
    steel = L.material("Syringe_Mat_Steel", L.srgb("#c9ced3"), 0.25)
    hub_m = L.material("Syringe_Mat_Hub", L.srgb("#2f8f86"), 0.45)
    clear = L.material("Syringe_Mat_Barrel", L.srgb("#e9f1f2"), 0.12, alpha=0.32)
    ink = L.material("Syringe_Mat_Ink", L.srgb("#1d2b2c"), 0.6)
    rubber = L.material("Syringe_Mat_Stopper", L.srgb("#23282b"), 0.7)
    white = L.material("Syringe_Mat_Plunger", L.srgb("#f2f1ec"), 0.45)
    fluid_m = L.material("Syringe_Mat_Fluid", L.srgb("#bfe3e0"), 0.2, alpha=0.55)
    for m in (steel,):
        bsdf = m.node_tree.nodes.get("Principled BSDF")
        if bsdf:
            bsdf.inputs["Metallic"].default_value = 0.9

    # ---- needle: thin tube with a slanted, sharpened tip
    bm = bmesh.new()
    seg = 16
    bevel = 0.0030
    rings = []
    for k in range(13):
        z = -NEEDLE_LEN * k / 12
        rings.append([Vector((NEEDLE_R * math.cos(2 * math.pi * s / seg), NEEDLE_R * math.sin(2 * math.pi * s / seg), z))
                      for s in range(seg)])
    tip_z = -NEEDLE_LEN
    for ring in rings:
        for p in ring:
            # the cut plane rises from the point (at +x) across the tube
            cut = tip_z + bevel * (NEEDLE_R - p.x) / (2 * NEEDLE_R)
            if p.z < cut:
                p.z = cut
    vr = [[bm.verts.new(p) for p in ring] for ring in rings]
    for a, b in zip(vr[:-1], vr[1:]):
        for s in range(seg):
            s2 = (s + 1) % seg
            try:
                bm.faces.new((a[s], a[s2], b[s2], b[s]))
            except ValueError:
                pass
    bm.faces.new(vr[0])
    bm.faces.new(list(reversed(vr[-1])))
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-7)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=1e-7)
    _object("Syringe_Needle", bm, sc, steel)

    # ---- hub: tapered collar with grip fins
    bm = bmesh.new()
    _lathe(bm, [(0.00060, -0.0006), (0.00105, 0.0), (0.00125, 0.0030), (0.00215, 0.0052), (0.00225, 0.0105),
                (0.00300, 0.0118), (0.00320, 0.0176), (0.00300, HUB_TOP)], seg=32)
    for i in range(6):
        ang = math.pi * i / 3
        fin = bmesh.new()
        _box(fin, (0.0020, -0.00028, 0.0054), (0.00305, 0.00028, 0.0116))
        me = bpy.data.meshes.new("tmp_fin")
        fin.to_mesh(me)
        fin.free()
        me.transform(Matrix.Rotation(ang, 4, "Z"))
        bm.from_mesh(me)
        bpy.data.meshes.remove(me)
    _object("Syringe_Hub", bm, sc, hub_m)

    # ---- barrel: lock collar, shoulder, clear tube with wall thickness, finger flange
    bm = bmesh.new()
    r_in = BARREL_R - WALL
    _lathe(bm, [(0.00180, 0.0128), (0.00480, 0.0128), (0.00480, 0.0206), (0.00200, 0.0212), (0.00200, 0.0226),
                (BARREL_R, BARREL_Z0), (BARREL_R, BARREL_Z1), (r_in, BARREL_Z1), (r_in, BARREL_Z0 + 0.0006),
                (0.00130, 0.0232), (0.00130, 0.0136), (0.00180, 0.0128)], seg=48, cap_start=False, cap_end=False)
    # finger flange: flattened oval plate with a hole for the plunger
    nseg = 48
    for z0, z1 in ((BARREL_Z1 - 0.0016, BARREL_Z1),):
        outer0, outer1, inner0, inner1 = [], [], [], []
        for s in range(nseg):
            a = 2 * math.pi * s / nseg
            ox, oy = 0.0140 * math.cos(a), 0.0078 * math.sin(a)
            outer0.append(bm.verts.new((ox, oy, z0)))
            outer1.append(bm.verts.new((ox, oy, z1)))
            inner0.append(bm.verts.new((BARREL_R * math.cos(a), BARREL_R * math.sin(a), z0)))
            inner1.append(bm.verts.new((r_in * math.cos(a), r_in * math.sin(a), z1)))
        for s in range(nseg):
            s2 = (s + 1) % nseg
            bm.faces.new((outer0[s], outer1[s], outer1[s2], outer0[s2]))
            bm.faces.new((outer1[s], inner1[s], inner1[s2], outer1[s2]))
            bm.faces.new((outer0[s], outer0[s2], inner0[s2], inner0[s]))
    _object("Syringe_Barrel", bm, sc, clear)

    # ---- graduations: a mark every 0.1 mL, longer at each 0.5 mL, up to 3 mL
    bm = bmesh.new()
    for i in range(31):
        z = BARREL_Z0 + 0.0008 + ML * i / 10
        long = i % 5 == 0
        half = math.radians(34 if long else 17)
        steps = 8 if long else 4
        r0, r1 = BARREL_R + 0.00002, BARREL_R + 0.00007
        prev = None
        for k in range(steps + 1):
            a = -math.pi / 2 - half + 2 * half * k / steps
            cx, cy = math.cos(a), math.sin(a)
            cur = [bm.verts.new((r0 * cx, r0 * cy, z - 0.00013)), bm.verts.new((r1 * cx, r1 * cy, z - 0.00013)),
                   bm.verts.new((r1 * cx, r1 * cy, z + 0.00013)), bm.verts.new((r0 * cx, r0 * cy, z + 0.00013))]
            if prev is not None:
                bm.faces.new((prev[1], cur[1], cur[2], prev[2]))
                bm.faces.new((prev[0], prev[1], cur[1], cur[0]))
                bm.faces.new((prev[3], cur[3], cur[2], prev[2]))
            prev = cur
    _object("Syringe_Graduations", bm, sc, ink)

    # ---- plunger: ribbed rubber stopper, cross-shaped rod, thumb rest
    #      modelled fully pressed in; the app slides it back along +Z
    bm = bmesh.new()
    rs = r_in - 0.00006
    _lathe(bm, [(0.0006, BARREL_Z0 - 0.0002), (rs * 0.55, BARREL_Z0 + 0.0008), (rs, BARREL_Z0 + 0.0019),
                (rs, BARREL_Z0 + 0.0030), (rs - 0.00035, BARREL_Z0 + 0.0034), (rs - 0.00035, BARREL_Z0 + 0.0046),
                (rs, BARREL_Z0 + 0.0050), (rs, BARREL_Z0 + 0.0062), (rs - 0.0006, BARREL_Z0 + 0.0066),
                (rs - 0.0006, BARREL_Z0 + 0.0072)], seg=40)
    _object("Syringe_Stopper", bm, sc, rubber)

    bm = bmesh.new()
    z0, z1 = BARREL_Z0 + 0.0070, BARREL_Z1 + 0.0255
    arm = r_in - 0.0005
    _box(bm, (-arm, -0.00045, z0), (arm, 0.00045, z1))
    _box(bm, (-0.00045, -arm, z0), (0.00045, arm, z1))
    _lathe(bm, [(arm, z0), (arm, z0 + 0.0010)], seg=32)
    _lathe(bm, [(arm, BARREL_Z1 + 0.0030), (arm, BARREL_Z1 + 0.0040)], seg=32)
    _lathe(bm, [(0.0040, z1 - 0.0004), (0.0086, z1), (0.0090, z1 + 0.0008), (0.0090, z1 + 0.0016), (0.0082, z1 + 0.0021)], seg=40)
    _object("Syringe_Plunger", bm, sc, white)

    # ---- fluid: one millilitre of liquid ahead of the stopper (app scales its length)
    bm = bmesh.new()
    rf = r_in - 0.00012
    _lathe(bm, [(0.0012, 0.0226), (0.0012, BARREL_Z0 - 0.0003), (rf, BARREL_Z0 + 0.0002), (rf, BARREL_Z0 + ML)], seg=32)
    _object("Syringe_Fluid", bm, sc, fluid_m)

    L.add_empty("Syringe_Ref_NeedleBase", (0, 0, 0), sc, size=0.004)
    L.add_empty("Syringe_Ref_NeedleTip", (NEEDLE_R, 0, -NEEDLE_LEN), sc, size=0.004)
    L.add_empty("Syringe_Ref_FluidBase", (0, 0, BARREL_Z0), sc, size=0.004)
    L.add_empty("Syringe_Ref_PerMillilitre", (0, 0, BARREL_Z0 + ML), sc, size=0.004)

    out = {}
    for ob in sc.collection.all_objects:
        if ob.name.startswith("Syringe_") and ob.type == "MESH":
            out[ob.name] = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    out["total_tris"] = sum(out.values())
    return out
