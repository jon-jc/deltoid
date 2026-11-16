"use client";

import Link from "next/link";
import { useEffect, useMemo, useReducer, useRef } from "react";
import {
  ANGLES,
  ANGLE_ORDER,
  CASES,
  COPY,
  NEEDLES,
  NEEDLE_ORDER,
  REGIONS,
  ROUTES,
  SITES,
  SOURCES,
  type AngleId,
  type Case,
  type NeedleId,
  type SiteId,
  type SourceId,
} from "@/content/clinical";
import { correctAnswer, cutawayProfile, grade, tipTissue, type Pick, type Result } from "@/lib/grading";
import type { TapResult, ViewName } from "@/three/stage";
import Stage3D, { type StageHandle } from "./Stage3D";
import styles from "./trainer.module.css";

/* -------------------------------------------------------------- state */

interface Tap {
  site: SiteId | null;
  side: "L" | "R";
  region: string;
  point: [number, number, number];
}

interface Attempt {
  caseId: string;
  pick: Pick;
  result: Result;
  landmarks: boolean;
}

interface State {
  screen: "home" | "case" | "review";
  demo: boolean;
  index: number;
  step: "site" | "needle" | "result";
  tap: Tap | null;
  needle: NeedleId | null;
  angle: AngleId | null;
  landmarks: boolean;
  usedLandmarks: boolean;
  view: { name: ViewName; nonce: number };
  attempts: Attempt[];
}

type Action =
  | { type: "start"; demo: boolean }
  | { type: "home" }
  | { type: "tap"; tap: Tap }
  | { type: "toNeedle" }
  | { type: "changeSite" }
  | { type: "needle"; id: NeedleId }
  | { type: "angle"; id: AngleId }
  | { type: "check" }
  | { type: "next" }
  | { type: "landmarks" }
  | { type: "view"; name: ViewName };

const INITIAL: State = {
  screen: "home",
  demo: false,
  index: 0,
  step: "site",
  tap: null,
  needle: null,
  angle: null,
  landmarks: false,
  usedLandmarks: false,
  view: { name: "case", nonce: 0 },
  attempts: [],
};

const freshCase = { step: "site" as const, tap: null, needle: null, angle: null, landmarks: false, usedLandmarks: false };

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "start":
      return { ...INITIAL, screen: "case", demo: a.demo, view: { name: "case", nonce: s.view.nonce } };
    case "home":
      return { ...INITIAL, view: { name: "case", nonce: s.view.nonce } };
    case "tap":
      return s.step === "site" ? { ...s, tap: a.tap } : s;
    case "toNeedle":
      return s.tap && s.step === "site" ? { ...s, step: "needle", landmarks: false } : s;
    case "changeSite":
      return { ...s, step: "site", tap: null, needle: null, angle: null };
    case "needle":
      return s.step === "needle" ? { ...s, needle: a.id } : s;
    case "angle":
      return s.step === "needle" ? { ...s, angle: a.id } : s;
    case "check": {
      if (s.step !== "needle" || !s.tap || !s.needle || !s.angle) return s;
      const c = CASES[s.index];
      const pick: Pick = { site: s.tap.site, side: s.tap.side, region: s.tap.region, needle: s.needle, angle: s.angle };
      return {
        ...s,
        step: "result",
        attempts: [...s.attempts, { caseId: c.id, pick, result: grade(c, pick), landmarks: s.usedLandmarks }],
      };
    }
    case "next":
      if (s.index + 1 >= CASES.length) return { ...s, screen: "review", ...freshCase };
      return { ...s, index: s.index + 1, ...freshCase };
    case "landmarks":
      return { ...s, landmarks: !s.landmarks, usedLandmarks: s.usedLandmarks || !s.landmarks };
    case "view":
      return { ...s, view: { name: a.name, nonce: s.view.nonce + 1 } };
    default:
      return s;
  }
}

/* ------------------------------------------------------------ helpers */

