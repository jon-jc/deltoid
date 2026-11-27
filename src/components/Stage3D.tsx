"use client";

import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { LANDMARKS, TISSUES, type TissueId } from "@/content/clinical";
import type { CutawayProfile, NeedlePose, PatientKind, Side, Stage, TapResult, ViewName } from "@/three/stage";
import styles from "./stage.module.css";

export interface StageHandle {
  zoneCentre: (zone: string, side: Side) => [number, number, number] | null;
}

export interface Stage3DProps {
  mode: "home" | "site" | "cutaway" | "answer";
  patient: PatientKind;
  landmarks: boolean;
  view: { name: ViewName; nonce: number };
  marker: [number, number, number] | null;
  profile: CutawayProfile;
  needle: NeedlePose;
  injected: boolean;
  tipTissue: TissueId | null;
  /** In "answer" mode: the injection area to pick out on the patient, and its name. */
  answer: { zone: string; side: Side; label: string } | null;
  /** Height in pixels of controls drawn over the bottom of the view. */
  bottomInset: number;
  onTap: (tap: TapResult) => void;
  handle?: Ref<StageHandle>;
}

interface LayerRow {
  id: string;
  y: number;
}

const LAYER_ORDER: TissueId[] = ["skin", "fat", "muscle", "bone"];

