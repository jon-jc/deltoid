"""Anatomy definitions for the Deltoid patient figures.

Everything is written once, for the adult, in metres (Z up, figure facing
-Y, the patient's left side at +X). The infant reuses the same definitions
through per-segment maps that move and scale each piece onto the infant's
joints, so both figures share one anatomical description.

Three kinds of content come out of this module:
    bones(J)    separate skeleton meshes (humerus, scapula with acromion,
                pelvis with iliac crest and anterior superior iliac spine,
                femur with greater trochanter, ...)
    muscles(J)  the muscles and nerve that matter for injections
    limb_tubes, head_ops, skin_shaping
                the volumes fused into the outer body surface. Superficial
                muscles and bony points are added on top by the build script,
                inflated by a skin allowance, so the surface always encloses
                what lies under it.
"""

import math

from mathutils import Matrix, Vector

import deltoid_lib as L

UP = Vector((0, 0, 1))
FRONT = Vector((0, -1, 0))
BACK = Vector((0, 1, 0))
LAT = Vector((1, 0, 0))


def V(x, y, z):
    return Vector((x, y, z))


def perp(v, axis):
    w = Vector(v) - axis * Vector(v).dot(axis)
    return w.normalized()


def aim(abduct_deg, fwd):
    a = math.radians(abduct_deg)
    return Vector((math.sin(a), fwd, -math.cos(a))).normalized()


# ------------------------------------------------------------------ ops

class Ops(list):
    """A list of primitive volumes, each tagged with a body segment."""

    def __init__(self, seg):
        super().__init__()
        self.seg = seg

    def ball(self, c, r, axes=None, seg=None):
        self.append(("ball", seg or self.seg, Vector(c), r, axes))

    def limb(self, p1, r1, p2, r2, seg=None):
        self.append(("limb", seg or self.seg, Vector(p1), r1, Vector(p2), r2))

    def tube(self, secs, ref=LAT, sub=4, n=20, segs=None, seg=None):
        s = seg or self.seg
        pts = []
        for i, (c, rx, ry) in enumerate(secs):
            pts.append((Vector(c), rx, ry, segs[i] if segs else s))
        self.append(("tube", s, pts, Vector(ref), sub, n))

    def slab(self, grid, th, seg=None):
        self.append(("slab", seg or self.seg, [[Vector(p) for p in row] for row in grid], th))


class Ident:
    rs = 1.0

    def point(self, p):
        return Vector(p)

    def vec(self, v):
        return Vector(v)


class Axial:
    """Maps a limb segment: origin + axis, with separate length and girth scale."""

    def __init__(self, o_a, ax_a, o_i, ax_i, ls, gs):
        self.o_a, self.ax_a, self.o_i, self.ax_i = Vector(o_a), Vector(ax_a), Vector(o_i), Vector(ax_i)
        self.ls, self.rs = ls, gs
        self.rot = self.ax_a.rotation_difference(self.ax_i).to_matrix()

    def point(self, p):
        d = Vector(p) - self.o_a
        a = d.dot(self.ax_a)
        q = d - self.ax_a * a
        return self.o_i + self.ax_i * (a * self.ls) + (self.rot @ q) * self.rs

    def vec(self, v):
        return self.rot @ Vector(v)


class Affine:
    """Maps the trunk: independent scale in width, depth and height."""

    def __init__(self, sx, sy, sz, z0_a, z0_i):
        self.sx, self.sy, self.sz, self.z0_a, self.z0_i = sx, sy, sz, z0_a, z0_i
        self.rs = (sx + sy + sz) / 3

    def point(self, p):
        return Vector((p[0] * self.sx, p[1] * self.sy, self.z0_i + (p[2] - self.z0_a) * self.sz))

    def vec(self, v):
        return Vector((v[0] * self.sx, v[1] * self.sy, v[2] * self.sz)).normalized()


class Uniform:
    def __init__(self, c_a, c_i, s):
        self.c_a, self.c_i, self.rs = Vector(c_a), Vector(c_i), s

    def point(self, p):
        return self.c_i + (Vector(p) - self.c_a) * self.rs

    def vec(self, v):
        return Vector(v)


def emit(bm, ops, maps, inflate=0.0, grow=1.0, seg_n=16):
    """Add ops to a bmesh through the segment maps. `inflate` adds a fixed
    allowance to every radius, `grow` scales radii."""
    for op in ops:
        kind, seg = op[0], op[1]
        m = maps[seg]
        if kind == "ball":
            c, r, axes = op[2], op[3], op[4]
            if not hasattr(r, "__len__"):
                r = (r, r, r)
            rr = [x * m.rs * grow + inflate for x in r]
            rot = None
            if axes is not None:
                ex = m.vec(axes[0]).normalized()
                ey = m.vec(axes[1])
                ey = (ey - ex * ey.dot(ex)).normalized()
                ez = ex.cross(ey)
                rot = Matrix((ex, ey, ez)).transposed().to_4x4()
            L.add_ball(bm, m.point(c), rr, rot=rot, seg=seg_n)
        elif kind == "limb":
            L.add_limb(bm, m.point(op[2]), op[3] * m.rs * grow + inflate,
                       m.point(op[4]), op[5] * m.rs * grow + inflate, seg=seg_n)
        elif kind == "tube":
            secs = []
            for c, rx, ry, sg in op[2]:
                mm = maps[sg]
                secs.append((mm.point(c), rx * mm.rs * grow + inflate, ry * mm.rs * grow + inflate))
            L.add_tube(bm, secs, seg=op[5], sub=op[4], ref=m.vec(op[3]))
        elif kind == "slab":
            grid = [[m.point(p) for p in row] for row in op[2]]
            L.add_slab(bm, grid, op[3] * m.rs * grow + 2 * inflate)


