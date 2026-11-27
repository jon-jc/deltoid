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
import { correctAnswer, cutawayProfile, grade, recommendedSite, tipTissue, type Pick, type Result } from "@/lib/grading";
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
  /** false for a second try at a case: it is graded but does not change the score */
  scored: boolean;
}

interface State {
  screen: "home" | "case" | "review";
  demo: boolean;
  /** the cases in this round, as indexes into CASES */
  queue: number[];
  /** position in the queue */
  index: number;
  step: "site" | "needle" | "result";
  tap: Tap | null;
  needle: NeedleId | null;
  angle: AngleId | null;
  landmarks: boolean;
  usedLandmarks: boolean;
  retrying: boolean;
  /** on the result step: the 3D view shows CDC's site on the patient instead of the cutaway */
  siteView: boolean;
  view: { name: ViewName; nonce: number };
  attempts: Attempt[];
}

type Action =
  | { type: "start"; demo: boolean; queue?: number[] }
  | { type: "home" }
  | { type: "finish" }
  | { type: "tap"; tap: Tap }
  | { type: "toNeedle" }
  | { type: "changeSite" }
  | { type: "needle"; id: NeedleId }
  | { type: "angle"; id: AngleId }
  | { type: "check" }
  | { type: "retry" }
  | { type: "siteView" }
  | { type: "next" }
  | { type: "landmarks" }
  | { type: "view"; name: ViewName };

const ALL_CASES = CASES.map((_, i) => i);

const INITIAL: State = {
  screen: "home",
  demo: false,
  queue: ALL_CASES,
  index: 0,
  step: "site",
  tap: null,
  needle: null,
  angle: null,
  landmarks: false,
  usedLandmarks: false,
  retrying: false,
  siteView: false,
  view: { name: "case", nonce: 0 },
  attempts: [],
};

const freshCase = {
  step: "site" as const,
  tap: null,
  needle: null,
  angle: null,
  landmarks: false,
  usedLandmarks: false,
  retrying: false,
  siteView: false,
};

