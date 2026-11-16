"""Build the adult and infant patient figures with their anatomy.

Usage inside Blender:
    import build_patient
    build_patient.build("adult")      # or "infant"

Outer surface: lofted trunk and limbs, superficial muscles and bony points
(inflated by a skin allowance), hands with fingers and feet with toes are
fused with a voxel remesh, smoothed, retopologised to quads (QuadriFlow),
subdivided once and shrink-wrapped back onto the high-resolution surface.

Under the surface: a skeleton and the muscles and nerve that matter for
injections, each as its own named mesh.
"""

import bmesh
import bpy
from mathutils import Vector

import anatomy as AN
import deltoid_lib as L

# skin allowance (metres, adult) over the structures that shape the surface
SKIN_OVER_MUSCLE = dict(Deltoid=0.008, Triceps=0.005, VastusLateralis=0.005, RectusFemoris=0.005,
                        GluteusMedius=0.006, GluteusMaximus=0.007)
SKIN_OVER_BONE = dict(Clavicle=0.006, Scapula=0.004, Pelvis=0.006, Femur=0.007, Patella=0.004,
                      Tibia=0.004, Fibula=0.005, Humerus=0.004, Ulna=0.003, Radius=0.003)


def tables(kind):
    if kind == "adult":
        return dict(
            prefix="Adult_", scene="Deltoid_Adult", k=1.0,
            voxel=0.0030, smooth=2, core_voxel=0.0040, core_smooth=14, faces=32000, bone_voxel=0.0016,
            # z, half-width, half-depth, y centre
            torso=[
                (0.795, 0.055, 0.055, 0.004), (0.825, 0.134, 0.094, 0.006),
                (0.880, 0.176, 0.110, 0.008), (0.940, 0.172, 0.108, 0.008),
                (1.000, 0.158, 0.100, 0.004), (1.065, 0.142, 0.092, 0.000),
                (1.130, 0.146, 0.094, -0.002), (1.200, 0.153, 0.101, -0.003),
                (1.270, 0.160, 0.107, -0.002), (1.330, 0.160, 0.104, 0.000),
                (1.365, 0.150, 0.096, 0.004), (1.400, 0.122, 0.082, 0.008),
                (1.435, 0.082, 0.066, 0.012), (1.470, 0.058, 0.056, 0.012),
                (1.510, 0.052, 0.053, 0.010), (1.550, 0.050, 0.052, 0.008),
                (1.590, 0.046, 0.048, 0.006),
            ],
            arm=[
                ("ua", 0.00, 0.040, 0.044), ("ua", 0.30, 0.046, 0.050), ("ua", 0.60, 0.044, 0.046),
                ("ua", 0.90, 0.040, 0.040), ("ua", 1.00, 0.040, 0.036), ("fa", 0.15, 0.043, 0.037),
                ("fa", 0.40, 0.040, 0.033), ("fa", 0.80, 0.030, 0.023), ("fa", 1.00, 0.028, 0.019),
                ("fa", 1.06, 0.029, 0.018),
            ],
            leg=[
                ("th", -0.14, 0.052, 0.062, 0.0), ("th", -0.03, 0.080, 0.088, 0.0),
                ("th", 0.10, 0.087, 0.093, 0.0), ("th", 0.25, 0.086, 0.093, 0.0),
                ("th", 0.50, 0.075, 0.081, 0.0), ("th", 0.80, 0.061, 0.065, 0.0),
                ("th", 1.00, 0.054, 0.057, 0.0), ("cf", 0.10, 0.051, 0.054, 0.002),
                ("cf", 0.30, 0.048, 0.053, 0.006), ("cf", 0.60, 0.040, 0.043, 0.004),
                ("cf", 0.88, 0.032, 0.036, 0.0), ("cf", 1.00, 0.031, 0.037, 0.0),
                ("cf", 1.06, 0.031, 0.037, 0.0),
            ],
            mid_regions=[
                ("Head", (0, -0.004, 1.60)), ("Neck", (0, 0.0, 1.47)),
                ("Chest_a", (0.09, -0.09, 1.28)), ("Chest_b", (-0.09, -0.09, 1.28)),
                ("UpperBack_a", (0.09, 0.09, 1.30)), ("UpperBack_b", (-0.09, 0.09, 1.30)),
                ("Abdomen_a", (0.07, -0.08, 1.08)), ("Abdomen_b", (-0.07, -0.08, 1.08)),
                ("LowerBack_a", (0.07, 0.08, 1.08)), ("LowerBack_b", (-0.07, 0.08, 1.08)),
                ("Groin", (0, -0.08, 0.85)),
            ],
        )
    if kind == "infant":
        return dict(
            prefix="Infant_", scene="Deltoid_Infant", k=0.40,
            voxel=0.0014, smooth=2, core_voxel=0.0018, core_smooth=12, faces=26000, bone_voxel=0.0008,
            torso=[
                (0.228, 0.030, 0.030, 0.002), (0.245, 0.064, 0.054, 0.003),
                (0.275, 0.083, 0.068, 0.004), (0.310, 0.084, 0.072, 0.000),
                (0.355, 0.084, 0.076, -0.006), (0.400, 0.080, 0.071, -0.004),
                (0.440, 0.077, 0.066, 0.000), (0.470, 0.068, 0.056, 0.002),
                (0.490, 0.046, 0.042, 0.003), (0.505, 0.036, 0.036, 0.003),
                (0.530, 0.034, 0.034, 0.003),
            ],
            arm=[
                ("ua", 0.00, 0.031, 0.032), ("ua", 0.30, 0.033, 0.034), ("ua", 0.70, 0.030, 0.031),
                ("ua", 1.00, 0.027, 0.028), ("fa", 0.25, 0.029, 0.028), ("fa", 0.60, 0.026, 0.024),
                ("fa", 1.00, 0.020, 0.017), ("fa", 1.08, 0.020, 0.014),
            ],
            leg=[
                ("th", -0.10, 0.044, 0.046, 0.0), ("th", 0.00, 0.048, 0.050, 0.0),
                ("th", 0.30, 0.049, 0.051, 0.0), ("th", 0.70, 0.042, 0.044, 0.0),
                ("th", 1.00, 0.035, 0.037, 0.0), ("cf", 0.15, 0.033, 0.035, 0.001),
                ("cf", 0.35, 0.034, 0.036, 0.004), ("cf", 0.70, 0.027, 0.028, 0.001),
                ("cf", 1.00, 0.023, 0.025, 0.0), ("cf", 1.08, 0.023, 0.025, 0.0),
            ],
            mid_regions=[
                ("Head", (0, -0.004, 0.592)), ("Neck", (0, 0.0, 0.512)),
                ("Chest_a", (0.035, -0.055, 0.44)), ("Chest_b", (-0.035, -0.055, 0.44)),
                ("UpperBack_a", (0.035, 0.055, 0.44)), ("UpperBack_b", (-0.035, 0.055, 0.44)),
                ("Abdomen_a", (0.035, -0.065, 0.355)), ("Abdomen_b", (-0.035, -0.065, 0.355)),
                ("LowerBack_a", (0.035, 0.06, 0.35)), ("LowerBack_b", (-0.035, 0.06, 0.35)),
                ("Groin", (0, -0.05, 0.25)),
            ],
        )
    raise ValueError(kind)