# --------------------------------------------------------------- joints

def joints(kind="adult"):
    J = dict(
        GH=V(0.172, 0.008, 1.357), ua=aim(28, -0.03), ua_len=0.300,
        fa=aim(22, -0.10), fa_len=0.255,
        HJ=V(0.088, 0.002, 0.892), K=V(0.098, -0.008, 0.487), A=V(0.106, 0.012, 0.085),
    )
    _derive(J)
    return J


def _derive(J):
    J["E"] = J["GH"] + J["ua"] * J["ua_len"]
    J["W"] = J["E"] + J["fa"] * J["fa_len"]
    if "th" not in J:
        d = J["K"] - J["HJ"]
        J["th"], J["th_len"] = d.normalized(), d.length
        d = J["A"] - J["K"]
        J["cf"], J["cf_len"] = d.normalized(), d.length
    else:
        J["K"] = J["HJ"] + J["th"] * J["th_len"]
        J["A"] = J["K"] + J["cf"] * J["cf_len"]
    for key in ("ua", "fa", "th", "cf"):
        J["n_" + key] = perp(LAT, J[key])
        J["f_" + key] = perp(FRONT, J[key])
    return J


def infant_setup(JA):
    """Infant joints and the maps that carry adult anatomy onto them."""
    torso = Affine(0.49, 0.66, 0.42, 0.795, 0.228)
    JI = dict(
        GH=torso.point(JA["GH"]), ua=aim(42, -0.03), ua_len=0.105,
        fa=aim(34, -0.10), fa_len=0.095,
        HJ=torso.point(JA["HJ"]), th=aim(19, -0.05), th_len=0.125,
        cf=aim(7, 0.03), cf_len=0.110,
    )
    _derive(JI)
    maps = dict(
        torso=torso,
        head=Uniform(V(0, 0.005, 1.600), V(0, 0.003, 0.592), 0.76),
        ua=Axial(JA["GH"], JA["ua"], JI["GH"], JI["ua"], JI["ua_len"] / JA["ua_len"], 0.56),
        fa=Axial(JA["E"], JA["fa"], JI["E"], JI["fa"], JI["fa_len"] / JA["fa_len"], 0.56),
        hand=Axial(JA["W"], JA["fa"], JI["W"], JI["fa"], 0.36, 0.48),
        th=Axial(JA["HJ"], JA["th"], JI["HJ"], JI["th"], JI["th_len"] / JA["th_len"], 0.52),
        cf=Axial(JA["K"], JA["cf"], JI["K"], JI["cf"], JI["cf_len"] / JA["cf_len"], 0.52),
        foot=Axial(JA["A"], FRONT, JI["A"], FRONT, 0.36, 0.42),
    )
    return JI, maps


def adult_maps():
    i = Ident()
    return {k: i for k in ("torso", "head", "ua", "fa", "hand", "th", "cf", "foot")}


# ------------------------------------------------------ hands and feet

# Set by the build script per figure. An infant's fingers are short, chubby
# and held together, so they are drawn closer and thicker than an adult's.
HAND_SPLAY = 1.0
FINGER_GROW = 1.0


def hand_joints(J):
    W, fa, nf, ff = J["W"], J["fa"], J["n_fa"], J["f_fa"]
    spec = [
        ("index", 0.090, 0.028, (0.042, 0.025, 0.022), (0.0100, 0.0092, 0.0084), 9),
        ("middle", 0.094, 0.008, (0.046, 0.028, 0.023), (0.0102, 0.0094, 0.0086), 1),
        ("ring", 0.089, -0.012, (0.042, 0.026, 0.022), (0.0098, 0.0090, 0.0082), -7),
        ("little", 0.079, -0.031, (0.033, 0.019, 0.020), (0.0090, 0.0082, 0.0076), -15),
    ]
    fingers = []
    for name, ax, la, lens, rad, splay in spec:
        p = W + fa * ax + nf * la
        rad = tuple(r * FINGER_GROW for r in rad)
        s = math.radians(splay * HAND_SPLAY)
        d = (fa * math.cos(s) + nf * math.sin(s)).normalized()
        pts = [p]
        for ln, curl in zip(lens, (10, 14, 12)):
            fp = (ff - d * ff.dot(d)).normalized()
            c = math.radians(curl)
            d = (d * math.cos(c) + fp * math.sin(c)).normalized()
            p = p + d * ln
            pts.append(p)
        fingers.append((name, pts, rad))
    base = W + fa * 0.022 + nf * 0.026 + ff * 0.010
    p1 = base + (fa * 0.62 + nf * 0.66 + ff * 0.42).normalized() * 0.046
    p2 = p1 + (fa * 0.80 + nf * 0.45 + ff * 0.40).normalized() * 0.033
    p3 = p2 + (fa * 0.88 + nf * 0.30 + ff * 0.36).normalized() * 0.027
    thumb = ("thumb", [base, p1, p2, p3], (0.0130, 0.0110, 0.0098))
    return fingers, thumb


