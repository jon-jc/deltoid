"""Landmarks, injection zones, guides, regions and camera views for a patient.

Bony landmarks come from the skeleton (acromion of the scapula, greater
trochanter of the femur, iliac crest and anterior superior iliac spine of
the pelvis) and are projected out to the skin. Zones and guides are then
laid onto the finished body surface, so the overlays the learner sees and
the geometry the app grades against are the same objects.

Naming (prefix is "Adult_" or "Infant_", side suffix _L / _R is the patient's
own left / right):
    Landmark_*   empties on the skin over bony landmarks
    Site_*       empties at the centre of each injection zone
    Zone_*       surface patches (tap targets and visible overlays)
    Guide_*      thin ribbons (thirds of the thigh, armpit level)
    Region_*     empties used to name a tap that misses every zone
    View_*       cube empties; location = centre, scale = half extents
"""

import math

import bmesh
from mathutils import Vector

import anatomy as AN
import deltoid_lib as L

UP = Vector((0, 0, 1))
FRONT = Vector((0, -1, 0))
BACK = Vector((0, 1, 0))


def _perp(v, axis):
    w = Vector(v) - axis * Vector(v).dot(axis)
    return w.normalized()


def _polar_patch(name, sc, bvh, center_fn, n=3.0, nu=32, nv=5, offset=0.0015, mat=None, reach=0.6):
    """Rounded patch. center_fn(a, b) -> (toward, out) for a, b in [-1, 1]."""
    def fn(u, v):
        th = 2 * math.pi * u
        r = v * L.squircle(th, n)
        return center_fn(r * math.cos(th), r * math.sin(th))
    return L.patch_object(name, sc, bvh, fn, nu, nv, offset=offset, mat=mat, reach=reach)


def _ribbons(name, sc, bvh, origin, axis, out_fn, levels, az0, az1, width, offset, mat, steps=44, reach=0.6):
    bm = bmesh.new()
    for t in levels:
        prev = None
        for i in range(steps + 1):
            az = math.radians(az0 + (az1 - az0) * i / steps)
            out = out_fn(az)
            pair = []
            for dt in (-width / 2, width / 2):
                loc, nor = L.surface_hit(bvh, origin + axis * (t + dt), out, reach=reach)
                if loc is None:
                    pair = None
                    break
                if nor.dot(out) < 0:
                    nor = -nor
                pair.append(bm.verts.new(loc + nor * offset))
            if pair is None:
                prev = None
                continue
            if prev is not None:
                bm.faces.new((prev[0], prev[1], pair[1], pair[0]))
            prev = pair
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return L.new_mesh_object(name, bm, sc, mat)