def setup(kind):
    T = tables(kind)
    AN.HAND_SPLAY, AN.FINGER_GROW = (1.0, 1.0) if kind == "adult" else (0.25, 1.3)
    JA = AN.joints()
    if kind == "adult":
        J, maps = JA, AN.adult_maps()
    else:
        J, maps = AN.infant_setup(JA)
    maps["raw"] = AN.Ident()
    return T, JA, J, maps


def _voxel(ob, size, smooth):
    L.select_only(ob)
    mod = ob.modifiers.new("vox", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = size
    mod.adaptivity = 0.0
    L.apply_modifier(ob, "vox")
    if smooth:
        sm = ob.modifiers.new("sm", "SMOOTH")
        sm.factor = 0.5
        sm.iterations = smooth
        L.apply_modifier(ob, "sm")


def build_body(T, JA, J, maps, sc):
    """Two passes: trunk, limbs and soft tissue are fused and blended
    heavily; hands, feet and ears are then fused on with a light touch so
    fingers and toes stay crisp."""
    bm = bmesh.new()
    L.add_tube(bm, [(Vector((0, yc, z)), rx, ry) for z, rx, ry, yc in T["torso"]], seg=40)
    AN.emit(bm, AN.limb_tubes(J, T), maps)
    AN.emit(bm, AN.head_ops(), maps, seg_n=24)
    AN.emit(bm, AN.soft_tissue(JA, shoulders=T["k"] == 1.0), maps, seg_n=18)
    scale = 1.0 if T["k"] == 1.0 else 0.5
    B, M = AN.bones(JA), AN.muscles(JA)
    for name, infl in SKIN_OVER_MUSCLE.items():
        AN.emit(bm, M[name][0], maps, inflate=infl * scale, seg_n=12)
    for name, infl in SKIN_OVER_BONE.items():
        AN.emit(bm, B[name][0], maps, inflate=infl * scale, seg_n=12)
    L.mirror_x(bm)
    mat = L.material("Deltoid_Skin", L.srgb("#c5cfcb"), roughness=0.75)
    ob = L.new_mesh_object(T["prefix"] + "Body", bm, sc, mat)
    _voxel(ob, T["core_voxel"], T["core_smooth"])

    bm = bmesh.new()
    bm.from_mesh(ob.data)
    fine = bmesh.new()
    AN.emit(fine, AN.extremities(JA), maps, seg_n=16)
    L.mirror_x(fine)
    tmp = bpy.data.meshes.new("Tmp_fine")
    fine.to_mesh(tmp)
    fine.free()
    bm.from_mesh(tmp)
    bpy.data.meshes.remove(tmp)
    bm.to_mesh(ob.data)
    bm.free()
    ob.data.update()
    return ob


def finalize_body(ob, T, sc):
    _voxel(ob, T["voxel"], T["smooth"])

    hires = ob.copy()
    hires.data = ob.data.copy()
    hires.name = "Tmp_Hires"
    sc.collection.objects.link(hires)

    # QuadriFlow occasionally leaves a small hole; try seeds until one is clean
    best = None
    for seed in (7, 1, 3, 11, 19, 23, 31, 42):
        cand = hires.copy()
        cand.data = hires.data.copy()
        cand.name = "Tmp_Retopo"
        sc.collection.objects.link(cand)
        # keep the figure's left half, retopologise it with the cut edge
        # preserved, then mirror and weld so both sides match exactly
        bm = bmesh.new()
        bm.from_mesh(cand.data)
        bmesh.ops.bisect_plane(bm, geom=list(bm.verts) + list(bm.edges) + list(bm.faces),
                               plane_co=(0, 0, 0), plane_no=(1, 0, 0), clear_inner=True)
        bm.to_mesh(cand.data)
        bm.free()
        L.select_only(cand)
        bpy.ops.object.quadriflow_remesh(
            use_mesh_symmetry=False, use_preserve_sharp=False, use_preserve_boundary=True,
            smooth_normals=False, mode="FACES", target_faces=T["faces"] // 2, seed=seed)
        bm = bmesh.new()
        bm.from_mesh(cand.data)
        seam = {v for e in bm.edges if len(e.link_faces) == 1 for v in e.verts}
        off_plane = max((abs(v.co.x) for v in seam), default=0.0)
        for v in seam:
            v.co.x = 0.0
        L.mirror_x(bm)
        bmesh.ops.remove_doubles(bm, verts=[v for v in bm.verts if v.co.x == 0.0], dist=1e-6)
        holes = sum(1 for e in bm.edges if len(e.link_faces) != 2)
        if off_plane > 0.004:
            holes += 1000
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(cand.data)
        bm.free()
        if best is None or holes < best[1]:
            if best is not None:
                old = best[0].data
                bpy.data.objects.remove(best[0], do_unlink=True)
                bpy.data.meshes.remove(old)
            best = (cand, holes, seed)
        else:
            old = cand.data
            bpy.data.objects.remove(cand, do_unlink=True)
            bpy.data.meshes.remove(old)
        if best[1] == 0:
            break
    cand, open_edges, seed = best
    old = ob.data
    ob.data = cand.data
    ob.data.name = ob.name
    bpy.data.objects.remove(cand, do_unlink=True)
    bpy.data.meshes.remove(old)
    if open_edges:
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bmesh.ops.holes_fill(bm, edges=[e for e in bm.edges if len(e.link_faces) == 1], sides=12)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(ob.data)
        bm.free()
    T["retopo_seed"] = seed

    sw = ob.modifiers.new("wrap", "SHRINKWRAP")
    sw.target = hires
    sw.wrap_method = "NEAREST_SURFACEPOINT"
    L.apply_modifier(ob, "wrap")
    cs = ob.modifiers.new("relax", "CORRECTIVE_SMOOTH")
    cs.factor = 0.5
    cs.iterations = 2
    cs.use_only_smooth = True
    L.apply_modifier(ob, "relax")

    me = hires.data
    bpy.data.objects.remove(hires, do_unlink=True)
    bpy.data.meshes.remove(me)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.data.update()
    return open_edges


def _solidify(ob, voxel, smooth, tris):
    L.select_only(ob)
    mod = ob.modifiers.new("vox", "REMESH")
    mod.mode = "VOXEL"
    mod.voxel_size = voxel
    mod.adaptivity = 0.0
    L.apply_modifier(ob, "vox")
    if smooth:
        sm = ob.modifiers.new("sm", "SMOOTH")
        sm.factor = 0.5
        sm.iterations = smooth
        L.apply_modifier(ob, "sm")
    now = sum(len(p.vertices) - 2 for p in ob.data.polygons)
    if now > tris:
        dec = ob.modifiers.new("dec", "DECIMATE")
        dec.ratio = tris / now
        L.apply_modifier(ob, "dec")
    for p in ob.data.polygons:
        p.use_smooth = True


def _mirrored_copy(ob, name, sc):
    cp = ob.copy()
    cp.data = ob.data.copy()
    cp.name = name
    cp.data.name = name
    sc.collection.objects.link(cp)
    bm = bmesh.new()
    bm.from_mesh(cp.data)
    for v in bm.verts:
        v.co.x = -v.co.x
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
    bm.to_mesh(cp.data)
    bm.free()
    return cp


def build_anatomy(T, JA, maps, sc):
    pre = T["prefix"]
    tri_scale = 0.75 if T["k"] == 1.0 else 0.48
    bone_mat = L.material("Deltoid_Bone", L.srgb("#e9e2d0"), roughness=0.55)
    muscle_mat = L.material("Deltoid_Muscle", L.srgb("#b4554b"), roughness=0.6)
    nerve_mat = L.material("Deltoid_Nerve", L.srgb("#e3c64a"), roughness=0.5)
    made = []
    for name, (ops, paired, tris) in AN.bones(JA).items():
        bm = bmesh.new()
        AN.emit(bm, ops, maps, seg_n=14)
        if paired is False:
            L.mirror_x(bm)
        base = pre + "Bone_" + name
        ob = L.new_mesh_object(base + ("_L" if paired else ""), bm, sc, bone_mat)
        _solidify(ob, T["bone_voxel"], 2, int(tris * tri_scale))
        made.append(ob.name)
        if paired:
            made.append(_mirrored_copy(ob, base + "_R", sc).name)
    for name, (ops, tris) in AN.muscles(JA).items():
        bm = bmesh.new()
        AN.emit(bm, ops, maps, seg_n=14)
        nerve = name == "SciaticNerve"
        base = pre + ("Nerve_Sciatic" if nerve else "Muscle_" + name)
        ob = L.new_mesh_object(base + "_L", bm, sc, nerve_mat if nerve else muscle_mat)
        _solidify(ob, T["bone_voxel"] * (1.0 if nerve else 1.5), 3, int(tris * tri_scale))
        made.append(ob.name)
        made.append(_mirrored_copy(ob, base + "_R", sc).name)
    return made


_RAYS = [Vector(d).normalized() for d in ((0.37, 0.53, 0.76), (-0.61, 0.33, -0.72), (0.21, -0.88, 0.43))]


def _inside(bvh, p):
    """Ray parity test (majority of three rays): is the point inside the
    closed body surface?"""
    votes = 0
    for d in _RAYS:
        o = Vector(p)
        n = 0
        for _ in range(64):
            loc, _nor, _i, _d = bvh.ray_cast(o, d, 10.0)
            if loc is None:
                break
            n += 1
            o = loc + d * 1e-5
        votes += n % 2
    return votes >= 2


def enclosure(body, names):
    """How far each inner mesh sits below the skin (negative = pokes out)."""
    bvh = L.bvh_of(body)
    report = {}
    for nm in names:
        ob = bpy.data.objects[nm]
        worst, where, count = 1.0, None, 0
        for v in ob.data.vertices:
            loc, _nor, _i, dist = bvh.find_nearest(v.co)
            depth = dist
            if dist < 0.02 and not _inside(bvh, v.co):
                depth = -dist
            if depth < 0.0008:
                count += 1
            if depth < worst:
                worst, where = depth, v.co.copy()
        report[nm] = (round(worst, 4), count, tuple(round(c, 3) for c in where))
    return report


def tuck(body, names, depth):
    """Nudge any inner vertex that sits shallower than `depth` back under
    the skin, so nothing shows through the surface."""
    bvh = L.bvh_of(body)
    moved = 0
    for nm in names:
        ob = bpy.data.objects[nm]
        for v in ob.data.vertices:
            loc, nor, _i, dist = bvh.find_nearest(v.co)
            if dist < depth or (dist < 0.02 and not _inside(bvh, v.co)):
                v.co = loc - nor * depth
                moved += 1
        ob.data.update()
    return moved


def ground(T, J, sc):
    """Sit the soles on z = 0; returns the shift applied."""
    pre = T["prefix"]
    body = bpy.data.objects[pre + "Body"]
    zmin = min(v.co.z for v in body.data.vertices)
    for ob in sc.collection.all_objects:
        if ob.name.startswith(pre) and ob.type == "MESH":
            for v in ob.data.vertices:
                v.co.z -= zmin
            ob.data.update()
    return -zmin


def build(kind, stage="all"):
    T, JA, J, maps = setup(kind)
    sc = L.activate(L.get_scene(T["scene"]))
    L.clear_prefixed(sc, T["prefix"])
    L.clear_prefixed(sc, "Tmp_")
    body = build_body(T, JA, J, maps, sc)
    if stage == "raw":
        return {"body": body.name, "verts": len(body.data.vertices)}
    open_edges = finalize_body(body, T, sc)
    out = {
        "verts": len(body.data.vertices), "faces": len(body.data.polygons),
        "quads": sum(1 for p in body.data.polygons if len(p.vertices) == 4),
        "holes_after_retopo": open_edges, "retopo_seed": T.get("retopo_seed"),
    }
    if stage == "body":
        out["zshift"] = ground(T, J, sc)
        return out
    made = build_anatomy(T, JA, maps, sc)
    out["anatomy_objects"] = len(made)
    out["anatomy_tris"] = sum(sum(len(p.vertices) - 2 for p in bpy.data.objects[n].data.polygons) for n in made)
    enc = enclosure(body, made)
    out["poking_out"] = {k: v for k, v in enc.items() if v[0] < 0.0008 and not k.endswith("_R")}
    out["tucked_vertices"] = tuck(body, made, 0.0015 * max(T["k"], 0.5))
    out["zshift"] = ground(T, J, sc)
    if stage == "anatomy":
        return out
    import build_landmarks
    out["landmarks"] = build_landmarks.build(kind, T, JA, J, maps, body, sc, out["zshift"])
    return out