def foot_joints(J):
    A = J["A"]
    spec = [
        ("hallux", -0.030, 0.150, 0.048, 0.0125),
        ("toe2", -0.010, 0.158, 0.038, 0.0085),
        ("toe3", 0.006, 0.152, 0.034, 0.0080),
        ("toe4", 0.021, 0.143, 0.030, 0.0075),
        ("toe5", 0.035, 0.130, 0.026, 0.0070),
    ]
    toes = []
    for name, lo, fw, ln, r in spec:
        mtp = V(A.x + lo, A.y - fw, r + 0.004)
        tip = V(A.x + lo * 1.04, A.y - fw - ln, r * 0.9)
        toes.append((name, mtp, tip, r))
    return toes


# ---------------------------------------------------------------- bones

def femur_axis(J, t):
    """Centre of the femoral shaft at fraction t of the thigh (0 hip, 1 knee)."""
    return J["HJ"] + J["th"] * (t * J["th_len"]) + J["n_th"] * (0.050 * (1 - t))


CREST = [V(0.120, -0.062, 0.960), V(0.134, -0.040, 1.004), V(0.139, -0.010, 1.032),
         V(0.122, 0.035, 1.045), V(0.085, 0.070, 1.030), V(0.048, 0.086, 0.992)]
ILIUM_BASE = [V(0.106, -0.052, 0.936), V(0.108, -0.020, 0.928), V(0.102, 0.012, 0.926),
              V(0.085, 0.040, 0.930), V(0.066, 0.062, 0.942)]
SPINE_PATH = [V(0, 0.004, 1.555), V(0, 0.012, 1.510), V(0, 0.030, 1.455), V(0, 0.048, 1.380),
              V(0, 0.056, 1.280), V(0, 0.050, 1.200), V(0, 0.042, 1.140), V(0, 0.030, 1.090),
              V(0, 0.024, 1.040), V(0, 0.028, 1.012)]


def rib_points(i, n=22):
    """Centre line of the left rib i (1 to 12), from the spine round to the front."""
    zb = 1.418 - (i - 1) * 0.0255
    a = [0.048, 0.079, 0.099, 0.113, 0.122, 0.128, 0.131, 0.132, 0.130, 0.124, 0.110, 0.092][i - 1]
    drop = [0.046, 0.062, 0.076, 0.086, 0.094, 0.100, 0.104, 0.100, 0.095, 0.085, 0.055, 0.035][i - 1]
    end = [165, 168, 170, 170, 170, 168, 165, 150, 138, 126, 100, 72][i - 1]
    yf = -[0.054, 0.064, 0.074, 0.082, 0.088, 0.091, 0.092, 0.090, 0.086, 0.080, 0.068, 0.050][i - 1]
    yb = 0.076
    yc, ry = (yb + yf) / 2, (yb - yf) / 2
    pts = []
    for k in range(n + 1):
        t = math.radians(12 + (end - 12) * k / n)
        pts.append(V(a * math.sin(t), yc + ry * math.cos(t), zb - drop * (1 - math.cos(t)) / 2))
    return pts


