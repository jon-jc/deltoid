import {
  AmbientLight,
  Box3,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  Object3D,
  PerspectiveCamera,
  Plane,
  Raycaster,
  RingGeometry,
  Scene,
  SphereGeometry,
  Vector2,
  Vector3,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

/* -------------------------------------------------------------- types */

export type PatientKind = "adult" | "infant";
export type ViewName = "body" | "case" | "arm" | "thigh" | "hip";
export type Side = "L" | "R";

export interface TapResult {
  /** Zone name without side, for example "Deltoid", or null when no zone was hit. */
  zone: string | null;
  side: Side;
  /** Nearest named body region, for example "ThighUpper". */
  region: string;
  /** Tap position in model space (metres). */
  point: [number, number, number];
}

export interface CutawayProfile {
  /** Depth of the bottom of the skin layers, millimetres. */
  skinMm: number;
  /** Depth where fat ends and muscle begins, millimetres. */
  fatBottomMm: number;
  /** Depth where muscle ends and bone begins, millimetres. */
  boneTopMm: number;
}

export interface NeedlePose {
  lengthMm: number | null;
  angleDeg: number | null;
  /** Shallow intradermal entry: only the bevel goes under the skin. */
  bevelOnly: boolean;
}

export interface LabelSpec {
  key: string;
  text: string;
}

export interface StageCallbacks {
  onTap?: (tap: TapResult) => void;
  onLoading?: (label: string | null) => void;
  onError?: (message: string) => void;
  onLayers?: (rows: { id: string; y: number; visible: boolean }[], tip: { x: number; y: number } | null) => void;
}

interface Landmark {
  key: string;
  side: Side;
  pos: Vector3;
  normal: Vector3 | null;
  el: HTMLElement | null;
}

interface Patient {
  kind: PatientKind;
  root: Group;
  body: Mesh;
  zones: Mesh[];
  overlays: Object3D[];
  landmarks: Landmark[];
  dots: Group;
  regions: { name: string; side: Side | null; pos: Vector3 }[];
  views: Map<string, Box3>;
  anatomy: Group | null;
  anatomyRequested: boolean;
  height: number;
}

interface Tween {
  t0: number;
  ms: number;
  step: (k: number) => void;
  done?: () => void;
}

const MODEL_URL = (name: string) => `/models/${name}.glb`;
const DEG = Math.PI / 180;
const TAP_SLOP_PX = 9;

const COLORS = {
  skin: "#cfd8d4",
  bone: "#ece5d3",
  muscle: "#b5574d",
  nerve: "#e2c447",
  zone: "#2a8c82",
  guide: "#c06a25",
  marker: "#c06a25",
};

const ease = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2);

function stripPrefix(name: string) {
  return name.replace(/^(Adult|Infant|Tissue|Syringe)_/, "");
}

/* -------------------------------------------------------------- stage */

export class Stage {
  private renderer: WebGLRenderer;
  private camera = new PerspectiveCamera(30, 1, 0.01, 30);
  private patientScene = new Scene();
  private cutScene = new Scene();
  private loader = new GLTFLoader();
  private cache = new Map<string, Promise<Group>>();
  private patients = new Map<PatientKind, Patient>();
  private current: Patient | null = null;
  private mode: "patient" | "cutaway" = "patient";
  private raycaster = new Raycaster();
  private marker = new Group();
  private tweens: Tween[] = [];
  private raf = 0;
  private dirty = true;
  private disposed = false;
  private width = 1;
  private height = 1;

  // orbit state
  private target = new Vector3(0, 0.85, 0);
  private yaw = 0;
  private pitch = 0.06;
  private dist = 5;
  private fitDist = 5;
  private spin = false;
  private spinHold = 0;
  private lastTime = 0;
  private interactive = true;
  private landmarksOn = false;
  private labelSpecs: LabelSpec[] = [];

  // pointers
  private pointers = new Map<number, { x: number; y: number; sx: number; sy: number }>();
  private moved = false;
  private pinch: { d: number; dist: number } | null = null;

  // cutaway
  private tissue: Group | null = null;
  private syringe: Group | null = null;
  private syringeParts: Record<string, Object3D> = {};
  private tipDot = new Mesh(new SphereGeometry(0.0007, 16, 12), new MeshBasicMaterial({ color: COLORS.marker }));
  private profile: CutawayProfile = { skinMm: 2.5, fatBottomMm: 20, boneTopMm: 30 };
  private fatPlanes = [new Plane(new Vector3(0, -1, 0), 0), new Plane(new Vector3(0, 1, 0), 0)];
  private musclePlanes = [new Plane(new Vector3(0, -1, 0), 0), new Plane(new Vector3(0, 1, 0), 0)];
  private needle: NeedlePose = { lengthMm: null, angleDeg: null, bevelOnly: false };
  private inserted = 0; // 0 hovering above the skin, 1 at depth
  private plunger = 1; // 1 drawn back, 0 pressed
  private entry = new Vector3(0.01, 0, 0.0212);

