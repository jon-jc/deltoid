"""Shared helpers for the Deltoid model build scripts.

Run inside Blender (5.x). Everything is built in metres, Z up, with the
figure facing -Y so that the glTF export (Y up) faces +Z.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector
from mathutils.bvhtree import BVHTree

INCH = 0.0254


# ---------------------------------------------------------------- scenes

def get_scene(name):
    sc = bpy.data.scenes.get(name)
    if sc is None:
        sc = bpy.data.scenes.new(name)
    sc.unit_settings.system = "METRIC"
    sc.unit_settings.scale_length = 1.0
    return sc


def activate(sc):
    bpy.context.window.scene = sc
    return sc


def clear_prefixed(sc, prefix):
    """Remove only the objects this project created in its own scene."""
    for ob in list(sc.collection.all_objects):
        if ob.name.startswith(prefix):
            data = ob.data
            bpy.data.objects.remove(ob, do_unlink=True)
            if isinstance(data, bpy.types.Mesh) and data.users == 0:
                bpy.data.meshes.remove(data)


def select_only(ob):
    bpy.context.view_layer.update()
    for o in bpy.context.view_layer.objects:
        if o is not None:
            o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


def material(name, rgba, roughness=0.6, alpha=1.0):
    mat = bpy.data.materials.get(name)
    if mat is None:
        mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes.get("Principled BSDF")
    if bsdf is not None:
        bsdf.inputs["Base Color"].default_value = (rgba[0], rgba[1], rgba[2], 1.0)
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Alpha"].default_value = alpha
    mat.diffuse_color = (rgba[0], rgba[1], rgba[2], alpha)
    if alpha < 1.0:
        mat.surface_render_method = "BLENDED"
    return mat


def srgb(hex_str):
    """'#rrggbb' -> linear RGBA tuple for Blender."""
    h = hex_str.lstrip("#")
    out = []
    for i in (0, 2, 4):
        c = int(h[i:i + 2], 16) / 255.0
        out.append(c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4)
    return (out[0], out[1], out[2], 1.0)


# ------------------------------------------------------------ primitives

def align_z(direction):
    d = Vector(direction).normalized()
    return Vector((0, 0, 1)).rotation_difference(d).to_matrix().to_4x4()


def add_ball(bm, c, r, rot=None, seg=32):
    if not hasattr(r, "__len__"):
        r = (r, r, r)
    m = Matrix.Translation(Vector(c)) @ (rot or Matrix.Identity(4)) @ Matrix.Diagonal((r[0], r[1], r[2], 1.0))
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=seg // 2, radius=1.0, matrix=m)


def add_limb(bm, p1, r1, p2, r2, seg=28):
    p1 = Vector(p1)
    p2 = Vector(p2)
    d = p2 - p1
    m = Matrix.Translation((p1 + p2) / 2) @ align_z(d)
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg,
                          radius1=r1, radius2=r2, depth=d.length, matrix=m)
    add_ball(bm, p1, r1, seg=seg)
    add_ball(bm, p2, r2, seg=seg)


def add_tube(bm, sections, seg=32, sub=5, ref=(1, 0, 0)):
    """Loft a closed tube through elliptical sections.

    sections: list of (center, rx, ry). Sections are interpolated with a
    Catmull-Rom spline so the silhouette stays smooth. rx lies along `ref`
    (projected square to the path), ry along the remaining axis."""
    pts = [(Vector(c), rx, ry) for c, rx, ry in sections]
    n = len(pts)

    def cr(p0, p1, p2, p3, t):
        t2 = t * t
        t3 = t2 * t
        return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2
                      + (-p0 + 3 * p1 - 3 * p2 + p3) * t3)

    dense = []
    for i in range(n - 1):
        a = pts[max(i - 1, 0)]
        b = pts[i]
        c = pts[i + 1]
        d = pts[min(i + 2, n - 1)]
        steps = sub if i < n - 2 else sub + 1
        for k in range(steps):
            t = k / sub
            dense.append((cr(a[0], b[0], c[0], d[0], t),
                          max(cr(a[1], b[1], c[1], d[1], t), 1e-4),
                          max(cr(a[2], b[2], c[2], d[2], t), 1e-4)))
    rings = []
    refv = Vector(ref)
    for i, (c, rx, ry) in enumerate(dense):
        nxt = dense[min(i + 1, len(dense) - 1)][0]
        prv = dense[max(i - 1, 0)][0]
        tan = (nxt - prv).normalized()
        ex = (refv - tan * refv.dot(tan)).normalized()
        ey = tan.cross(ex).normalized()
        ring = []
        for s in range(seg):
            ang = 2 * math.pi * s / seg
            ring.append(bm.verts.new(c + ex * (rx * math.cos(ang)) + ey * (ry * math.sin(ang))))
        rings.append(ring)
    for i in range(len(rings) - 1):
        r0, r1 = rings[i], rings[i + 1]
        for s in range(seg):
            s2 = (s + 1) % seg
            bm.faces.new((r0[s], r0[s2], r1[s2], r1[s]))
    bm.faces.new(list(reversed(rings[0])))
    bm.faces.new(rings[-1])


def spline(points, t):
    """Catmull-Rom through a list of Vectors, t in [0, 1]."""
    n = len(points) - 1
    f = min(max(t, 0.0), 1.0) * n
    i = min(int(f), n - 1)
    u = f - i
    p0 = points[max(i - 1, 0)]
    p1 = points[i]
    p2 = points[i + 1]
    p3 = points[min(i + 2, n)]
    u2 = u * u
    u3 = u2 * u
    return 0.5 * ((2 * p1) + (-p0 + p2) * u + (2 * p0 - 5 * p1 + 4 * p2 - p3) * u2
                  + (-p0 + 3 * p1 - 3 * p2 + p3) * u3)


def add_slab(bm, grid, thickness):
    """Closed plate through a grid of points (rows x cols), used for flat
    bones such as the wing of the ilium and the body of the scapula."""
    rows = len(grid)
    cols = len(grid[0])

    def nrm(i, j):
        a = grid[min(i + 1, rows - 1)][j] - grid[max(i - 1, 0)][j]
        b = grid[i][min(j + 1, cols - 1)] - grid[i][max(j - 1, 0)]
        n = a.cross(b)
        return n.normalized() if n.length > 1e-12 else Vector((0, 0, 1))

    top = [[bm.verts.new(grid[i][j] + nrm(i, j) * (thickness / 2)) for j in range(cols)] for i in range(rows)]
    bot = [[bm.verts.new(grid[i][j] - nrm(i, j) * (thickness / 2)) for j in range(cols)] for i in range(rows)]
    for i in range(rows - 1):
        for j in range(cols - 1):
            bm.faces.new((top[i][j], top[i][j + 1], top[i + 1][j + 1], top[i + 1][j]))
            bm.faces.new((bot[i][j], bot[i + 1][j], bot[i + 1][j + 1], bot[i][j + 1]))
    for j in range(cols - 1):
        bm.faces.new((top[0][j], bot[0][j], bot[0][j + 1], top[0][j + 1]))
        bm.faces.new((top[rows - 1][j], top[rows - 1][j + 1], bot[rows - 1][j + 1], bot[rows - 1][j]))
    for i in range(rows - 1):
        bm.faces.new((top[i][0], top[i + 1][0], bot[i + 1][0], bot[i][0]))
        bm.faces.new((top[i][cols - 1], bot[i][cols - 1], bot[i + 1][cols - 1], top[i + 1][cols - 1]))


def mirror_x(bm):
    """Duplicate everything in the bmesh across the YZ plane."""
    geom = list(bm.verts) + list(bm.edges) + list(bm.faces)
    dup = bmesh.ops.duplicate(bm, geom=geom)
    new_verts = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMVert)]
    new_faces = [g for g in dup["geom"] if isinstance(g, bmesh.types.BMFace)]
    for v in new_verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=new_faces)


def new_mesh_object(name, bm, sc, mat=None, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    sc.collection.objects.link(ob)
    if mat is not None:
        me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def add_empty(name, loc, sc, kind="PLAIN_AXES", size=0.02, scale=None):
    ob = bpy.data.objects.new(name, None)
    ob.empty_display_type = kind
    ob.empty_display_size = size
    ob.location = Vector(loc)
    if scale is not None:
        ob.scale = Vector(scale)
    sc.collection.objects.link(ob)
    return ob


def apply_modifier(ob, mod_name):
    select_only(ob)
    bpy.ops.object.modifier_apply(modifier=mod_name)


# -------------------------------------------------------------- surfaces

def bvh_of(ob):
    dg = bpy.context.evaluated_depsgraph_get()
    dg.update()
    return BVHTree.FromObject(ob, dg)


def surface_hit(bvh, toward, direction, reach=0.6):
    """Outer surface point met when travelling from outside toward `toward`
    against `direction` (direction points outward from the body)."""
    d = Vector(direction).normalized()
    origin = Vector(toward) + d * reach
    loc, nor, _idx, _dist = bvh.ray_cast(origin, -d, reach * 2)
    if loc is None:
        return None, None
    return loc, nor


def patch_object(name, sc, bvh, fn, nu, nv, offset=0.0015, mat=None, reach=0.6):
    """Build a surface-hugging patch. fn(u, v) -> (toward, outward_dir) for
    u, v in [0, 1]. Degenerate rows (for fans and apexes) are merged."""
    bm = bmesh.new()
    grid = []
    for j in range(nv + 1):
        row = []
        for i in range(nu + 1):
            toward, out = fn(i / nu, j / nv)
            loc, nor = surface_hit(bvh, toward, out, reach=reach)
            if loc is None:
                loc = Vector(toward)
                nor = Vector(out).normalized()
            if nor.dot(Vector(out)) < 0:
                nor = -nor
            row.append(bm.verts.new(loc + nor * offset))
        grid.append(row)
    for j in range(nv):
        for i in range(nu):
            quad = (grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i])
            if len({v.index if v.index >= 0 else id(v) for v in quad}) == 4:
                try:
                    bm.faces.new(quad)
                except ValueError:
                    pass
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00005)
    bmesh.ops.dissolve_degenerate(bm, edges=bm.edges, dist=0.00005)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = new_mesh_object(name, bm, sc, mat)
    return ob


def squircle(theta, n=2.0):
    """Unit superellipse radius at angle theta (n=2 circle, n=4 squircle)."""
    c = abs(math.cos(theta))
    s = abs(math.sin(theta))
    return (c ** n + s ** n) ** (-1.0 / n)


# ------------------------------------------------------------- viewport

def view(yaw=0.0, pitch=0.0, target=(0, 0, 0.9), dist=3.0, ortho=True, overlays=True):
    """Aim the first 3D viewport. yaw > 0 swings the camera toward the
    figure's left side (+X); the figure faces -Y."""
    for area in bpy.context.window.screen.areas:
        if area.type != "VIEW_3D":
            continue
        sp = area.spaces.active
        r3d = sp.region_3d
        r3d.view_perspective = "ORTHO" if ortho else "PERSP"
        r3d.view_rotation = Euler((math.radians(90 - pitch), 0, math.radians(yaw)), "XYZ").to_quaternion()
        r3d.view_location = Vector(target)
        r3d.view_distance = dist
        sp.shading.type = "SOLID"
        sp.shading.light = "STUDIO"
        sp.shading.color_type = "MATERIAL"
        sp.shading.show_cavity = True
        sp.overlay.show_overlays = overlays
        sp.overlay.show_floor = False
        sp.overlay.show_axis_x = False
        sp.overlay.show_axis_y = False
        sp.overlay.show_cursor = False
        area.tag_redraw()
        return True
    return False


