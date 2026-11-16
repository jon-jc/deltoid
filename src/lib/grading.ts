import {
  ANGLES,
  NEEDLES,
  NEEDLE_ORDER,
  PROFILES,
  REGIONS,
  ROUTES,
  ROUTE_NEEDLES,
  SITES,
  SITE_NOT_USED,
  TISSUES,
  type AngleId,
  type Case,
  type CaseSite,
  type NeedleId,
  type NeedleRule,
  type SiteId,
  type SourceId,
  type TissueId,
} from "@/content/clinical";

/**
 * Grading and the cutaway share one model, so the picture can never
 * disagree with the verdict:
 *
 *  - Whether an answer is correct is decided only by CDC's rules in
 *    clinical.ts: the site for the route and age, the angle for the route,
 *    and the needle length for the patient.
 *  - The cutaway's layer boundaries are drawn from those same needle rules.
 *    Muscle starts between the longest needle that is too short and the
 *    shortest one CDC lists; bone starts just past the longest one CDC
 *    lists. They are not measured anatomy.
 *  - At 45 and 90 degrees the needle is taken to be inserted fully. At
 *    5 to 15 degrees only the bevel goes under the skin, as CDC describes
 *    for the tuberculin skin test.
 */

export interface Pick {
  /** Zone tapped, or null when the tap missed every zone. */
  site: SiteId | null;
  side: "L" | "R";
  /** Named region under the tap, used when no zone was hit. */
  region: string;
  needle: NeedleId;
  angle: AngleId;
}

export interface Profile {
  skinMm: number;
  fatBottomMm: number;
  boneTopMm: number;
}

export type Part = "site" | "angle" | "length";

export interface Finding {
  part: Part;
  ok: boolean;
  text: string;
  sources: SourceId[];
}

export interface Result {
  correct: boolean;
  tissue: TissueId;
  /** One sentence: where the needle ended and what was off. */
  summary: string;
  off: Part[];
  findings: Finding[];
  sources: SourceId[];
}

const SKIN_MM = 2.5;
const BEVEL_DEPTH_MM = 1.2;
const LENGTHS = NEEDLE_ORDER.map((id) => NEEDLES[id].mm).sort((a, b) => a - b);

export function recommendedSite(c: Case): CaseSite {
  return c.sites.find((s) => s.status === "recommended") ?? c.sites[0];
}

/** The intramuscular needle rule that applies at a site for this patient. */
function imRule(c: Case, site: SiteId | null): NeedleRule {
  const im = PROFILES[c.profile].im;
  if (site && (site === "Deltoid" || site === "VastusLateralis") && im[site]) return im[site] as NeedleRule;
  const rec = recommendedSite(c).site;
  if ((rec === "Deltoid" || rec === "VastusLateralis") && im[rec]) return im[rec] as NeedleRule;
  return (im.Deltoid ?? im.VastusLateralis) as NeedleRule;
}

function allowed(rule: NeedleRule): number[] {
  return [...rule.ok, ...rule.conditional.map((x) => x.needle)].map((id) => NEEDLES[id].mm);
}

/** Layer depths for the cutaway, derived from CDC's needle lengths for this patient and site. */
export function cutawayProfile(c: Case, site: SiteId | null): Profile {
  const mm = allowed(imRule(c, site));
  const min = Math.min(...mm);
  const max = Math.max(...mm);
  const below = LENGTHS.filter((x) => x < min).pop();
  const above = LENGTHS.find((x) => x > max);
  return {
    skinMm: SKIN_MM,
    fatBottomMm: below === undefined ? min * 0.6 : (below + min) / 2,
    boneTopMm: above === undefined ? max + 6 : (max + above) / 2,
  };
}

export function needleDepthMm(needle: NeedleId, angle: AngleId): number {
  if (angle === "shallow") return BEVEL_DEPTH_MM;
  return NEEDLES[needle].mm * Math.sin((ANGLES[angle].drawDeg * Math.PI) / 180);
}

export function tissueAt(depthMm: number, p: Profile): TissueId {
  if (depthMm < p.skinMm) return "skin";
  if (depthMm < p.fatBottomMm) return "fat";
  if (depthMm < p.boneTopMm) return "muscle";
  return "bone";
}

export function tipTissue(c: Case, site: SiteId | null, needle: NeedleId, angle: AngleId): TissueId {
  return tissueAt(needleDepthMm(needle, angle), cutawayProfile(c, site));
}

function lowerFirst(s: string) {
  return s.charAt(0).toLowerCase() + s.slice(1);
}

function sideWord(site: SiteId, side: "L" | "R") {
  const which = side === "L" ? "left" : "right";
  return `${SITES[site].label}, ${which} side`;
}

/** The answer CDC gives for a case, in words. */
export function correctAnswer(c: Case): { site: string; needle: string; angle: string; sources: SourceId[] } {
  const rec = recommendedSite(c);
  const route = ROUTES[c.route];
  let needle: string;
  let sources: SourceId[];
  if (c.route === "im") {
    const rule = imRule(c, rec.site);
    const ok = rule.ok.map((id) => NEEDLES[id].label);
    needle = ok.length > 1 ? `${ok[0]} to ${ok[ok.length - 1]}` : ok[0];
    if (rule.conditional.length) needle += ` (${rule.conditional.map((x) => NEEDLES[x.needle].label).join(", ")} only with stretched skin)`;
    sources = rule.statement.sources;
  } else {
    const rule = ROUTE_NEEDLES[c.route];
    needle = rule.ok.map((id) => NEEDLES[id].label).join(", ");
    sources = rule.statement.sources;
  }
  return {
    site: SITES[rec.site].label,
    needle,
    angle: ANGLES[route.angle].label,
    sources: [...new Set([...rec.note.sources, ...sources, ...ANGLES[route.angle].sources])],
  };
}