def bones(J):
    GH, E, W, HJ, K, A = (J[k] for k in ("GH", "E", "W", "HJ", "K", "A"))
    ua, nu, fu = J["ua"], J["n_ua"], J["f_ua"]
    fa, nf, ff = J["fa"], J["n_fa"], J["f_fa"]
    th, nt, ft = J["th"], J["n_th"], J["f_th"]
    cf, nc, fc = J["cf"], J["n_cf"], J["f_cf"]
    B = {}

    # ---- upper limb
    o = Ops("ua")
    o.ball(GH, 0.0235)
    o.ball(GH + nu * 0.017 + ua * 0.010, 0.0135)                    # greater tubercle
    o.ball(GH + fu * 0.016 + ua * 0.012 + nu * 0.004, 0.009)        # lesser tubercle
    o.tube([(GH + ua * 0.030, 0.0145, 0.0145), (GH + ua * 0.100, 0.0115, 0.0115),
            (GH + ua * 0.200, 0.0105, 0.0105), (E - ua * 0.045, 0.0125, 0.0095),
            (E - ua * 0.018, 0.027, 0.0095), (E - ua * 0.004, 0.026, 0.010)], ref=nu)
    o.limb(E - nu * 0.020 + ua * 0.004, 0.0115, E + nu * 0.020 + ua * 0.004, 0.0105)
    o.ball(E - nu * 0.031 - ua * 0.010, 0.008)                      # medial epicondyle
    o.ball(E + nu * 0.029 - ua * 0.010, 0.007)                      # lateral epicondyle
    o.ball(GH + ua * 0.135 + nu * 0.0105, (0.005, 0.006, 0.018), axes=(nu, fu, ua))
    B["Humerus"] = (o, True, 1700)

    o = Ops("fa")
    o.ball(E - ff * 0.016 - fa * 0.006 - nf * 0.006, (0.011, 0.012, 0.016), axes=(nf, ff, fa))
    o.tube([(E - nf * 0.010 + fa * 0.004, 0.011, 0.011), (E - nf * 0.012 + fa * 0.050, 0.0085, 0.0085),
            (E - nf * 0.013 + fa * 0.150, 0.0065, 0.0065), (W - nf * 0.016 - fa * 0.012, 0.0055, 0.0055),
            (W - nf * 0.017, 0.0065, 0.0060)], ref=nf)
    B["Ulna"] = (o, True, 900)

    o = Ops("fa")
    o.tube([(E + nf * 0.017 + fa * 0.010, 0.0105, 0.0105), (E + nf * 0.016 + fa * 0.030, 0.0065, 0.0065),
            (E + nf * 0.018 + fa * 0.120, 0.0075, 0.0070), (W + nf * 0.012 - fa * 0.030, 0.0100, 0.0075),
            (W + nf * 0.010 - fa * 0.002, 0.0150, 0.0090)], ref=nf)
    B["Radius"] = (o, True, 900)

    fingers, thumb = hand_joints(J)
    o = Ops("hand")
    o.ball(W + fa * 0.016, (0.024, 0.008, 0.013), axes=(nf, ff, fa))    # carpals
    for name, pts, rad in fingers + [thumb]:
        root = W + fa * 0.030 + (pts[0] - W - fa * (pts[0] - W).dot(fa)) * 0.6
        if name == "thumb":
            root = W + fa * 0.016 + nf * 0.018
        chain = [root] + pts
        for a, b, r in zip(chain[:-1], chain[1:], (0.0040, 0.0034, 0.0029, 0.0024)):
            end = b if b is not chain[-1] else a.lerp(b, 0.82)
            o.limb(a, r, end, r * 0.90)
            o.ball(a, r * 1.25)
    B["HandBones"] = (o, True, 2600)

    # ---- shoulder girdle
    o = Ops("torso")
    o.tube([(V(0.022, -0.058, 1.380), 0.0105, 0.0095), (V(0.075, -0.066, 1.384), 0.0078, 0.0068),
            (V(0.130, -0.042, 1.392), 0.0080, 0.0062), (V(0.178, 0.002, 1.397), 0.0105, 0.0058)],
           ref=UP, sub=6)
    B["Clavicle"] = (o, True, 500)

    SA, IA, MR = V(0.078, 0.070, 1.400), V(0.098, 0.078, 1.227), V(0.068, 0.078, 1.360)
    GN = GH + V(-0.030, 0.012, -0.004)
    o = Ops("torso")
    medial = [SA, MR, V(0.070, 0.080, 1.305), V(0.082, 0.080, 1.255), IA]
    lateral = [GN + V(0, 0, 0.022), GN + V(0, 0.002, 0.008), GN + V(0, 0.006, -0.012),
               V(0.128, 0.044, 1.285), IA + V(0.012, -0.002, 0.012)]
    grid = []
    for a, b in zip(medial, lateral):
        grid.append([a.lerp(b, k / 6) + BACK * (-0.006 * math.sin(math.pi * k / 6)) for k in range(7)])
    o.slab(grid, 0.0045)
    o.limb(SA, 0.0045, MR, 0.0045)
    o.limb(MR, 0.0045, IA, 0.0055)
    o.limb(IA, 0.0055, GN + V(0, 0.006, -0.012), 0.0075)
    o.ball(GH + V(-0.025, 0.007, 0), (0.008, 0.014, 0.019))             # glenoid
    o.tube([(MR, 0.004, 0.006), (V(0.105, 0.066, 1.375), 0.005, 0.008), (V(0.145, 0.052, 1.389), 0.006, 0.009),
            (V(0.172, 0.034, 1.396), 0.009, 0.0055)], ref=UP, sub=5)        # spine of scapula
    o.ball(V(0.178, 0.016, 1.397), (0.019, 0.016, 0.0058))              # acromion
    o.limb(GN + V(0.004, -0.018, 0.020), 0.0075, V(0.150, -0.040, 1.369), 0.0060)   # coracoid
    B["Scapula"] = (o, True, 2200)

    # ---- trunk
    o = Ops("torso")
    for i in range(1, 13):
        pts = rib_points(i)
        o.tube([(p, 0.0064, 0.0034) for p in pts[::3] + ([pts[-1]] if (len(pts) - 1) % 3 else [])],
               ref=UP, sub=3, n=10)
    ends = {i: rib_points(i)[-1] for i in range(1, 13)}
    for i in range(1, 8):
        zs = 1.368 - (i - 1) * 0.027
        o.limb(ends[i], 0.0048, V(0.016, -0.056 - 0.036 * min(1.0, (1.385 - zs) / 0.17), zs), 0.0048)
    for i in (8, 9, 10):
        o.limb(ends[i], 0.0045, ends[i - 1].lerp(V(0.016, -0.090, 1.200), 0.35), 0.0045)
    B["Ribs"] = (o, False, 9000)

    o = Ops("torso")
    o.tube([(V(0, -0.056, 1.385), 0.027, 0.0075), (V(0, -0.072, 1.342), 0.020, 0.0070),
            (V(0, -0.090, 1.270), 0.017, 0.0065), (V(0, -0.094, 1.215), 0.014, 0.0060),
            (V(0, -0.090, 1.188), 0.006, 0.0040)], ref=LAT, sub=4, n=16)
    B["Sternum"] = (o, None, 500)

    o = Ops("torso")
    for k in range(24):
        t = (k + 0.5) / 24
        c = L.spline(SPINE_PATH, t)
        nxt = L.spline(SPINE_PATH, min(t + 0.02, 1.0))
        ax = (c - nxt).normalized() if (c - nxt).length > 1e-9 else UP
        r = 0.0105 + 0.0105 * t ** 1.4
        h = 0.0085 + 0.0045 * t
        back = (BACK - ax * BACK.dot(ax)).normalized()
        o.ball(c, (r, r * 0.86, h), axes=(LAT, back, ax))
        o.limb(c + back * r * 0.8, 0.0046, c + back * (r + 0.020) - ax * (-0.010), 0.0034)   # spinous process
        o.limb(c + back * r * 0.6, 0.0042, c + back * r * 0.9 + LAT * (r + 0.016), 0.0034)   # transverse process
    B["Spine"] = (o, False, 7000)

    o = Ops("head")
    o.ball(V(0, 0.012, 1.632), (0.068, 0.084, 0.062))                   # cranium
    o.ball(V(0, -0.036, 1.586), (0.046, 0.036, 0.040))                  # facial skeleton
    o.ball(V(0.040, -0.030, 1.584), (0.014, 0.018, 0.012))              # cheek bone
    o.ball(V(0.020, -0.060, 1.598), (0.016, 0.006, 0.013))              # brow over the orbit
    o.tube([(V(0.044, 0.000, 1.572), 0.0055, 0.012), (V(0.042, -0.002, 1.530), 0.0065, 0.011),
            (V(0.028, -0.036, 1.516), 0.0065, 0.010), (V(0.006, -0.056, 1.514), 0.0075, 0.010)],
           ref=LAT, sub=5, n=14)                                         # mandible
    B["Skull"] = (o, False, 2600)

    # ---- pelvis
    o = Ops("torso")
    grid = []
    for iu in range(15):
        u = iu / 14
        c, b = L.spline(CREST, u), L.spline(ILIUM_BASE, u)
        row = []
        for iv in range(7):
            v = iv / 6
            p = b.lerp(c, v)
            row.append(p - LAT * (0.007 * math.sin(math.pi * v) * math.sin(math.pi * min(u * 1.4, 1.0))))
        grid.append(row)
    o.slab(grid, 0.0075)
    o.tube([(L.spline(CREST, u / 8), 0.0062, 0.0062) for u in range(9)], ref=UP, sub=3, n=12)
    o.ball(CREST[0], 0.0085)                                          # anterior superior iliac spine
    o.ball(ILIUM_BASE[0], 0.0075)                                     # anterior inferior iliac spine
    o.ball(CREST[-1], 0.0080)                                         # posterior superior iliac spine
    o.ball(HJ + V(0.003, 0.002, 0.004), 0.0335)                       # acetabular body
    o.limb(HJ + V(-0.010, 0.022, -0.020), 0.0160, V(0.062, 0.048, 0.800), 0.0170)      # ischium
    o.limb(HJ + V(-0.016, -0.024, -0.004), 0.0105, V(0.028, -0.070, 0.872), 0.0092)    # superior pubic ramus
    o.limb(V(0.028, -0.070, 0.872), 0.0092, V(0.004, -0.072, 0.866), 0.0105)
    o.limb(V(0.012, -0.064, 0.846), 0.0072, V(0.058, 0.040, 0.802), 0.0090)            # inferior ramus
    o.limb(ILIUM_BASE[-1], 0.010, V(0.040, 0.060, 0.985), 0.012)                       # sacroiliac
    o.tube([(V(0.026, 0.047, 1.004), 0.030, 0.016), (V(0.020, 0.074, 0.932), 0.022, 0.013),
            (V(0.004, 0.071, 0.878), 0.007, 0.006)], ref=LAT, sub=5, n=14)                 # sacrum half
    B["Pelvis"] = (o, False, 7500)

    # ---- lower limb
    o = Ops("th")
    o.ball(HJ, 0.0235)
    o.limb(HJ, 0.0140, HJ + V(0.045, 0.006, -0.028), 0.0165)                          # neck
    o.ball(HJ + V(0.062, 0.010, -0.012), (0.016, 0.020, 0.024))                       # greater trochanter
    o.ball(HJ + V(0.028, 0.020, -0.066), 0.010)                                       # lesser trochanter
    o.tube([(HJ + V(0.050, 0.006, -0.040), 0.0170, 0.0165), (femur_axis(J, 0.22) + ft * 0.002, 0.0145, 0.0140),
            (femur_axis(J, 0.50) + ft * 0.008, 0.0135, 0.0135), (femur_axis(J, 0.78) + ft * 0.004, 0.0150, 0.0140),
            (K + th * (-0.045), 0.0270, 0.0170), (K + th * (-0.016), 0.0380, 0.0220)], ref=nt)
    o.ball(K - nt * 0.023 + BACK * 0.008, (0.0190, 0.0280, 0.0215), axes=(nt, ft, th))   # medial condyle
    o.ball(K + nt * 0.023 + BACK * 0.008, (0.0185, 0.0270, 0.0205), axes=(nt, ft, th))   # lateral condyle
    o.ball(K + nt * 0.038 + th * (-0.010), 0.0075)                                    # lateral epicondyle
    B["Femur"] = (o, True, 2300)

    o = Ops("th")
    o.ball(K + ft * 0.043 + UP * 0.012, (0.021, 0.0095, 0.022), axes=(nt, ft, th))
    B["Patella"] = (o, True, 260)

    o = Ops("cf")
    o.ball(K + cf * 0.036, (0.037, 0.026, 0.016), axes=(nc, fc, cf))
    o.ball(K + cf * 0.060 + fc * 0.026, 0.010)                                        # tibial tuberosity
    o.tube([(K + cf * 0.052, 0.0200, 0.0200), (K + cf * 0.130 + fc * 0.004, 0.0140, 0.0150),
            (K + cf * 0.260, 0.0125, 0.0130), (A - cf * 0.040, 0.0130, 0.0125),
            (A - cf * 0.008, 0.0210, 0.0160)], ref=nc)
    o.ball(A - nc * 0.022 + cf * 0.006, 0.0115)                                       # medial malleolus
    B["Tibia"] = (o, True, 1500)

    o = Ops("cf")
    o.ball(K + nc * 0.036 + BACK * 0.020 + cf * 0.050, 0.0110)
    o.tube([(K + nc * 0.036 + BACK * 0.020 + cf * 0.062, 0.0075, 0.0075),
            (K + nc * 0.034 + BACK * 0.016 + cf * 0.200, 0.0055, 0.0055),
            (A + nc * 0.028 + BACK * 0.010 - cf * 0.040, 0.0060, 0.0060)], ref=nc, n=12)
    o.ball(A + nc * 0.026 + BACK * 0.010 + cf * 0.012, 0.0110)                         # lateral malleolus
    B["Fibula"] = (o, True, 650)

    o = Ops("foot")
    o.ball(V(A.x + 0.003, A.y + 0.020, 0.036), (0.018, 0.030, 0.022))                 # calcaneus
    o.ball(V(A.x, A.y - 0.002, 0.062), (0.019, 0.026, 0.015))                         # talus
    o.ball(V(A.x - 0.002, A.y - 0.052, 0.040), (0.025, 0.027, 0.014))                 # tarsals
    for name, mtp, tip, r in foot_joints(J):
        root = V(A.x + (mtp.x - A.x) * 0.6, A.y - 0.075, 0.034)
        o.limb(root, 0.0056, mtp + UP * 0.003, 0.0046)
        o.limb(mtp + UP * 0.003, r * 0.46, mtp.lerp(tip, 0.8) + UP * 0.002, r * 0.38)
        o.ball(mtp + UP * 0.003, r * 0.54)
    B["FootBones"] = (o, True, 2600)
    return B