function SourceLinks({ ids }: { ids: SourceId[] }) {
  return (
    <p className={styles.sources}>
      <span>Source{ids.length > 1 ? "s" : ""}: </span>
      {ids.map((id, i) => (
        <span key={id}>
          {i > 0 && ", "}
          <a href={SOURCES[id].url} target="_blank" rel="noopener noreferrer">
            {SOURCES[id].short}
          </a>
        </span>
      ))}
      . <Link href="/sources">All sources</Link>
    </p>
  );
}

function CaseCard({ c, compact }: { c: Case; compact?: boolean }) {
  const route = ROUTES[c.route];
  return (
    <div className={styles.card} data-compact={compact ? "1" : "0"}>
      <h2 className={styles.cardTitle}>{c.title}</h2>
      <dl className={styles.cardFacts}>
        <div>
          <dt>Patient</dt>
          <dd>{c.patient} (synthetic)</dd>
        </div>
        <div>
          <dt>Route</dt>
          <dd>
            {route.label}: {route.plain}
          </dd>
        </div>
        {c.constraint && (
          <div>
            <dt>Note</dt>
            <dd>{c.constraint}</dd>
          </div>
        )}
      </dl>
    </div>
  );
}

function siteText(tap: Tap) {
  if (tap.site) return `${SITES[tap.site].label}, ${tap.side === "L" ? "left" : "right"} side`;
  const r = REGIONS[tap.region] ?? REGIONS.Body;
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const VIEWS: { name: ViewName; label: string }[] = [
  { name: "case", label: "Body" },
  { name: "arm", label: "Arm" },
  { name: "thigh", label: "Thigh" },
  { name: "hip", label: "Hip" },
];

/* ------------------------------------------------------------ trainer */

export default function Trainer() {
  const [s, dispatch] = useReducer(reducer, INITIAL);
  const stage = useRef<StageHandle>(null);
  const panel = useRef<HTMLDivElement>(null);
  const c = CASES[s.index];
  const correctCount = s.attempts.filter((a) => a.result.correct).length;
  const last = s.attempts[s.attempts.length - 1];

  // after a tap, let the learner see where it landed, then move to the needle step
  useEffect(() => {
    if (s.screen !== "case" || s.step !== "site" || !s.tap) return;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const id = window.setTimeout(() => dispatch({ type: "toNeedle" }), reduce ? 250 : 800);
    return () => window.clearTimeout(id);
  }, [s.screen, s.step, s.tap]);

  // each new step starts at the top of the panel
  useEffect(() => {
    panel.current?.scrollTo({ top: 0 });
  }, [s.screen, s.step, s.index]);

  const profile = useMemo(() => cutawayProfile(c, acceptedSite(c, s.tap)), [c, s.tap]);
  const tip = s.needle && s.angle ? tipTissue(c, acceptedSite(c, s.tap), s.needle, s.angle) : null;
  const needlePose = useMemo(
    () => ({
      lengthMm: s.needle ? NEEDLES[s.needle].mm : null,
      angleDeg: s.angle ? ANGLES[s.angle].drawDeg : null,
      bevelOnly: s.angle === "shallow",
    }),
    [s.needle, s.angle],
  );

  const onTap = (t: TapResult) =>
    dispatch({ type: "tap", tap: { site: (t.zone as SiteId | null) ?? null, side: t.side, region: t.region, point: t.point } });

  const pickFromList = (site: SiteId) => {
    const point = stage.current?.zoneCentre(site, "L") ?? [0, 0, 0];
    dispatch({ type: "tap", tap: { site, side: "L", region: "Body", point } });
  };

  const stageMode = s.screen !== "case" ? "home" : s.step === "site" ? "site" : "cutaway";
  const patient = s.screen === "case" ? c.model : "adult";

  return (
    <main className={styles.shell}>
      <section className={styles.stageWrap} aria-label="3D view">
        <Stage3D
          handle={stage}
          mode={stageMode}
          patient={patient}
          landmarks={s.screen === "case" && s.step === "site" && s.landmarks}
          view={s.view}
          marker={s.screen === "case" && s.step === "site" && s.tap ? s.tap.point : null}
          profile={profile}
          needle={needlePose}
          injected={s.step === "result"}
          tipTissue={tip}
          bottomInset={s.screen === "case" && s.step === "site" ? 60 : 0}
          onTap={onTap}
        />
        {s.screen === "case" && s.step === "site" && (
          <div className={styles.stageBar}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={s.landmarks}
              onClick={() => dispatch({ type: "landmarks" })}
            >
              {s.landmarks ? "Hide landmarks" : "Show landmarks"}
            </button>
            <div className={styles.views} role="group" aria-label="Camera view">
              {VIEWS.map((v) => (
                <button key={v.name} type="button" className={styles.chip} onClick={() => dispatch({ type: "view", name: v.name })}>
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className={styles.panel} ref={panel}>
        {s.screen === "home" && (
          <div className={styles.home}>
            <h1 className={styles.lead}>{COPY.tagline}</h1>
            <div className={styles.actions}>
              <button type="button" className={styles.primary} onClick={() => dispatch({ type: "start", demo: true })}>
                Try a 30-second case
              </button>
              <button type="button" className={styles.secondary} onClick={() => dispatch({ type: "start", demo: false })}>
                Practice all cases
              </button>
            </div>
            <p className={styles.trust}>{COPY.shortTrust}</p>
          </div>
        )}

        {s.screen === "case" && (
          <>
            <div className={styles.progress}>
              <span>
                {s.demo && s.index === 0 ? "30-second case" : `Case ${s.index + 1} of ${CASES.length}`}
              </span>
              <span>
                {s.attempts.length > 0 && `${correctCount} of ${s.attempts.length} correct · `}
                <button type="button" className={styles.linkBtn} onClick={() => dispatch({ type: "home" })}>
                  Start over
                </button>
              </span>
            </div>

            {s.step === "site" && (
              <div className={styles.body}>
                <CaseCard c={c} />
                <p className={styles.prompt}>
                  {s.tap ? (
                    <span role="status">
                      Marked: <strong>{siteText(s.tap)}</strong>
                    </span>
                  ) : (
                    <>
                      <strong>Tap the injection site</strong> on the patient. Drag to turn, pinch to zoom.
                    </>
                  )}
                </p>
                <details className={styles.list}>
                  <summary>Choose the site from a list instead</summary>
                  <div className={styles.listGrid}>
                    {(Object.keys(SITES) as SiteId[]).map((id) => (
                      <button key={id} type="button" className={styles.option} onClick={() => pickFromList(id)}>
                        {SITES[id].label}
                      </button>
                    ))}
                  </div>
                </details>
              </div>
            )}

            {s.step === "needle" && s.tap && (
              <div className={styles.body}>
                <p className={styles.siteLine}>
                  <span>
                    <span className={styles.muted}>{c.patient} · {ROUTES[c.route].label}</span>
                    <br />
                    Site: <strong>{siteText(s.tap)}</strong>
                  </span>
                  <button type="button" className={styles.linkBtn} onClick={() => dispatch({ type: "changeSite" })}>
                    Change
                  </button>
                </p>
                <fieldset className={styles.control}>
                  <legend>Needle length</legend>
                  <div className={styles.segments} data-count={NEEDLE_ORDER.length}>
                    {NEEDLE_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={styles.segment}
                        aria-pressed={s.needle === id}
                        onClick={() => dispatch({ type: "needle", id })}
                      >
                        {NEEDLES[id].label}
                      </button>
                    ))}
                  </div>
                </fieldset>
                <fieldset className={styles.control}>
                  <legend>Angle to the skin</legend>
                  <div className={styles.segments} data-count={ANGLE_ORDER.length}>
                    {ANGLE_ORDER.map((id) => (
                      <button
                        key={id}
                        type="button"
                        className={styles.segment}
                        aria-pressed={s.angle === id}
                        onClick={() => dispatch({ type: "angle", id })}
                      >
                        {ANGLES[id].label}
                      </button>
                    ))}
                  </div>
                </fieldset>
              </div>
            )}

            {s.step === "result" && last && (
              <div className={styles.body}>
                <div className={styles.verdict} data-ok={last.result.correct ? "1" : "0"}>
                  <span className={styles.mark} aria-hidden="true">
                    {last.result.correct ? "✓" : "✕"}
                  </span>
                  <h2>{last.result.correct ? "Correct" : "Not quite"}</h2>
                </div>
                <p className={styles.summary} role="status">
                  {last.result.summary}
                </p>
                <ul className={styles.findings}>
                  {last.result.findings.map((f) => (
                    <li key={f.part} data-ok={f.ok ? "1" : "0"}>
                      <span aria-hidden="true">{f.ok ? "✓" : "✕"}</span>
                      <span>
                        <span className={styles.srOnly}>{f.ok ? "Right. " : "Off. "}</span>
                        {f.text}
                      </span>
                    </li>
                  ))}
                </ul>
                <SourceLinks ids={last.result.sources} />
                <p className={styles.fine}>{COPY.schematic}</p>
              </div>
            )}

            <div className={styles.footer}>
              {s.step === "site" && <p className={styles.hint}>The next step opens once you mark a site.</p>}
              {s.step === "needle" && (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!s.needle || !s.angle}
                  onClick={() => dispatch({ type: "check" })}
                >
                  Check answer
                </button>
              )}
              {s.step === "result" && (
                <button type="button" className={styles.primary} onClick={() => dispatch({ type: "next" })}>
                  {s.index + 1 >= CASES.length ? "See review" : "Next case"}
                </button>
              )}
            </div>
          </>
        )}

        {s.screen === "review" && (
          <>
            <div className={styles.body}>
              <h1 className={styles.lead}>
                {correctCount} of {s.attempts.length} correct
              </h1>
              {s.attempts.every((a) => a.result.correct) ? (
                <p className={styles.summary}>No misses. Every answer matched CDC guidance.</p>
              ) : (
                <>
                  <p className={styles.summary}>Each miss, with the answer CDC gives and where it comes from.</p>
                  <ol className={styles.review}>
                    {s.attempts
                      .filter((a) => !a.result.correct)
                      .map((a) => {
                        const rc = CASES.find((x) => x.id === a.caseId) as Case;
                        const ans = correctAnswer(rc);
                        return (
                          <li key={a.caseId}>
                            <h2>{rc.title}</h2>
                            <p className={styles.muted}>{rc.patient}{rc.constraint ? `. ${rc.constraint}` : ""}</p>
                            <p>{a.result.summary}</p>
                            <ul className={styles.findings}>
                              {a.result.findings
                                .filter((f) => !f.ok)
                                .map((f) => (
                                  <li key={f.part} data-ok="0">
                                    <span aria-hidden="true">✕</span>
                                    <span>{f.text}</span>
                                  </li>
                                ))}
                            </ul>
                            <p className={styles.answer}>
                              <strong>CDC:</strong> {ans.site.toLowerCase()}, {ans.needle} needle, {ans.angle}.
                            </p>
                            <SourceLinks ids={ans.sources} />
                          </li>
                        );
                      })}
                  </ol>
                </>
              )}
              <p className={styles.fine}>{COPY.educational}</p>
            </div>
            <div className={styles.footer}>
              <button type="button" className={styles.primary} onClick={() => dispatch({ type: "start", demo: false })}>
                Practice again
              </button>
              <button type="button" className={styles.secondary} onClick={() => dispatch({ type: "home" })}>
                Back to start
              </button>
            </div>
          </>
        )}
      </section>
    </main>
  );
}

/** The site used to draw the cutaway: the tapped zone when the case accepts it, otherwise the recommended one. */
function acceptedSite(c: Case, tap: Tap | null): SiteId | null {
  if (!tap?.site) return null;
  return c.sites.some((x) => x.site === tap.site) ? tap.site : null;
}