  constructor(
    private canvas: HTMLCanvasElement,
    private overlay: HTMLElement,
    private reducedMotion: boolean,
    private cb: StageCallbacks,
  ) {
    this.renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.localClippingEnabled = true;
    this.renderer.setClearColor(0x000000, 0);
    this.loader.setMeshoptDecoder(MeshoptDecoder);

    for (const scene of [this.patientScene, this.cutScene]) {
      scene.add(new HemisphereLight(0xffffff, 0xb9b3a4, 1.15));
      scene.add(new AmbientLight(0xffffff, 0.25));
      const key = new DirectionalLight(0xfff6ea, 1.9);
      key.position.set(1.6, 2.4, 2.6);
      scene.add(key);
      const rim = new DirectionalLight(0xdcefee, 0.9);
      rim.position.set(-2.2, 1.4, -1.8);
      scene.add(rim);
    }

    const dot = new Mesh(new SphereGeometry(1, 20, 14), new MeshBasicMaterial({ color: COLORS.marker, depthTest: false }));
    const ring = new Mesh(
      new RingGeometry(1.7, 2.3, 40),
      new MeshBasicMaterial({ color: 0xffffff, depthTest: false, transparent: true, opacity: 0.95 }),
    );
    dot.renderOrder = 20;
    ring.renderOrder = 19;
    this.marker.add(ring, dot);
    this.marker.visible = false;
    this.patientScene.add(this.marker);

    (this.tipDot.material as MeshBasicMaterial).depthTest = false;
    this.tipDot.renderOrder = 30;
    this.tipDot.visible = false;
    this.cutScene.add(this.tipDot);

    canvas.addEventListener("pointerdown", this.onDown);
    canvas.addEventListener("pointermove", this.onMove);
    canvas.addEventListener("pointerup", this.onUp);
    canvas.addEventListener("pointercancel", this.onCancel);
    canvas.addEventListener("wheel", this.onWheel, { passive: false });
    canvas.addEventListener("webglcontextlost", this.onLost);

    this.resize();
    this.raf = requestAnimationFrame(this.frame);
  }