# -------------------------------------------------------------- muscles

DELTOID_ORIGINS = [V(0.128, -0.042, 1.394), V(0.160, -0.028, 1.399), V(0.186, -0.004, 1.399),
                   V(0.197, 0.018, 1.397), V(0.182, 0.038, 1.393), V(0.150, 0.054, 1.385),
                   V(0.118, 0.062, 1.377)]


def muscles(J):
    GH, E, HJ, K = J["GH"], J["E"], J["HJ"], J["K"]
    ua, nu, fu = J["ua"], J["n_ua"], J["f_ua"]
    th, nt, ft = J["th"], J["n_th"], J["f_th"]
    bu = -fu
    M = {}

    def tc(t):
        return HJ + th * (t * J["th_len"])

    o = Ops("ua")
    dt = GH + ua * 0.135 + nu * 0.013
    dense = [L.spline(DELTOID_ORIGINS, i / 12) for i in range(13)]
    for org in dense:
        h = perp(org - GH, ua)
        o.tube([(org, 0.0125, 0.0060), (GH + ua * 0.030 + h * 0.042, 0.0170, 0.0110),
                (GH + ua * 0.090 + h * 0.027, 0.0130, 0.0090), (dt, 0.0060, 0.0050)],
               ref=ua.cross(h), segs=["torso", "ua", "ua", "ua"], n=12)
    M["Deltoid"] = (o, 1700)

    o = Ops("ua")
    o.tube([(GH + ua * 0.050 + bu * 0.022 - nu * 0.012, 0.016, 0.012),
            (GH + ua * 0.130 + bu * 0.030 - nu * 0.004, 0.028, 0.020),
            (GH + ua * 0.200 + bu * 0.030, 0.027, 0.019), (E - ua * 0.050 + bu * 0.020, 0.016, 0.009),
            (E + bu * 0.017, 0.010, 0.006)], ref=nu)
    o.tube([(GH + ua * 0.070 + bu * 0.014 + nu * 0.016, 0.010, 0.008),
            (GH + ua * 0.140 + bu * 0.022 + nu * 0.020, 0.017, 0.014),
            (GH + ua * 0.200 + bu * 0.024 + nu * 0.012, 0.014, 0.011),
            (E - ua * 0.060 + bu * 0.020, 0.010, 0.007)], ref=nu)
    M["Triceps"] = (o, 1000)

    r_vl = (nt * 0.87 + ft * 0.50).normalized()
    o = Ops("th")
    o.tube([(femur_axis(J, 0.14) + r_vl * 0.022, 0.020, 0.012), (femur_axis(J, 0.30) + r_vl * 0.032, 0.034, 0.020),
            (femur_axis(J, 0.52) + r_vl * 0.036, 0.040, 0.024), (femur_axis(J, 0.75) + r_vl * 0.032, 0.032, 0.019),
            (femur_axis(J, 0.90) + r_vl * 0.026 + ft * 0.008, 0.018, 0.010),
            (K + ft * 0.040 + nt * 0.018, 0.008, 0.005)], ref=th.cross(r_vl))
    M["VastusLateralis"] = (o, 1100)

    o = Ops("th")
    o.tube([(ILIUM_BASE[0], 0.010, 0.007), (tc(0.25) + ft * 0.050 + nt * 0.012, 0.020, 0.013),
            (tc(0.50) + ft * 0.052 + nt * 0.006, 0.024, 0.016), (tc(0.80) + ft * 0.045, 0.016, 0.010),
            (K + ft * 0.044 + UP * 0.030, 0.010, 0.006)], ref=nt,
           segs=["torso", "th", "th", "th", "th"])
    M["RectusFemoris"] = (o, 800)

    gt_tip = HJ + V(0.060, 0.012, 0.012)
    o = Ops("torso")
    for i in range(8):
        org = L.spline(CREST, 0.04 + 0.62 * i / 7) - UP * 0.020
        out = Vector((org.x - 0.06, org.y, 0)).normalized()
        org = org + out * 0.006
        mid = org.lerp(gt_tip, 0.55) + out * 0.012
        o.tube([(org, 0.014, 0.006), (mid, 0.017, 0.011), (gt_tip, 0.008, 0.006)],
               ref=(gt_tip - org).cross(out), segs=["torso", "torso", "th"], n=12)
    M["GluteusMedius"] = (o, 1000)

    o = Ops("torso")
    org0, org1 = V(0.050, 0.088, 0.985), V(0.022, 0.088, 0.885)
    ins0, ins1 = HJ + V(0.066, 0.030, -0.035), HJ + V(0.050, 0.026, -0.150)
    for i in range(9):
        a, b = org0.lerp(org1, i / 8), ins0.lerp(ins1, i / 8)
        mid = a.lerp(b, 0.5) + BACK * 0.030 + LAT * 0.004
        o.tube([(a, 0.012, 0.007), (mid, 0.020, 0.019), (b, 0.012, 0.007)],
               ref=(b - a).cross(BACK), segs=["torso", "torso", "th"], n=12)
    M["GluteusMaximus"] = (o, 1300)

    o = Ops("th")
    o.tube([(V(0.058, 0.066, 0.925), 0.0045, 0.0045), (V(0.072, 0.058, 0.875), 0.0048, 0.0042),
            (HJ + V(0.020, 0.046, -0.060), 0.0048, 0.0040), (tc(0.40) + BACK * 0.022, 0.0045, 0.0038),
            (tc(0.75) + BACK * 0.020, 0.0040, 0.0035)], ref=LAT, sub=5, n=10,
           segs=["torso", "torso", "th", "th", "th"])
    M["SciaticNerve"] = (o, 320)
    return M