def shot(path, yaw=0.0, pitch=0.0, target=(0, 0, 0.86), span=1.9, res=(700, 900)):
    """Workbench render of the active scene from an orthographic preview
    camera. Used to check each modelling step. The camera is not exported."""
    sc = bpy.context.window.scene
    name = "PreviewCam_" + sc.name
    cam = bpy.data.objects.get(name)
    if cam is None:
        cam = bpy.data.objects.new(name, bpy.data.cameras.new(name))
        sc.collection.objects.link(cam)
    cam.data.type = "ORTHO"
    cam.data.ortho_scale = span
    cam.data.clip_start = 0.01
    cam.data.clip_end = 100
    rot = Euler((math.radians(90 - pitch), 0, math.radians(yaw)), "XYZ")
    cam.rotation_euler = rot
    cam.location = Vector(target) + rot.to_quaternion() @ Vector((0, 0, 10))
    sc.camera = cam
    if sc.world is None:
        w = bpy.data.worlds.get("Deltoid_World") or bpy.data.worlds.new("Deltoid_World")
        w.color = (0.82, 0.82, 0.80)
        sc.world = w
    sc.render.engine = "BLENDER_WORKBENCH"
    sh = sc.display.shading
    sh.light = "STUDIO"
    sh.color_type = "MATERIAL"
    sh.show_cavity = True
    sh.show_shadows = False
    sc.render.resolution_x = res[0]
    sc.render.resolution_y = res[1]
    sc.render.resolution_percentage = 100
    sc.render.image_settings.file_format = "PNG"
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def contact_sheet(prefix, views, **kw):
    """Render several views; returns the written paths."""
    out = []
    for i, v in enumerate(views):
        opts = dict(kw)
        opts.update(v)
        out.append(shot("%s_%d.png" % (prefix, i), **opts))
    return out