function reducer(s: State, a: Action): State {
  switch (a.type) {
    case "start":
      return { ...INITIAL, screen: "case", demo: a.demo, queue: a.queue ?? ALL_CASES, view: { name: "case", nonce: s.view.nonce } };
    case "home":
      return { ...INITIAL, view: { name: "case", nonce: s.view.nonce } };
    case "finish":
      // end the round early: the review covers the cases answered so far
      return s.screen === "case" ? { ...s, screen: "review", ...freshCase } : s;
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
      const c = CASES[s.queue[s.index]];
      const pick: Pick = { site: s.tap.site, side: s.tap.side, region: s.tap.region, needle: s.needle, angle: s.angle };
      return {
        ...s,
        step: "result",
        attempts: [
          ...s.attempts,
          { caseId: c.id, pick, result: grade(c, pick), landmarks: s.usedLandmarks, scored: !s.retrying },
        ],
      };
    }
    case "retry":
      return s.step === "result" ? { ...s, ...freshCase, retrying: true, view: { name: "case", nonce: s.view.nonce + 1 } } : s;
    case "siteView":
      return s.step === "result" ? { ...s, siteView: !s.siteView } : s;
    case "next":
      if (s.index + 1 >= s.queue.length) return { ...s, screen: "review", ...freshCase };
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

/** What the learner chose beside CDC's answer, part by part. Shown after a miss. */
function AnswerCard({ c, pick, result }: { c: Case; pick: Pick; result: Result }) {
  const ans = correctAnswer(c);
  const region = REGIONS[pick.region] ?? REGIONS.Body;
  const ok = (part: "site" | "length" | "angle") => result.findings.find((f) => f.part === part)?.ok ?? false;
  const rows = [
    { label: "Site", ok: ok("site"), yours: pick.site ? SITES[pick.site].label : region.charAt(0).toUpperCase() + region.slice(1), cdc: ans.site },
    { label: "Needle", ok: ok("length"), yours: NEEDLES[pick.needle].label, cdc: ans.needle },
    { label: "Angle", ok: ok("angle"), yours: ANGLES[pick.angle].label, cdc: ans.angle },
  ];
  return (
    <table className={styles.answerCard}>
      <thead>
        <tr>
          <td />
          <th scope="col">You chose</th>
          <th scope="col">CDC&apos;s answer</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.label} data-ok={r.ok ? "1" : "0"}>
            <th scope="row">{r.label}</th>
            <td>
              <span className={styles.answerYours}>
                <span className={styles.answerMark} aria-hidden="true">
                  {r.ok ? "✓" : "✕"}
                </span>
                <span>
                  <span className={styles.srOnly}>{r.ok ? "Right: " : "Off: "}</span>
                  {r.yours}
                </span>
              </span>
            </td>
            <td>{r.cdc}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** A small drawing of the needle meeting the skin at the given angle. */
function AngleGlyph({ deg }: { deg: number }) {
  const r = (deg * Math.PI) / 180;
  // the needle comes in from the upper right, as the syringe does in the cutaway
  const x = 16 + Math.cos(r) * 18;
  const y = 20 - Math.sin(r) * 18;
  return (
    <svg className={styles.angleGlyph} viewBox="0 0 40 24" aria-hidden="true">
      <path className={styles.angleSkin} d="M2 20.5h36" />
      <path className={styles.angleNeedle} d={`M${x.toFixed(1)} ${y.toFixed(1)}L16 20`} />
    </svg>
  );
}

function siteText(tap: Tap) {
  if (tap.site) return `${SITES[tap.site].label}, ${tap.side === "L" ? "left" : "right"} side`;
  const r = REGIONS[tap.region] ?? REGIONS.Body;
  return r.charAt(0).toUpperCase() + r.slice(1);
}

const PART_NAMES = { site: "site", angle: "angle", length: "needle length" } as const;

const STEPS = [
  { id: "site", label: "Site" },
  { id: "needle", label: "Needle and angle" },
  { id: "result", label: "Result" },
] as const;

function Stepper({ step }: { step: State["step"] }) {
  const at = STEPS.findIndex((x) => x.id === step);
  return (
    <ol className={styles.stepper} aria-label={`Step ${at + 1} of ${STEPS.length}`}>
      {STEPS.map((x, i) => (
        <li key={x.id} data-state={i < at ? "done" : i === at ? "now" : "next"} aria-current={i === at ? "step" : undefined}>
          <span className={styles.stepDot} aria-hidden="true">
            {i < at ? "✓" : i + 1}
          </span>
          <span className={styles.stepLabel}>{x.label}</span>
        </li>
      ))}
    </ol>
  );
}

/** One bar per case: green for correct, red for a miss, dark for the case in hand. */
function ScoreTrack({ cases, attempts, index }: { cases: Case[]; attempts: Attempt[]; index: number }) {
  const correct = attempts.filter((a) => a.result.correct).length;
  return (
    <span className={styles.track} role="img" aria-label={`${correct} of ${attempts.length} correct so far`}>
      {cases.map((x, i) => {
        const a = attempts.find((t) => t.caseId === x.id);
        const state = a ? (a.result.correct ? "ok" : "miss") : i === index ? "now" : "next";
        return <span key={x.id} data-state={state} />;
      })}
    </span>
  );
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
  const round = s.queue.map((i) => CASES[i]);
  const c = round[s.index];
  const missedRound = s.queue.length < CASES.length;
  const scored = s.attempts.filter((a) => a.scored);
  const correctCount = scored.filter((a) => a.result.correct).length;
  const last = s.attempts[s.attempts.length - 1];
  const misses = scored.filter((a) => !a.result.correct);
  const missedQueue = misses.map((a) => CASES.findIndex((x) => x.id === a.caseId));

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

  const rec = recommendedSite(c);
  const siteView = s.screen === "case" && s.step === "result" && s.siteView;
  const onSite = s.screen === "case" && s.step === "site";
  const stageMode = s.screen !== "case" ? "home" : onSite ? "site" : siteView ? "answer" : "cutaway";
  const patient = s.screen === "case" ? c.model : "adult";

  return (
    <main className={styles.shell}>
      <section className={styles.stageWrap} data-screen={s.screen} aria-label="3D view">
        <Stage3D
          handle={stage}
          mode={stageMode}
          patient={patient}
          landmarks={(onSite && s.landmarks) || siteView}
          view={s.view}
          marker={(onSite || siteView) && s.tap ? s.tap.point : null}
          profile={profile}
          needle={needlePose}
          injected={s.step === "result"}
          tipTissue={tip}
          answer={siteView ? { zone: rec.site, side: s.tap?.side ?? "L", label: SITES[rec.site].label } : null}
          bottomInset={onSite ? 60 : 0}
          onTap={onTap}
        />
        {onSite && (
          <div className={styles.stageBar}>
            <button
              type="button"
              className={styles.chip}
              aria-pressed={s.landmarks}
              onClick={() => dispatch({ type: "landmarks" })}
            >
              <svg className={styles.chipIcon} viewBox="0 0 20 20" aria-hidden="true">
                <circle cx="10" cy="5" r="2.2" />
                <circle cx="5" cy="14.5" r="2.2" />
                <circle cx="15" cy="14.5" r="2.2" />
                <path d="M10 7.2 5.8 12.4M10 7.2l4.2 5.2M7.2 14.5h5.6" />
              </svg>
              {s.landmarks ? "Hide landmarks" : "Show landmarks"}
            </button>
            <div className={styles.views} role="group" aria-label="Camera view">
              {VIEWS.map((v) => (
                <button
                  key={v.name}
                  type="button"
                  className={styles.view}
                  aria-pressed={s.view.name === v.name}
                  onClick={() => dispatch({ type: "view", name: v.name })}
                >
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
            <ol className={styles.how} aria-label="How a case works">
              {["Tap the site", "Pick a needle", "Set the angle", "See where it lands"].map((t, i) => (
                <li key={t}>
                  <span className={styles.howNum} aria-hidden="true">
                    {i + 1}
                  </span>
                  {t}
                </li>
              ))}
            </ol>
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
              <span className={styles.progressLabel}>
                {s.demo && s.index === 0
                  ? "30-second case"
                  : `${missedRound ? "Missed case" : "Case"} ${s.index + 1} of ${round.length}`}
                {scored.length > 0 && <span className={styles.muted}> · {correctCount} correct</span>}
              </span>
              {!(s.demo && s.index === 0) && <ScoreTrack cases={round} attempts={scored} index={s.index} />}
              {scored.length > 0 ? (
                <button type="button" className={styles.linkBtn} onClick={() => dispatch({ type: "finish" })}>
                  End round
                </button>
              ) : (
                <button type="button" className={styles.linkBtn} onClick={() => dispatch({ type: "home" })}>
                  Start over
                </button>
              )}
            </div>
            <Stepper step={s.step} />

            {s.step === "site" && (
              <div className={styles.body}>
                <CaseCard c={c} />
                <p className={styles.prompt}>
                  {s.tap ? (
                    <span role="status" className={styles.marked}>
                      <span>
                        Marked: <strong>{siteText(s.tap)}</strong>. Opening the needle step…
                      </span>
                      <span className={styles.advance} aria-hidden="true" />
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
                        <span>{NEEDLES[id].label}</span>
                        <span className={styles.segmentSub} aria-hidden="true">
                          {id === "tb" ? "tuberculin" : NEEDLES[id].mmLabel}
                        </span>
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
                        <AngleGlyph deg={ANGLES[id].drawDeg} />
                        <span>{ANGLES[id].label}</span>
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
                  <button type="button" className={styles.siteToggle} onClick={() => dispatch({ type: "siteView" })}>
                    {s.siteView ? "Back to the cutaway" : "Show site on patient"}
                  </button>
                </div>
                {s.siteView && (
                  <div className={styles.findIt} role="status">
                    <p>
                      <strong>CDC&apos;s site: {SITES[rec.site].label}.</strong> {SITES[rec.site].find.text}
                    </p>
                    <SourceLinks ids={SITES[rec.site].find.sources} />
                  </div>
                )}
                <p className={styles.summary} role="status">
                  {last.result.summary}
                </p>
                {!last.result.correct && <AnswerCard c={c} pick={last.pick} result={last.result} />}
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
                {!last.scored && <p className={styles.fine}>Second try: graded, but your score keeps the first answer.</p>}
                <SourceLinks ids={last.result.sources} />
                <p className={styles.fine}>{COPY.schematic}</p>
              </div>
            )}

            <div className={styles.footer}>
              {s.step === "site" && (
                <p className={styles.hint}>{s.tap ? " " : "The next step opens once you mark a site."}</p>
              )}
              {s.step === "needle" && (
                <button
                  type="button"
                  className={styles.primary}
                  disabled={!s.needle || !s.angle}
                  onClick={() => dispatch({ type: "check" })}
                >
                  {s.needle && s.angle
                    ? "Check answer"
                    : s.needle
                      ? "Now pick an angle"
                      : s.angle
                        ? "Now pick a needle"
                        : "Pick a needle and an angle"}
                </button>
              )}
              {s.step === "result" && (
                <div className={styles.footerRow}>
                  {last && !last.result.correct && (
                    <button type="button" className={styles.secondary} onClick={() => dispatch({ type: "retry" })}>
                      Try again
                    </button>
                  )}
                  <button type="button" className={styles.primary} onClick={() => dispatch({ type: "next" })}>
                    {s.index + 1 >= round.length ? "See review" : "Next case"}
                  </button>
                </div>
              )}
            </div>
          </>
        )}

        {s.screen === "review" && (
          <>
            <div className={styles.progress}>
              <span className={styles.progressLabel}>{missedRound ? "Review of missed cases" : "Review"}</span>
              <button type="button" className={styles.linkBtn} onClick={() => dispatch({ type: "home" })}>
                Back to start
              </button>
            </div>
            <div className={styles.body}>
              <h1 className={styles.lead}>
                {correctCount} of {scored.length} correct
              </h1>
              {scored.length < round.length && (
                <p className={styles.fine}>
                  You ended the round after {scored.length} of {round.length} cases.
                </p>
              )}
              <ol className={styles.tally} aria-label="Every case in this round">
                {scored.map((a) => {
                  const rc = CASES.find((x) => x.id === a.caseId) as Case;
                  const off = a.result.findings.filter((f) => !f.ok).map((f) => PART_NAMES[f.part]);
                  return (
                    <li key={a.caseId} data-ok={a.result.correct ? "1" : "0"}>
                      <span className={styles.tallyMark} aria-hidden="true">
                        {a.result.correct ? "✓" : "✕"}
                      </span>
                      <span>
                        <span className={styles.tallyTitle}>{rc.title}</span>
                        <span className={styles.tallyNote}>
                          {a.result.correct ? "Correct" : `Off: ${off.join(", ")}`}
                        </span>
                      </span>
                    </li>
                  );
                })}
              </ol>
              {misses.length === 0 ? (
                <p className={styles.summary}>No misses. Every answer matched CDC guidance.</p>
              ) : (
                <>
                  <h2 className={styles.subhead}>Each miss, with CDC&apos;s answer</h2>
                  <ol className={styles.review}>
                    {misses.map((a) => {
                      const rc = CASES.find((x) => x.id === a.caseId) as Case;
                      const ans = correctAnswer(rc);
                      return (
                        <li key={a.caseId}>
                          <h3>{rc.title}</h3>
                          <p className={styles.muted}>{rc.patient}{rc.constraint ? `. ${rc.constraint}` : ""}</p>
                          <p>{a.result.summary}</p>
                          <AnswerCard c={rc} pick={a.pick} result={a.result} />
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
              {misses.length > 0 && (
                <button
                  type="button"
                  className={styles.primary}
                  onClick={() => dispatch({ type: "start", demo: false, queue: missedQueue })}
                >
                  Practice the {misses.length === 1 ? "missed case" : `${misses.length} missed cases`}
                </button>
              )}
              <button
                type="button"
                className={misses.length > 0 ? styles.secondary : styles.primary}
                onClick={() => dispatch({ type: "start", demo: false })}
              >
                {misses.length > 0 ? "Practice all cases again" : "Practice again"}
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