# ----------------------------------------------------------------- skin

def limb_tubes(J, T):
    """Arm and leg lofts for the figure's own joints and section tables."""
    GH, E, HJ, K = J["GH"], J["E"], J["HJ"], J["K"]
    o = Ops("raw")
    arm = []
    for sg, t, rx, ry in T["arm"]:
        c = GH + J["ua"] * (J["ua_len"] * t) if sg == "ua" else E + J["fa"] * (J["fa_len"] * t)
        arm.append((c, rx, ry))
    o.tube(arm, ref=J["n_ua"], n=28, sub=5)
    leg = []
    for sg, t, rx, ry, back in T["leg"]:
        c = HJ + J["th"] * (J["th_len"] * t) if sg == "th" else K + J["cf"] * (J["cf_len"] * t)
        leg.append((c + BACK * back, rx, ry))
    o.tube(leg, ref=LAT, n=32, sub=5)
    return o


def head_ops():
    """Head with no face detail: cranium, lower face mass and chin."""
    o = Ops("head")
    o.tube([(V(0, -0.044, 1.487), 0.020, 0.022), (V(0, -0.036, 1.500), 0.042, 0.046),
            (V(0, -0.024, 1.526), 0.057, 0.068), (V(0, -0.010, 1.562), 0.067, 0.086),
            (V(0, 0.004, 1.602), 0.076, 0.095), (V(0, 0.010, 1.642), 0.079, 0.097),
            (V(0, 0.012, 1.676), 0.068, 0.086), (V(0, 0.012, 1.698), 0.043, 0.055),
            (V(0, 0.012, 1.708), 0.012, 0.016)], ref=LAT, sub=5, n=36)
    return o