  /* ------------------------------------------------------- lifecycle */

  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    const c = this.canvas;
    c.removeEventListener("pointerdown", this.onDown);
    c.removeEventListener("pointermove", this.onMove);
    c.removeEventListener("pointerup", this.onUp);
    c.removeEventListener("pointercancel", this.onCancel);
    c.removeEventListener("wheel", this.onWheel);
    c.removeEventListener("webglcontextlost", this.onLost);
    this.overlay.replaceChildren();
    for (const scene of [this.patientScene, this.cutScene]) {
      scene.traverse((o) => {
        const m = o as Mesh;
        if (m.isMesh) {
          m.geometry.dispose();
          const mats = Array.isArray(m.material) ? m.material : [m.material];
          mats.forEach((x) => x.dispose());
        }
      });
    }
    this.renderer.dispose();
  }

  resize() {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    if (w === this.width && h === this.height) return;
    const firstFit = this.width === 1 && this.height === 1;
    this.width = w;
    this.height = h;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (!firstFit) this.refit(false);
    this.dirty = true;
  }

  private onLost = (e: Event) => {
    e.preventDefault();
    this.cb.onError?.("The 3D view stopped. Reload the page to restart it.");
  };

  /* --------------------------------------------------------- loading */

  private load(name: string): Promise<Group> {
    let p = this.cache.get(name);
    if (!p) {
      p = this.loader.loadAsync(MODEL_URL(name)).then((gltf) => gltf.scene);
      this.cache.set(name, p);
    }
    return p;
  }

  /** Fetch models ahead of use, without showing them. */
  preload(names: string[]) {
    names.forEach((n) => void this.load(n).catch(() => undefined));
  }

  private async getPatient(kind: PatientKind): Promise<Patient> {
    const have = this.patients.get(kind);
    if (have) return have;
    const scene = await this.load(kind);
    const root = new Group();
    const zones: Mesh[] = [];
    const overlays: Object3D[] = [];
    const landmarks: Landmark[] = [];
    const regions: Patient["regions"] = [];
    const views = new Map<string, Box3>();
    let body: Mesh | null = null;
    const skin = new MeshStandardMaterial({ color: COLORS.skin, roughness: 0.82, metalness: 0 });
    const zoneMat = new MeshBasicMaterial({
      color: COLORS.zone, transparent: true, opacity: 0.5, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    const guideMat = new MeshBasicMaterial({ color: COLORS.guide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });

    for (const node of [...scene.children]) {
      const name = stripPrefix(node.name);
      const sideMatch = /_(L|R)$/.exec(name);
      const side = (sideMatch?.[1] ?? null) as Side | null;
      const mesh = node as Mesh;
      if (name === "Body" && mesh.isMesh) {
        mesh.material = skin;
        body = mesh;
        root.add(mesh);
      } else if (name.startsWith("Zone_") && mesh.isMesh) {
        mesh.material = zoneMat;
        mesh.userData.zone = name.slice(5).replace(/_(L|R)$/, "");
        mesh.userData.side = side ?? "L";
        mesh.renderOrder = 6;
        zones.push(mesh);
        overlays.push(mesh);
        root.add(mesh);
      } else if (name.startsWith("Guide_") && mesh.isMesh) {
        mesh.material = guideMat;
        mesh.renderOrder = 6;
        overlays.push(mesh);
        root.add(mesh);
      } else if (name.startsWith("Landmark_")) {
        landmarks.push({
          key: name.slice(9).replace(/_(L|R)$/, ""), side: side ?? "L",
          pos: node.position.clone(), normal: null, el: null,
        });
      } else if (name.startsWith("Region_")) {
        regions.push({ name: name.slice(7).replace(/_(L|R|a|b)$/, "").replace(/_(a|b)$/, ""), side, pos: node.position.clone() });
      } else if (name.startsWith("View_")) {
        const half = node.scale.clone();
        half.set(Math.abs(half.x), Math.abs(half.y), Math.abs(half.z));
        views.set(name.slice(5), new Box3(node.position.clone().sub(half), node.position.clone().add(half)));
      }
    }
    if (!body) throw new Error("Patient model has no body mesh");
    // when labels are crowded, the hip and shoulder landmarks win
    const rank = ["Acromion", "GreaterTrochanter", "IliacCrest", "ASIS", "LateralCondyle", "AxillaryFold", "Elbow"];
    landmarks.sort((a, b) => rank.indexOf(a.key) - rank.indexOf(b.key));
    const height = new Box3().setFromObject(body).max.y || 1.7;

    // landmark dots (shown with the overlays)
    const dots = new Group();
    const dotGeo = new SphereGeometry(height * 0.0042, 14, 10);
    const dotMat = new MeshBasicMaterial({ color: COLORS.guide, depthTest: false });
    for (const lm of landmarks) {
      if (lm.key.startsWith("ThighThird")) continue;
      const d = new Mesh(dotGeo, dotMat);
      d.position.copy(lm.pos);
      d.renderOrder = 12;
      dots.add(d);
    }
    overlays.push(dots);
    root.add(dots);
    overlays.forEach((o) => (o.visible = false));

    const patient: Patient = { kind, root, body, zones, overlays, landmarks, dots, regions, views, anatomy: null, anatomyRequested: false, height };
    this.patients.set(kind, patient);
    return patient;
  }

  private async attachAnatomy(p: Patient) {
    if (p.anatomyRequested) return;
    p.anatomyRequested = true;
    try {
      const scene = await this.load(`${p.kind}_anatomy`);
      const group = new Group();
      const bone = new MeshStandardMaterial({ color: COLORS.bone, roughness: 0.6 });
      const muscle = new MeshStandardMaterial({ color: COLORS.muscle, roughness: 0.62 });
      const nerve = new MeshStandardMaterial({ color: COLORS.nerve, roughness: 0.5 });
      for (const node of [...scene.children]) {
        const mesh = node as Mesh;
        if (!mesh.isMesh) continue;
        const name = stripPrefix(node.name);
        mesh.material = name.startsWith("Bone_") ? bone : name.startsWith("Nerve_") ? nerve : muscle;
        mesh.renderOrder = 1;
        group.add(mesh);
      }
      group.visible = this.landmarksOn && this.current === p;
      p.anatomy = group;
      p.root.add(group);
      this.dirty = true;
    } catch {
      p.anatomyRequested = false;
    }
  }

  /* --------------------------------------------------------- patient */

  async showPatient(kind: PatientKind, view: ViewName, spin: boolean) {
    this.cb.onLoading?.(this.patients.has(kind) ? null : "Loading patient model");
    let p: Patient;
    try {
      p = await this.getPatient(kind);
    } catch {
      this.cb.onLoading?.(null);
      this.cb.onError?.("The patient model could not be loaded. Check your connection and reload.");
      return;
    }
    if (this.disposed) return;
    this.cb.onLoading?.(null);
    if (this.current && this.current !== p) this.patientScene.remove(this.current.root);
    if (this.current !== p) {
      this.patientScene.add(p.root);
      this.current = p;
      this.buildLabels();
    }
    this.mode = "patient";
    this.marker.visible = false;
    this.spin = spin && !this.reducedMotion;
    this.spinHold = 0;
    this.applyLandmarks();
    this.setView(view, false);
    this.dirty = true;
  }

  setInteractive(on: boolean) {
    this.interactive = on;
  }

  setLabels(specs: LabelSpec[]) {
    this.labelSpecs = specs;
    this.buildLabels();
  }

  setLandmarks(on: boolean) {
    this.landmarksOn = on;
    this.applyLandmarks();
  }

  private applyLandmarks() {
    const p = this.current;
    if (!p) return;
    const on = this.landmarksOn;
    if (on) {
      void this.attachAnatomy(p);
      this.computeLandmarkNormals(p);
    }
    p.overlays.forEach((o) => (o.visible = on));
    if (p.anatomy) p.anatomy.visible = on;
    const skin = p.body.material as MeshStandardMaterial;
    skin.transparent = on;
    skin.opacity = on ? 0.36 : 1;
    skin.depthWrite = !on;
    skin.needsUpdate = true;
    p.body.renderOrder = on ? 4 : 0;
    this.overlay.dataset.labels = on && this.mode === "patient" ? "on" : "off";
    this.dirty = true;
  }

  private computeLandmarkNormals(p: Patient) {
    const up = new Vector3(0, 1, 0);
    for (const lm of p.landmarks) {
      if (lm.normal) continue;
      // outward guess: away from the body's vertical axis, a little upward for the shoulder
      const guess = new Vector3(lm.pos.x, 0, lm.pos.z);
      if (guess.lengthSq() < 1e-8) guess.set(0, 0, 1);
      guess.normalize();
      if (lm.key === "Acromion") guess.addScaledVector(up, 1.2).normalize();
      if (lm.key === "Elbow" || lm.key === "AxillaryFold") guess.set(0, 0, 1);
      lm.normal = guess;
    }
  }

  private buildLabels() {
    this.overlay.querySelectorAll("[data-lm]").forEach((n) => n.remove());
    const p = this.current;
    if (!p) return;
    const text = new Map(this.labelSpecs.map((s) => [s.key, s.text]));
    for (const lm of p.landmarks) {
      const t = text.get(lm.key);
      if (!t) {
        lm.el = null;
        continue;
      }
      const el = document.createElement("span");
      el.dataset.lm = lm.key;
      el.className = "lm-label";
      el.textContent = t;
      this.overlay.appendChild(el);
      lm.el = el;
    }
  }

  setMarker(point: [number, number, number] | null) {
    const p = this.current;
    if (!point || !p) {
      this.marker.visible = false;
    } else {
      this.marker.position.set(point[0], point[1], point[2]);
      this.marker.scale.setScalar(p.height * 0.0048);
      this.marker.visible = true;
    }
    this.dirty = true;
  }

  /** Move the camera to look at a tapped point from where the learner is standing. */
  focusOn(point: [number, number, number]) {
    const p = this.current;
    if (!p) return;
    const c = new Vector3(point[0], point[1], point[2]);
    const r = p.height * 0.17;
    const box = new Box3(c.clone().subScalar(r), c.clone().addScalar(r));
    // the learner tapped it, so it is already facing the camera: keep the angle, move closer
    this.flyTo(box, this.yaw, this.pitch, true);
  }

  setView(view: ViewName, animate = true) {
    const p = this.current;
    if (!p) return;
    const left = Math.sin(this.yaw) >= 0;
    const side: Side = left ? "L" : "R";
    const sgn = left ? 1 : -1;
    const spec: Record<ViewName, { box: string; yaw: number; pitch: number }> = {
      body: { box: "Body", yaw: this.spin ? this.yaw : 0.55, pitch: 0.06 },
      case: { box: "Case", yaw: 0.62, pitch: 0.08 },
      arm: { box: `Arm_${side}`, yaw: 1.05 * sgn, pitch: 0.12 },
      thigh: { box: `Thigh_${side}`, yaw: 0.8 * sgn, pitch: 0.1 },
      hip: { box: `Hip_${side}`, yaw: 1.2 * sgn, pitch: 0.1 },
    };
    const s = spec[view];
    const box = p.views.get(s.box) ?? p.views.get("Body");
    if (!box) return;
    this.flyTo(box, s.yaw, s.pitch, animate);
  }

  /* ---------------------------------------------------------- camera */

  private lastFit: { box: Box3; margin: number } | null = null;

  private distanceFor(box: Box3, yaw: number, pitch: number, margin: number) {
    const centre = box.getCenter(new Vector3());
    const cp = Math.cos(pitch);
    const fwd = new Vector3(Math.sin(yaw) * cp, Math.sin(pitch), Math.cos(yaw) * cp);
    const right = new Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
    const up = new Vector3().crossVectors(fwd, right).normalize();
    let hw = 0;
    let hh = 0;
    let depth = 0;
    const v = new Vector3();
    for (let i = 0; i < 8; i++) {
      v.set(i & 1 ? box.max.x : box.min.x, i & 2 ? box.max.y : box.min.y, i & 4 ? box.max.z : box.min.z).sub(centre);
      hw = Math.max(hw, Math.abs(v.dot(right)));
      hh = Math.max(hh, Math.abs(v.dot(up)));
      depth = Math.max(depth, v.dot(fwd));
    }
    const tanV = Math.tan((this.camera.fov * DEG) / 2);
    const tanH = tanV * this.camera.aspect;
    return Math.max(hh / tanV, hw / tanH) * margin + depth;
  }

  private flyTo(box: Box3, yaw: number, pitch: number, animate: boolean, margin = 1.12) {
    this.lastFit = { box: box.clone(), margin };
    const centre = box.getCenter(new Vector3());
    const dist = this.distanceFor(box, yaw, pitch, margin);
    this.fitDist = dist;
    const from = { t: this.target.clone(), yaw: this.yaw, pitch: this.pitch, dist: this.dist };
    // take the short way round
    let dy = yaw - from.yaw;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    const apply = (k: number) => {
      this.target.lerpVectors(from.t, centre, k);
      this.yaw = from.yaw + dy * k;
      this.pitch = from.pitch + (pitch - from.pitch) * k;
      this.dist = from.dist + (dist - from.dist) * k;
      this.dirty = true;
    };
    this.tweens = this.tweens.filter((t) => t.step !== this.camStep);
    if (!animate || this.reducedMotion) {
      apply(1);
      return;
    }
    this.camStep = (k: number) => apply(ease(k));
    this.tweens.push({ t0: performance.now(), ms: 520, step: this.camStep });
  }

  private camStep: (k: number) => void = () => undefined;

  private refit(animate: boolean) {
    if (!this.lastFit) return;
    this.flyTo(this.lastFit.box, this.yaw, this.pitch, animate, this.lastFit.margin);
  }

  private placeCamera() {
    const cp = Math.cos(this.pitch);
    this.camera.position.set(
      this.target.x + Math.sin(this.yaw) * cp * this.dist,
      this.target.y + Math.sin(this.pitch) * this.dist,
      this.target.z + Math.cos(this.yaw) * cp * this.dist,
    );
    this.camera.lookAt(this.target);
    this.camera.near = Math.max(0.002, this.dist * 0.02);
    this.camera.far = this.dist * 6 + 5;
    this.camera.updateProjectionMatrix();
  }

  /* -------------------------------------------------------- gestures */

  private onDown = (e: PointerEvent) => {
    if (!this.interactive && this.mode === "patient" && !this.spin) return;
    this.canvas.setPointerCapture(e.pointerId);
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
    if (this.pointers.size === 1) {
      this.moved = false;
      this.pinch = null;
    } else if (this.pointers.size === 2) {
      const [a, b] = [...this.pointers.values()];
      this.pinch = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, dist: this.dist };
      this.moved = true; // a pinch never ends in a tap
    }
  };

  private onMove = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 2 && this.pinch) {
      const [a, b] = [...this.pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      this.zoomTo(this.pinch.dist * (this.pinch.d / d));
      return;
    }
    if (this.pointers.size !== 1) return;
    // a tap becomes a drag only after the finger has travelled, however long it rests
    if (!this.moved && Math.hypot(e.clientX - p.sx, e.clientY - p.sy) > TAP_SLOP_PX) this.moved = true;
    if (!this.moved || this.mode !== "patient") return;
    this.tweens = this.tweens.filter((t) => t.step !== this.camStep);
    this.yaw -= dx * 0.0085;
    this.pitch = Math.min(0.95, Math.max(-0.45, this.pitch + dy * 0.006));
    this.spinHold = 3.5;
    this.dirty = true;
  };

  private onUp = (e: PointerEvent) => {
    const p = this.pointers.get(e.pointerId);
    this.pointers.delete(e.pointerId);
    if (this.canvas.hasPointerCapture(e.pointerId)) this.canvas.releasePointerCapture(e.pointerId);
    if (!p) return;
    if (this.pointers.size === 0) {
      const tap = !this.moved && !this.pinch;
      this.pinch = null;
      if (tap && this.interactive && this.mode === "patient") this.tapAt(e.clientX, e.clientY);
    }
  };

  private onCancel = (e: PointerEvent) => {
    this.pointers.delete(e.pointerId);
    this.moved = true;
    if (this.pointers.size === 0) this.pinch = null;
  };

  private onWheel = (e: WheelEvent) => {
    if (this.mode !== "patient") return;
    e.preventDefault();
    this.zoomTo(this.dist * Math.exp(e.deltaY * 0.0012));
  };

  private zoomTo(d: number) {
    if (this.mode !== "patient") return;
    this.tweens = this.tweens.filter((t) => t.step !== this.camStep);
    this.dist = Math.min(this.fitDist * 1.5, Math.max(this.fitDist * 0.3, d));
    this.spinHold = 3.5;
    this.dirty = true;
  }

  /** Zoom control for people who cannot pinch. */
  zoomBy(factor: number) {
    this.zoomTo(this.dist * factor);
  }

  rotateBy(rad: number) {
    if (this.mode !== "patient") return;
    this.yaw += rad;
    this.spinHold = 3.5;
    this.dirty = true;
  }

  private ndc(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    return new Vector2(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
  }

  private tapAt(clientX: number, clientY: number) {
    const p = this.current;
    if (!p) return;
    this.placeCamera();
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.ndc(clientX, clientY), this.camera);
    const hit = this.raycaster.intersectObject(p.body, false)[0];
    if (!hit) return;
    let zoneHit = this.raycaster.intersectObjects(p.zones, false).find((z) => z.distance <= hit.distance + p.height * 0.006);
    if (!zoneHit) {
      // a fingertip is wider than a pixel: look a short way around the tap for a zone edge
      let best = Infinity;
      for (const radius of [5, 10]) {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          const x = clientX + Math.cos(a) * radius;
          const y = clientY + Math.sin(a) * radius;
          this.raycaster.setFromCamera(this.ndc(x, y), this.camera);
          const b = this.raycaster.intersectObject(p.body, false)[0];
          if (!b) continue;
          const z = this.raycaster.intersectObjects(p.zones, false).find((q) => q.distance <= b.distance + p.height * 0.006);
          if (z && radius < best) {
            best = radius;
            zoneHit = z;
          }
        }
        if (zoneHit) break;
      }
    }
    const point = (zoneHit ?? hit).point;
    const side: Side = zoneHit ? (zoneHit.object.userData.side as Side) : point.x >= 0 ? "L" : "R";
    let region = "Body";
    let nearest = Infinity;
    for (const r of p.regions) {
      const d = r.pos.distanceToSquared(hit.point);
      if (d < nearest) {
        nearest = d;
        region = r.name;
      }
    }
    this.cb.onTap?.({
      zone: zoneHit ? (zoneHit.object.userData.zone as string) : null,
      side,
      region,
      point: [point.x, point.y, point.z],
    });
  }

  /** Centre of a named zone on one side, for people who choose from the list. */
  zoneCentre(zone: string, side: Side): [number, number, number] | null {
    const mesh = this.current?.zones.find((z) => z.userData.zone === zone && z.userData.side === side);
    if (!mesh) return null;
    const c = new Box3().setFromObject(mesh).getCenter(new Vector3());
    return [c.x, c.y, c.z];
  }

  /* --------------------------------------------------------- cutaway */

  async showCutaway(profile: CutawayProfile) {
    this.profile = profile;
    if (!this.tissue || !this.syringe) {
      this.cb.onLoading?.("Loading tissue view");
      try {
        const [t, s] = await Promise.all([this.load("tissue"), this.load("syringe")]);
        if (this.disposed) return;
        this.buildCutaway(t, s);
      } catch {
        this.cb.onLoading?.(null);
        this.cb.onError?.("The tissue view could not be loaded. Check your connection and reload.");
        return;
      }
      this.cb.onLoading?.(null);
    }
    this.mode = "cutaway";
    this.spin = false;
    this.overlay.dataset.labels = "off";
    this.inserted = 0;
    this.plunger = 1;
    this.layoutCutaway();
    this.poseSyringe();
    this.fitCutaway(false);
    this.dirty = true;
  }

  private buildCutaway(tissueScene: Group, syringeScene: Group) {
    const tissue = new Group();
    for (const node of [...tissueScene.children]) {
      const mesh = node as Mesh;
      const name = stripPrefix(node.name);
      if (!mesh.isMesh) continue;
      const src = mesh.material as MeshStandardMaterial;
      const hasColor = !!mesh.geometry.getAttribute("color");
      const mat = new MeshStandardMaterial({
        color: hasColor ? 0xffffff : src.color,
        vertexColors: hasColor,
        roughness: name === "Bone" ? 0.55 : 0.72,
        metalness: 0,
      });
      if (name === "Fat") mat.clippingPlanes = this.fatPlanes;
      if (name === "Muscle") mat.clippingPlanes = this.musclePlanes;
      mesh.material = mat;
      // compressed meshes carry their own offset and scale, so move a wrapper, never the mesh
      const holder = new Group();
      holder.name = name;
      holder.add(mesh);
      tissue.add(holder);
    }
    this.tissue = tissue;
    this.cutScene.add(tissue);

    const syringe = new Group();
    for (const node of [...syringeScene.children]) {
      const mesh = node as Mesh;
      const name = stripPrefix(node.name);
      if (!mesh.isMesh) continue;
      const mat = mesh.material as MeshStandardMaterial;
      if (name === "Barrel" || name === "Fluid") {
        mat.transparent = true;
        mat.depthWrite = false;
        mat.opacity = name === "Barrel" ? 0.34 : 0.6;
        mesh.renderOrder = name === "Barrel" ? 3 : 2;
      }
      if (name === "Needle") {
        mat.metalness = 0.6;
        mat.roughness = 0.35;
        mat.color = new Color("#aeb6bb");
      }
      const holder = new Group();
      holder.name = name;
      holder.add(mesh);
      this.syringeParts[name] = holder;
      syringe.add(holder);
    }
    this.syringe = syringe;
    this.cutScene.add(syringe);
  }

  private layoutCutaway() {
    const t = this.tissue;
    if (!t) return;
    const fat = -this.profile.fatBottomMm / 1000;
    const bone = -this.profile.boneTopMm / 1000;
    this.fatPlanes[0].constant = -0.0022; // keep y <= -2.2 mm
    this.fatPlanes[1].constant = -fat; // keep y >= fat bottom
    this.musclePlanes[0].constant = fat;
    this.musclePlanes[1].constant = -bone;
    const set = (name: string, y: number) => {
      const o = t.getObjectByName(name);
      if (o) o.position.y = y;
    };
    set("Fascia", fat);
    set("Periosteum", bone);
    set("Bone", bone);
  }

  private fitCutaway(animate: boolean) {
    const bottom = -(this.profile.boneTopMm + 9) / 1000;
    const box = new Box3(new Vector3(-0.037, bottom, -0.02), new Vector3(0.037, 0.046, 0.02));
    this.flyTo(box, -0.2, 0.2, animate, 1.04);
  }

  setProfile(profile: CutawayProfile) {
    this.profile = profile;
    if (this.mode !== "cutaway") return;
    this.layoutCutaway();
    this.fitCutaway(true);
    this.poseSyringe();
  }

  setNeedle(pose: NeedlePose) {
    this.needle = pose;
    if (this.mode !== "cutaway") return;
    const ready = pose.lengthMm !== null && pose.angleDeg !== null;
    this.tweens = this.tweens.filter((t) => t.step !== this.needleStep);
    this.plunger = 1;
    if (!ready) {
      this.inserted = 0;
      this.poseSyringe();
      return;
    }
    if (this.reducedMotion) {
      this.inserted = 1;
      this.poseSyringe();
      return;
    }
    this.inserted = 0;
    this.needleStep = (k: number) => {
      this.inserted = ease(k);
      this.poseSyringe();
    };
    this.tweens.push({ t0: performance.now() + 140, ms: 720, step: this.needleStep });
    this.poseSyringe();
  }

  private needleStep: (k: number) => void = () => undefined;

  /** Press the plunger (shown once the answer has been checked). */
  inject() {
    if (this.mode !== "cutaway") return;
    if (this.reducedMotion) {
      this.plunger = 0;
      this.poseSyringe();
      return;
    }
    const step = (k: number) => {
      this.plunger = 1 - ease(k);
      this.poseSyringe();
    };
    this.tweens.push({ t0: performance.now() + 200, ms: 900, step });
  }

  private poseSyringe() {
    const s = this.syringe;
    if (!s) return;
    const lengthMm = this.needle.lengthMm ?? 25;
    const angle = (this.needle.angleDeg ?? 90) * DEG;
    const L = lengthMm / 1000;
    const dir = new Vector3(-Math.cos(angle), -Math.sin(angle), 0);
    const full = this.needle.bevelOnly ? Math.min(L, 0.0042) : L;
    const hover = 0.004;
    const depthAlong = -hover + (full + hover) * this.inserted;
    const base = this.entry.clone().addScaledVector(dir, depthAlong - L);
    s.position.copy(base);
    s.rotation.set(0, 0, angle - Math.PI / 2);
    const needle = this.syringeParts.Needle;
    if (needle) needle.scale.y = lengthMm / 25.4;
    // half a millilitre drawn up; the stopper and rod travel with the fluid
    const travel = 0.0163 * 0.5 * this.plunger;
    for (const key of ["Stopper", "Plunger"]) {
      const part = this.syringeParts[key];
      if (part) part.position.y = travel;
    }
    const fluid = this.syringeParts.Fluid;
    if (fluid) {
      const k = Math.max(0.02, 0.5 * this.plunger);
      fluid.scale.y = k;
      fluid.position.y = 0.024 * (1 - k);
      fluid.visible = this.plunger > 0.03;
    }
    const tip = this.entry.clone().addScaledVector(dir, Math.max(0, depthAlong));
    const ready = this.needle.lengthMm !== null && this.needle.angleDeg !== null;
    this.tipDot.position.copy(tip);
    this.tipDot.visible = ready && this.inserted > 0.98;
    this.dirty = true;
  }

  /* ------------------------------------------------------------ loop */

  private frame = (now: number) => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - (this.lastTime || now)) / 1000);
    this.lastTime = now;
    this.resize();

    if (this.tweens.length) {
      this.tweens = this.tweens.filter((t) => {
        if (now < t.t0) return true;
        const k = t.ms <= 0 ? 1 : Math.min(1, (now - t.t0) / t.ms);
        t.step(k);
        if (k >= 1) t.done?.();
        return k < 1;
      });
      this.dirty = true;
    }
    if (this.spin && this.mode === "patient" && this.pointers.size === 0 && !document.hidden) {
      if (this.spinHold > 0) this.spinHold -= dt;
      else {
        this.yaw += dt * 0.22;
        this.dirty = true;
      }
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.placeCamera();
    this.camera.updateMatrixWorld();
    if (this.mode === "patient") {
      if (this.marker.visible) this.marker.quaternion.copy(this.camera.quaternion);
      this.renderer.render(this.patientScene, this.camera);
      this.updateLabels();
    } else {
      this.renderer.render(this.cutScene, this.camera);
      this.updateLayers();
    }
  };

  private project(v: Vector3) {
    const p = v.clone().project(this.camera);
    return { x: (p.x * 0.5 + 0.5) * this.width, y: (-p.y * 0.5 + 0.5) * this.height, behind: p.z > 1 };
  }

  private updateLabels() {
    const p = this.current;
    if (!p || !this.landmarksOn) return;
    const camDir = this.camera.position.clone().sub(this.target).normalize();
    const placed: { x: number; y: number }[] = [];
    const nearSide: Side = camDir.x >= 0 ? "L" : "R";
    for (const lm of p.landmarks) {
      const el = lm.el;
      if (!el) continue;
      const facing = lm.normal ? lm.normal.dot(camDir) : 1;
      const s = this.project(lm.pos);
      const inside = s.x > 8 && s.x < this.width - 8 && s.y > 8 && s.y < this.height - 8;
      const clash = placed.some((q) => Math.abs(q.x - s.x) < 110 && Math.abs(q.y - s.y) < 18);
      const show = lm.side === nearSide && facing > 0.05 && inside && !s.behind && !clash;
      el.style.opacity = show ? "1" : "0";
      if (show) {
        placed.push(s);
        const leftSide = s.x > this.width * 0.62;
        el.dataset.flip = leftSide ? "1" : "0";
        el.style.transform = `translate(${s.x.toFixed(1)}px, ${s.y.toFixed(1)}px)`;
      }
    }
  }

  private updateLayers() {
    if (!this.cb.onLayers) return;
    const z = 0.02;
    const x = 0.035;
    const f = this.profile;
    const mid = (a: number, b: number) => this.project(new Vector3(x, -(a + b) / 2000, z)).y;
    const rows = [
      { id: "skin", y: mid(0, f.skinMm), visible: true },
      { id: "fat", y: mid(f.skinMm, f.fatBottomMm), visible: true },
      { id: "muscle", y: mid(f.fatBottomMm, f.boneTopMm), visible: true },
      { id: "bone", y: mid(f.boneTopMm, f.boneTopMm + 9), visible: true },
    ];
    const tip = this.tipDot.visible ? this.project(this.tipDot.position) : null;
    this.cb.onLayers(rows, tip ? { x: tip.x, y: tip.y } : null);
  }
}

/** True when this browser can create a WebGL context. */
export function webglAvailable(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}