export function grade(c: Case, pick: Pick): Result {
  const route = ROUTES[c.route];
  const profile = PROFILES[c.profile];
  const rec = recommendedSite(c);
  const accepted = pick.site ? c.sites.find((s) => s.site === pick.site) : undefined;
  const findings: Finding[] = [];

  // ---- site
  if (accepted && pick.site) {
    const lead = accepted.status === "recommended" ? "Site" : "Site accepted";
    findings.push({ part: "site", ok: true, text: `${lead}: ${lowerFirst(sideWord(pick.site, pick.side))}. ${accepted.note.text}`, sources: accepted.note.sources });
  } else if (pick.site) {
    const why = c.constraint && pick.site === "Deltoid"
      ? { text: "The case says neither upper arm can be used.", sources: [] as SourceId[] }
      : SITE_NOT_USED[pick.site][profile.group];
    findings.push({
      part: "site", ok: false,
      text: `Site: you tapped ${SITES[pick.site].plain}. ${why.text} ${rec.note.text}`,
      sources: [...new Set([...why.sources, ...rec.note.sources])],
    });
  } else {
    findings.push({
      part: "site", ok: false,
      text: `Site: you tapped ${REGIONS[pick.region] ?? REGIONS.Body}, which is not an injection site for this case. ${rec.note.text} ${SITES[rec.site].find.text}`,
      sources: [...new Set([...rec.note.sources, ...SITES[rec.site].find.sources])],
    });
  }

  // ---- angle
  const want = ANGLES[route.angle];
  const got = ANGLES[pick.angle];
  const angleOk = pick.angle === route.angle;
  findings.push({
    part: "angle", ok: angleOk,
    text: angleOk
      ? `Angle: ${got.label}, as CDC gives for ${route.label.toLowerCase()} injections.`
      : `Angle: you chose ${got.spoken}. CDC gives ${route.label.toLowerCase()} injections at ${want.spoken}.`,
    sources: want.sources,
  });

  // ---- needle length
  const needle = NEEDLES[pick.needle];
  let lengthOk = false;
  if (c.route === "im") {
    const rule = imRule(c, accepted ? pick.site : null);
    const mm = allowed(rule);
    const cond = rule.conditional.find((x) => x.needle === pick.needle);
    let text: string;
    if (rule.ok.includes(pick.needle)) {
      lengthOk = true;
      text = `Needle: ${needle.label}. ${rule.statement.text}`;
    } else if (cond) {
      lengthOk = true;
      text = `Needle: ${needle.label} is accepted only if ${cond.when}. ${rule.statement.text}`;
    } else if (needle.mm < Math.min(...mm)) {
      text = `Needle: ${needle.label} is too short for ${profile.band}, so it may not reach the muscle. ${rule.statement.text}`;
    } else if (needle.mm > Math.max(...mm)) {
      text = `Needle: ${needle.label} is longer than CDC lists for ${profile.band}. The needle should not be so long that it reaches nerves, blood vessels or bone. ${rule.statement.text}`;
    } else {
      text = `Needle: ${needle.label} is not a length CDC lists here. ${rule.statement.text}`;
    }
    findings.push({ part: "length", ok: lengthOk, text, sources: rule.statement.sources });
  } else {
    const rule = ROUTE_NEEDLES[c.route];
    lengthOk = rule.ok.includes(pick.needle);
    findings.push({
      part: "length", ok: lengthOk,
      text: lengthOk ? `Needle: ${needle.label}. ${rule.statement.text}` : `Needle: ${needle.label} is not what CDC lists for this. ${rule.statement.text}`,
      sources: rule.statement.sources,
    });
  }

  const tissue = tipTissue(c, accepted ? pick.site : null, pick.needle, pick.angle);
  const off = findings.filter((f) => !f.ok).map((f) => f.part);
  const correct = off.length === 0;
  const names: Record<Part, string> = { site: "the site", angle: "the angle", length: "the needle length" };
  const offText = off.map((p) => names[p]).join(off.length === 2 ? " and " : ", ").replace(/, ([^,]*)$/, " and $1");
  let summary: string;
  if (correct) {
    summary = `The needle ended in ${TISSUES[tissue].plain}, where ${lowerFirst(route.label)} injections belong.`;
  } else if (tissue === route.target) {
    summary = `The needle ended in ${TISSUES[tissue].plain}, but ${offText} ${off.length > 1 ? "were" : "was"} off.`;
  } else {
    summary = `The needle ended in ${TISSUES[tissue].plain}, not ${TISSUES[route.target].plain}. What was off: ${offText}.`;
  }
  return {
    correct,
    tissue,
    summary,
    off,
    findings,
    sources: [...new Set(findings.flatMap((f) => f.sources))],
  };
}