def soft_tissue(J, shoulders=True):
    """Soft-tissue volumes written for the adult (mapped for the infant).
    These are blended heavily into the trunk and limbs."""
    GH, E, W, HJ, K, A = (J[k] for k in ("GH", "E", "W", "HJ", "K", "A"))
    ua, nu, fu = J["ua"], J["n_ua"], J["f_ua"]
    fa, nf, ff = J["fa"], J["n_fa"], J["f_fa"]
    th, nt, ft = J["th"], J["n_th"], J["f_th"]
    cf, nc, fc = J["cf"], J["n_cf"], J["f_cf"]

    def tc(t):
        return HJ + th * (t * J["th_len"])

    o = Ops("ua")
    # biceps
    o.tube([(GH + ua * 0.060 + fu * 0.018, 0.012, 0.010), (GH + ua * 0.150 + fu * 0.027, 0.024, 0.019),
            (GH + ua * 0.210 + fu * 0.026, 0.021, 0.016), (E - ua * 0.030 + fu * 0.016, 0.010, 0.007)], ref=nu)
    # forearm extensor and flexor masses
    o.ball(E + fa * 0.060 + nf * 0.022 + ff * 0.004, (0.018, 0.020, 0.055), axes=(nf, ff, fa), seg="fa")
    o.ball(E + fa * 0.070 - nf * 0.018 + ff * 0.008, (0.020, 0.020, 0.060), axes=(nf, ff, fa), seg="fa")
    # chest wall to arm, and the slope of the shoulder
    o.ball(V(0.080, -0.060, 1.285), (0.074, 0.022, 0.060), seg="torso")
    o.tube([(V(0.100, -0.054, 1.300), 0.034, 0.022), (V(0.142, -0.044, 1.317), 0.030, 0.019),
            (GH + ua * 0.060 + fu * 0.018, 0.016, 0.010)], ref=UP, segs=["torso", "torso", "ua"])
    if shoulders:
        o.tube([(V(0.030, 0.038, 1.490), 0.030, 0.026), (V(0.085, 0.036, 1.425), 0.036, 0.026),
                (V(0.150, 0.026, 1.393), 0.026, 0.016)], ref=FRONT, seg="torso")
    o.limb(V(0.020, 0.012, 1.366), 0.050, V(0.135, 0.012, 1.364), 0.050, seg="torso")
    o.ball(V(0.096, 0.056, 1.310), (0.058, 0.036, 0.108), seg="torso")                 # shoulder blade
    # buttock, hamstrings, inner knee, calf
    o.ball(V(0.078, 0.052, 0.905), (0.090, 0.078, 0.106), seg="torso")
    if shoulders:
        o.tube([(V(0.030, -0.014, 1.440), 0.034, 0.030), (V(0.090, -0.020, 1.396), 0.046, 0.030),
                (V(0.150, -0.004, 1.374), 0.034, 0.028)], ref=FRONT, seg="torso")          # root of the neck
    o.ball(V(0.075, 0.052, 0.862), (0.070, 0.058, 0.060), seg="torso")
    o.tube([(tc(0.12) + BACK * 0.030, 0.040, 0.022), (tc(0.45) + BACK * 0.036, 0.046, 0.028),
            (tc(0.80) + BACK * 0.028, 0.036, 0.018)], ref=nt, seg="th")
    o.ball(K - th * 0.075 - nt * 0.032 + ft * 0.024, (0.024, 0.020, 0.046), axes=(nt, ft, th), seg="th")
    o.ball(K + cf * 0.115 + BACK * 0.028 + nc * 0.018, (0.024, 0.022, 0.072), axes=(nc, fc, cf), seg="cf")
    o.ball(K + cf * 0.125 + BACK * 0.028 - nc * 0.020, (0.027, 0.024, 0.080), axes=(nc, fc, cf), seg="cf")
    o.tube([(K + cf * 0.200 + BACK * 0.022, 0.030, 0.018), (K + cf * 0.320 + BACK * 0.020, 0.016, 0.012),
            (A + BACK * 0.030 - UP * 0.020, 0.011, 0.010)], ref=nc, seg="cf")

    return o