export default function Stage3D(props: Stage3DProps) {
  const { mode, patient, landmarks, view, marker, profile, needle, injected, tipTissue, answer, bottomInset, onTap, handle } = props;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Stage | null>(null);
  const tapRef = useRef(onTap);
  const profileRef = useRef(profile);
  const liveRef = useRef({ answer, marker, injected, needle });
  const [gen, setGen] = useState(0);
  const [problem, setProblem] = useState<"none" | "nowebgl" | "error">("none");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState<string | null>("Loading 3D view");
  const [rows, setRows] = useState<LayerRow[]>([]);

  useEffect(() => {
    tapRef.current = onTap;
    profileRef.current = profile;
    liveRef.current = { answer, marker, injected, needle };
  });

  useImperativeHandle(handle, () => ({
    zoneCentre: (zone, side) => stageRef.current?.zoneCentre(zone, side) ?? null,
  }));

  // create the engine once the page is interactive; three.js loads here, not in the first bundle
  useEffect(() => {
    let cancelled = false;
    let stage: Stage | null = null;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!canvas || !overlay) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    void (async () => {
      try {
        const mod = await import("@/three/stage");
        if (cancelled) return;
        if (!mod.webglAvailable()) {
          setProblem("nowebgl");
          setLoading(null);
          return;
        }
        stage = new mod.Stage(canvas, overlay, reduced, {
          onTap: (t) => tapRef.current(t),
          onLoading: (label) => setLoading(label),
          onError: (m) => {
            setProblem("error");
            setMessage(m);
          },
          onLayers: (next) => {
            setRows((prev) => {
              const same = prev.length === next.length && prev.every((r, i) => Math.abs(r.y - next[i].y) < 0.5);
              return same ? prev : next.map((r) => ({ id: r.id, y: r.y }));
            });
          },
        });
        stage.setLabels(Object.entries(LANDMARKS).map(([key, text]) => ({ key, text })));
        stageRef.current = stage;
        setGen((g) => g + 1);
      } catch {
        if (!cancelled) {
          setProblem("nowebgl");
          setLoading(null);
        }
      }
    })();
    return () => {
      cancelled = true;
      stage?.dispose();
      stageRef.current = null;
    };
  }, []);

  useEffect(() => {
    stageRef.current?.setBottomInset(mode === "cutaway" ? 0 : bottomInset);
  }, [gen, mode, bottomInset]);

  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    const live = liveRef.current;
    if (mode === "cutaway") {
      // the cutaway opens with the syringe above the skin: put the chosen needle back in,
      // and press the plunger again when coming back to an answer that was already checked
      void s.showCutaway(profileRef.current).then(() => {
        const now = liveRef.current;
        s.setNeedle({ lengthMm: now.needle.lengthMm, angleDeg: now.needle.angleDeg, bevelOnly: now.needle.bevelOnly });
        if (now.injected) s.inject();
      });
    } else if (mode === "answer" && live.answer) {
      s.setInteractive(true);
      void s.showAnswer(patient, live.answer.zone, live.answer.side, live.marker);
    } else {
      s.setInteractive(mode === "site");
      void s.showPatient(patient, mode === "home" ? "body" : "case", mode === "home");
      if (mode === "site") s.preload(["tissue", "syringe", `${patient}_anatomy`]);
    }
  }, [gen, mode, patient]);

  useEffect(() => {
    stageRef.current?.setProfile({ skinMm: profile.skinMm, fatBottomMm: profile.fatBottomMm, boneTopMm: profile.boneTopMm });
  }, [gen, profile.skinMm, profile.fatBottomMm, profile.boneTopMm]);

  useEffect(() => {
    stageRef.current?.setLandmarks(landmarks);
  }, [gen, landmarks]);

  useEffect(() => {
    if (view.nonce > 0) stageRef.current?.setView(view.name);
  }, [view.name, view.nonce]);

  useEffect(() => {
    const s = stageRef.current;
    if (!s) return;
    s.setMarker(marker);
    if (marker && mode === "site") s.focusOn(marker);
  }, [gen, marker, mode]);

  useEffect(() => {
    stageRef.current?.setNeedle({ lengthMm: needle.lengthMm, angleDeg: needle.angleDeg, bevelOnly: needle.bevelOnly });
  }, [gen, needle.lengthMm, needle.angleDeg, needle.bevelOnly]);

  useEffect(() => {
    if (injected) stageRef.current?.inject();
  }, [gen, injected]);

  const label =
    mode === "cutaway"
      ? "Cross-section of skin, fat, muscle and bone with a syringe. The layer the needle tip reaches is named below."
      : mode === "site"
        ? "3D patient. Tap the injection site, drag to turn, pinch to zoom. A list of sites is available below."
        : mode === "answer"
          ? `3D patient with the landmarks showing and CDC's site picked out: ${answer?.label ?? ""}. Drag to turn, pinch to zoom.`
          : "3D patient figure turning slowly.";

  return (
    <div className={styles.stage} data-mode={mode}>
      <canvas ref={canvasRef} className={styles.canvas} role="img" aria-label={label} />
      <div ref={overlayRef} className={styles.overlay} aria-hidden="true" data-labels="off" />

      {mode === "cutaway" && problem === "none" && (
        <div className={styles.layers} aria-hidden="true">
          {rows.map((r) => (
            <span
              key={r.id}
              className={styles.layer}
              data-on={tipTissue === r.id ? "1" : "0"}
              style={{ transform: `translateY(${r.y.toFixed(1)}px)` }}
            >
              {TISSUES[r.id as TissueId].label}
            </span>
          ))}
        </div>
      )}

      {mode === "cutaway" && problem === "none" && (
        <p className={styles.tip} role="status">
          {tipTissue ? (
            <>
              Needle tip: <strong>{TISSUES[tipTissue].label.toLowerCase()}</strong>
            </>
          ) : (
            "Pick a needle and an angle"
          )}
          <span className={styles.caption}>Schematic, not to scale</span>
        </p>
      )}

      {mode === "answer" && answer && problem === "none" && (
        <p className={styles.tip} data-wide="1" role="status">
          CDC&apos;s site: <strong>{answer.label}</strong>
          {marker && <span className={styles.caption}>The orange dot is where you tapped</span>}
        </p>
      )}

      {mode === "cutaway" && (
        <ol className={styles.srOnly}>
          {LAYER_ORDER.map((id) => (
            <li key={id}>{TISSUES[id].label}</li>
          ))}
        </ol>
      )}

      {loading && problem === "none" && (
        <p className={styles.loading} role="status">
          <span className={styles.spinner} aria-hidden="true" />
          {loading}
        </p>
      )}

      {problem === "nowebgl" && (
        <div className={styles.notice} role="alert">
          <strong>The 3D view cannot start on this device.</strong>
          <span>
            This trainer needs WebGL, which is off or unavailable in this browser. Try a current version of Chrome, Safari,
            Edge or Firefox, or switch hardware acceleration on.
          </span>
        </div>
      )}
      {problem === "error" && (
        <div className={styles.notice} role="alert">
          <strong>Something went wrong with the 3D view.</strong>
          <span>{message}</span>
        </div>
      )}
    </div>
  );
}