def build(kind, T, JA, J, maps, body, sc, zshift):
    bvh = L.bvh_of(body)
    pre = T["prefix"]
    k = T["k"]
    adult = kind == "adult"
    dz = Vector((0, 0, zshift))
    off = 0.0016 * max(k, 0.6)
    zone_mat = L.material("Deltoid_Zone", L.srgb("#2f8f86"), roughness=0.9, alpha=0.55)
    guide_mat = L.material("Deltoid_Guide", L.srgb("#c2702b"), roughness=0.9)
    info = {}
    # keep ray origins close to the limb so they never start beyond a hand
    R = 0.2 * k
    feat = {name: maps[seg].point(pt) + dz for name, (pt, seg) in AN.features(JA).items()}

    def hit(toward, direction):
        return L.surface_hit(bvh, toward, direction, reach=R)

    # the forearm hangs close to the hip, so hip rays start nearer the skin
    Rh = 0.08 * k

    def hip_hit(toward, direction):
        return L.surface_hit(bvh, toward, direction, reach=Rh)

    def empty(name, loc, size=0.02):
        return L.add_empty(pre + name, loc, sc, size=size * k)

    def r4(v):
        return tuple(round(c, 4) for c in v)

    for side, tag in ((1, "L"), (-1, "R")):
        def m(v):
            v = Vector(v)
            return Vector((v.x * side, v.y, v.z))

        lat = Vector((side, 0, 0))
        ua, fa, th, cf = m(J["ua"]), m(J["fa"]), m(J["th"]), m(J["cf"])
        S, E, W, H, K, A = (m(J[j]) + dz for j in ("GH", "E", "W", "HJ", "K", "A"))
        n_ua, f_ua = _perp(lat, ua), _perp(FRONT, ua)
        n_fa, f_fa = _perp(lat, fa), _perp(FRONT, fa)
        n_th, f_th = _perp(lat, th), _perp(FRONT, th)

        # ---------------- shoulder and upper arm
        ac, _ = hit(m(feat["acromion"]) - UP * 0.004 * k, lat * 0.35 + UP * 0.94)
        empty("Landmark_Acromion_" + tag, ac)

        apex = None
        x0 = abs(S.x)
        for i in range(160):
            x = side * (x0 * 0.55 + x0 * 0.85 * i / 159)
            loc, _n, _i, _d = bvh.ray_cast(Vector((x, S.y, H.z)), UP, 2.0)
            if loc is not None and loc.z < S.z - 0.012 * k:
                if apex is None or loc.z > apex.z:
                    apex = loc.copy()
        fold, _ = hit(apex + BACK * 0.01 * k, FRONT)
        empty("Landmark_AxillaryFold_" + tag, fold)

        t_ac = (ac - S).dot(ua)
        t_ax = (apex - S).dot(ua)
        if adult:
            # CDC: about 2 inches below the acromion and above the armpit
            t_c = t_ac + 2 * L.INCH
            t_apex = t_ax
            t_base = t_c - (t_apex - t_c) / 2
        else:
            t_base = t_ac + 0.18 * (t_ax - t_ac)
            t_apex = t_ax
            t_c = t_base + (t_apex - t_base) / 3
        half_w = 0.62 * T["arm"][1][3]

        def delt_fn(u, v):
            t = t_apex + (t_base - t_apex) * v
            w = (u - 0.5) * 2 * half_w * v
            return S + ua * t + f_ua * w, n_ua

        L.patch_object(pre + "Zone_Deltoid_" + tag, sc, bvh, delt_fn, 10, 10, offset=off, mat=zone_mat, reach=R)
        site, _ = hit(S + ua * t_c, n_ua)
        empty("Site_Deltoid_" + tag, site)

        _ribbons(pre + "Guide_ArmpitLevel_" + tag, sc, bvh, S, ua,
                 lambda az: n_ua * math.cos(az) + f_ua * math.sin(az),
                 [t_ax], -75, 75, 0.0028 * k, off * 0.9, guide_mat, steps=26, reach=R)

        # upper outer triceps area (subcutaneous)
        tc = 0.53 * J["ua_len"]
        ht = 0.16 * J["ua_len"]
        az0, span = math.radians(60), math.radians(34)

        def tri_fn(a, b):
            az = az0 + a * span
            return S + ua * (tc + b * ht), n_ua * math.cos(az) - f_ua * math.sin(az)

        _polar_patch(pre + "Zone_Triceps_" + tag, sc, bvh, tri_fn, n=3.0, offset=off, mat=zone_mat, reach=R)
        site, _ = hit(S + ua * tc, n_ua * math.cos(az0) - f_ua * math.sin(az0))
        empty("Site_Triceps_" + tag, site)

        # ---------------- forearm (inner surface)
        elbow, _ = hit(E, f_fa)
        empty("Landmark_Elbow_" + tag, elbow)
        if adult:
            # CDC: 2 to 4 inches below the elbow joint, palm side up
            f0, f1 = 2 * L.INCH, 4 * L.INCH
        else:
            f0, f1 = 0.25 * J["fa_len"], 0.50 * J["fa_len"]
        fc, fh = (f0 + f1) / 2, (f1 - f0) / 2
        fspan = math.radians(40)

        def fore_fn(a, b):
            az = a * fspan
            return E + fa * (fc + b * fh), f_fa * math.cos(az) + n_fa * math.sin(az)

        _polar_patch(pre + "Zone_Forearm_" + tag, sc, bvh, fore_fn, n=4.0, offset=off, mat=zone_mat, reach=R)
        site, _ = hit(E + fa * fc, f_fa)
        empty("Site_Forearm_" + tag, site)

        # ---------------- thigh
        gt, _ = hip_hit(m(feat["greater_trochanter"]) - lat * 0.004 * k, lat)
        lc, _ = hit(m(feat["lateral_condyle"]) - lat * 0.004 * k, lat)
        empty("Landmark_GreaterTrochanter_" + tag, gt)
        empty("Landmark_LateralCondyle_" + tag, lc)
        t_gt = (gt - H).dot(th)
        t_lc = (lc - H).dot(th)
        third = (t_lc - t_gt) / 3
        t1, t2 = t_gt + third, t_gt + 2 * third
        zc = (t1 + t2) / 2
        zaz, zspan = math.radians(50), math.radians(30)

        def th_out(az):
            return f_th * math.cos(az) + n_th * math.sin(az)

        def thigh_fn(a, b):
            return H + th * (zc + b * third / 2), th_out(zaz + a * zspan)

        _polar_patch(pre + "Zone_VastusLateralis_" + tag, sc, bvh, thigh_fn, n=4.0, offset=off, mat=zone_mat, reach=R)
        site, _ = hit(H + th * zc, th_out(zaz))
        empty("Site_VastusLateralis_" + tag, site)
        for nm, t in (("Landmark_ThighThirdUpper_", t1), ("Landmark_ThighThirdLower_", t2)):
            p, _ = hit(H + th * t, th_out(math.radians(90)))
            empty(nm + tag, p)
        _ribbons(pre + "Guide_ThighThirds_" + tag, sc, bvh, H, th, th_out,
                 [t_gt, t1, t2, t_lc], -30, 150, 0.0028 * k, off * 0.9, guide_mat, reach=R)

        # ---------------- hip
        crest, _ = hip_hit(m(feat["iliac_tubercle"]) - lat * 0.004 * k, lat + UP * 0.2)
        asis, _ = hip_hit(m(feat["asis"]) - lat * 0.003 * k, lat * 0.55 + FRONT * 0.83)
        gt_up, _ = hip_hit(m(feat["greater_trochanter_top"]) - lat * 0.004 * k, lat * 0.9 + UP * 0.4)
        empty("Landmark_IliacCrest_" + tag, crest)
        empty("Landmark_ASIS_" + tag, asis)
        nrm = (asis - gt_up).cross(crest - gt_up).normalized()
        if nrm.dot(lat) < 0:
            nrm = -nrm

        def vg_fn(u, v):
            p = gt_up.lerp(asis.lerp(crest, u), v)
            return p - nrm * 0.03 * k, nrm

        L.patch_object(pre + "Zone_Ventrogluteal_" + tag, sc, bvh, vg_fn, 10, 10, offset=off, mat=zone_mat, reach=Rh)
        cen = (gt_up + asis + crest) / 3
        site, _ = hip_hit(cen - nrm * 0.03 * k, nrm)
        empty("Site_Ventrogluteal_" + tag, site)

        tm = maps["torso"]
        g0 = Vector((0.078, 0.070, 0.905))
        gcen = m(tm.point(g0)) + dz
        gw = (tm.point(g0 + Vector((0.055, 0, 0))) - tm.point(g0)).length
        gh = (tm.point(g0 + Vector((0, 0, 0.072))) - tm.point(g0)).length
        bout = (BACK + lat * 0.2).normalized()

        def but_fn(a, b):
            return gcen + lat * (a * gw) + UP * (b * gh), bout

        _polar_patch(pre + "Zone_Buttock_" + tag, sc, bvh, but_fn, n=2.5, offset=off, mat=zone_mat, reach=R)
        site, _ = hit(gcen, bout)
        empty("Site_Buttock_" + tag, site)

        # ---------------- regions (nearest one names a tap outside every zone)
        regions = [
            ("Shoulder", S + UP * 0.03 * k), ("UpperArm_a", S + ua * 0.35 * J["ua_len"]),
            ("UpperArm_b", S + ua * 0.72 * J["ua_len"]), ("Elbow", E),
            ("Forearm_a", E + fa * 0.33 * J["fa_len"]), ("Forearm_b", E + fa * 0.7 * J["fa_len"]),
            ("Wrist", W), ("Hand", W + fa * 0.09 * maps["hand"].rs),
            ("Hip", H + lat * 0.5 * T["leg"][1][2]), ("Buttock", gcen),
            ("ThighUpper", H + th * (t_gt + third / 2)), ("ThighMiddle", H + th * zc),
            ("ThighLower", H + th * (t2 + third / 2)), ("Knee", K),
            ("LowerLeg_a", K + cf * 0.3 * J["cf_len"]), ("LowerLeg_b", K + cf * 0.7 * J["cf_len"]),
            ("Ankle", A), ("Foot", A + FRONT * 0.08 * maps["foot"].rs - UP * 0.5 * A.z),
        ]
        for nm, p in regions:
            empty("Region_%s_%s" % (nm, tag), p, size=0.012)

        # ---------------- camera views (cube empties: scale = half extents)
        def box(name, lo, hi, pad):
            lo, hi = Vector(lo), Vector(hi)
            mn = Vector((min(lo.x, hi.x), min(lo.y, hi.y), min(lo.z, hi.z))) - Vector((pad, pad, pad))
            mx = Vector((max(lo.x, hi.x), max(lo.y, hi.y), max(lo.z, hi.z))) + Vector((pad, pad, pad))
            L.add_empty(pre + name, (mn + mx) / 2, sc, kind="CUBE", size=1.0, scale=(mx - mn) / 2)

        box("View_Arm_" + tag, ac, W, 0.07 * k)
        box("View_Thigh_" + tag, gt, lc - lat * 0.1 * k, 0.07 * k)
        box("View_Hip_" + tag, crest, gt - lat * 0.08 * k, 0.09 * k)

        if side == 1:
            info.update(
                acromion=r4(ac), armpit=r4(apex), acromion_to_armpit=round(t_ax - t_ac, 4),
                delt_base_below_acromion=round(t_base - t_ac, 4), gt=r4(gt), lc=r4(lc),
                thigh_third=round(third, 4), crest=r4(crest), asis=r4(asis), elbow=r4(elbow),
            )

    # ---------------- midline regions and whole-figure views
    for nm, p in T["mid_regions"]:
        empty("Region_" + nm, Vector(p) + dz, size=0.012)

    h = max(v.co.z for v in body.data.vertices)
    reach = max(abs(v.co.x) for v in body.data.vertices)
    depth = max(abs(v.co.y) for v in body.data.vertices)
    L.add_empty(pre + "View_Body", (0, 0, h / 2), sc, kind="CUBE", size=1.0,
                scale=(reach + 0.02 * k, depth, h / 2 + 0.02 * k))
    knee_z = J["K"].z + dz.z - 0.06 * k
    L.add_empty(pre + "View_Case", (0, 0, (h + knee_z) / 2), sc, kind="CUBE", size=1.0,
                scale=(reach + 0.01 * k, depth, (h - knee_z) / 2 + 0.01 * k))
    info["height"] = round(h, 4)
    info["objects"] = sum(1 for o in sc.collection.all_objects if o.name.startswith(pre))
    return info