def extremities(J):
    """Hands with fingers, feet with toes, ears: kept crisp."""
    W, A = J["W"], J["A"]
    fa, nf, ff = J["fa"], J["n_fa"], J["f_fa"]
    o = Ops("hand")
    # hand
    fingers, thumb = hand_joints(J)
    o.tube([(W - fa * 0.010, 0.029, 0.017), (W + fa * 0.030, 0.036, 0.0165),
            (W + fa * 0.065, 0.041, 0.0145), (W + fa * 0.092, 0.040, 0.0110)], ref=nf, seg="hand")
    o.ball(W + fa * 0.035 + nf * 0.022 + ff * 0.012, (0.017, 0.014, 0.026), axes=(nf, ff, fa), seg="hand")
    o.ball(W + fa * 0.040 - nf * 0.026 + ff * 0.006, (0.012, 0.011, 0.030), axes=(nf, ff, fa), seg="hand")
    for name, pts, rad in fingers + [thumb]:
        r = (rad[0], rad[0], rad[1], rad[2])
        for a, b, ra, rb in zip(pts[:-1], pts[1:], r[:-1], r[1:]):
            o.limb(a, ra, b, rb, seg="hand")

    # foot
    o.ball(V(A.x, A.y + 0.022, 0.034), (0.031, 0.036, 0.034), seg="foot")
    o.tube([(V(A.x + 0.002, A.y + 0.040, 0.036), 0.028, 0.034), (V(A.x + 0.002, A.y, 0.040), 0.031, 0.038),
            (V(A.x + 0.002, A.y - 0.050, 0.034), 0.036, 0.030), (V(A.x + 0.002, A.y - 0.100, 0.024), 0.043, 0.021),
            (V(A.x + 0.002, A.y - 0.145, 0.016), 0.046, 0.014)], ref=LAT, seg="foot")
    for name, mtp, tip, r in foot_joints(J):
        o.limb(mtp, r, tip, r * 0.86, seg="foot")
    o.ball(V(0.0765, 0.016, 1.592), (0.0065, 0.0150, 0.026), seg="head")
    return o


def features(J):
    """Named anatomical points (adult coordinates) with their segment."""
    HJ, K, E, GH = J["HJ"], J["K"], J["E"], J["GH"]
    return dict(
        acromion=(V(0.197, 0.018, 1.397), "torso"),
        greater_trochanter=(HJ + V(0.078, 0.010, -0.012), "th"),
        greater_trochanter_top=(HJ + V(0.068, 0.010, 0.012), "th"),
        asis=(CREST[0], "torso"),
        iliac_tubercle=(CREST[2], "torso"),
        psis=(CREST[-1], "torso"),
        lateral_condyle=(K + J["n_th"] * 0.042 + J["th"] * (-0.010), "th"),
        deltoid_tuberosity=(GH + J["ua"] * 0.135 + J["n_ua"] * 0.013, "ua"),
    )
