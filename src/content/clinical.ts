/**
 * All clinical content used by the trainer lives in this file.
 *
 * Every entry carries the CDC source it was taken from. Nothing here was
 * written from memory: each value was read from the cited CDC page or
 * job aid on the access date below. If a value is not in a CDC source,
 * the feature that needed it was left out (see `NOT_COVERED`).
 *
 * The UI, the grading and the Sources screen all read from here.
 */

export const ACCESSED = "2026-11-15";

/**
 * How the sources were read: the job aids and the wall chart are PDFs and
 * were read in full. The two web pages (best practice guidelines and Pink
 * Book chapter 6) were read as full page text in a browser, including the
 * Pink Book's collapsed sections and both needle tables with footnotes, and
 * every statement below that cites them was compared with that text.
 */

/* ------------------------------------------------------------ sources */

export type SourceId =
  | "acip_admin"
  | "pinkbook_ch6"
  | "ycts_im_adult"
  | "ycts_im_infant"
  | "ycts_subcut"
  | "tb_chart"
  | "tb_guidance";

export interface Source {
  id: SourceId;
  /** Short name shown next to a statement. */
  short: string;
  /** Full title as published. */
  title: string;
  publisher: string;
  url: string;
  /** Date printed on the source, where it shows one. */
  published: string;
  accessed: string;
}

export const SOURCES: Record<SourceId, Source> = {
  acip_admin: {
    id: "acip_admin",
    short: "CDC best practice guidelines",
    title: "General Best Practice Guidelines for Immunization: Vaccine Administration",
    publisher: "Centers for Disease Control and Prevention (CDC), Advisory Committee on Immunization Practices",
    url: "https://www.cdc.gov/vaccines/hcp/imz-best-practices/vaccine-administration.html",
    published: "June 18, 2024",
    accessed: ACCESSED,
  },
  pinkbook_ch6: {
    id: "pinkbook_ch6",
    short: "CDC Pink Book, chapter 6",
    title: "Epidemiology and Prevention of Vaccine-Preventable Diseases (Pink Book), Chapter 6: Vaccine Administration",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-6-vaccine-administration.html",
    published: "April 8, 2024",
    accessed: ACCESSED,
  },
  ycts_im_adult: {
    id: "ycts_im_adult",
    short: "CDC job aid: IM injection, adults",
    title: "You Call the Shots. Vaccine Administration: Intramuscular (IM) Injection, Adults 19 years of age and older",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/vaccines/hcp/admin/downloads/IM-injection-adult.pdf",
    published: "September 25, 2025",
    accessed: ACCESSED,
  },
  ycts_im_infant: {
    id: "ycts_im_infant",
    short: "CDC job aid: IM injection, infants",
    title: "You Call the Shots. Vaccine Administration: Intramuscular (IM) Injection, Infants 11 months of age and younger (CS 322033-F)",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/vaccines/hcp/admin/downloads/IM-Injection-Infants-508.pdf",
    published: "September 25, 2025",
    accessed: ACCESSED,
  },
  ycts_subcut: {
    id: "ycts_subcut",
    short: "CDC job aid: subcutaneous injection",
    title: "You Call the Shots. Vaccine Administration: Subcutaneous (SUBCUT) Injection (CS 322033-L)",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/vaccines/hcp/admin/downloads/YCTS-VaxAdmin-Subcut-injection.pdf",
    published: "September 25, 2025",
    accessed: ACCESSED,
  },
  tb_chart: {
    id: "tb_chart",
    short: "CDC Mantoux skin test wall chart",
    title: "Mantoux Tuberculin Skin Test wall chart (CS-346456)",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/tb/education/mantoux/pdf/Mantoux_TB_Skin_Test.pdf",
    published: "No date printed",
    accessed: ACCESSED,
  },
  tb_guidance: {
    id: "tb_guidance",
    short: "CDC tuberculin skin test guidance",
    title: "Clinical Testing Guidance for Tuberculosis: Tuberculin Skin Test",
    publisher: "Centers for Disease Control and Prevention (CDC)",
    url: "https://www.cdc.gov/tb/hcp/testing-diagnosis/tuberculin-skin-test.html",
    published: "January 31, 2025",
    accessed: ACCESSED,
  },
};

/** A statement with the sources it was read from. */
export interface Cited {
  text: string;
  sources: SourceId[];
}

/* ------------------------------------------------------------- angles */

export type AngleId = "shallow" | "deg45" | "deg90";

export interface Angle {
  id: AngleId;
  label: string;
  spoken: string;
  /** Angle the cutaway draws. For the 5 to 15 degree range it draws the middle, 10. */
  drawDeg: number;
  sources: SourceId[];
}

export const ANGLES: Record<AngleId, Angle> = {
  shallow: { id: "shallow", label: "5° to 15°", spoken: "5 to 15 degrees", drawDeg: 10, sources: ["tb_chart"] },
  deg45: { id: "deg45", label: "45°", spoken: "45 degrees", drawDeg: 45, sources: ["ycts_subcut", "acip_admin"] },
  deg90: { id: "deg90", label: "90°", spoken: "90 degrees", drawDeg: 90, sources: ["ycts_im_adult", "acip_admin"] },
};

export const ANGLE_ORDER: AngleId[] = ["shallow", "deg45", "deg90"];

/* ------------------------------------------------------------ needles */

export type NeedleId = "tb" | "in58" | "in1" | "in125" | "in15";

export interface Needle {
  id: NeedleId;
  label: string;
  spoken: string;
  /** Length in millimetres as CDC prints it. The tuberculin needle is a range (1/4 to 1/2 inch); the cutaway draws 1/2 inch. */
  mm: number;
  mmLabel: string;
  sources: SourceId[];
}

export const NEEDLES: Record<NeedleId, Needle> = {
  tb: { id: "tb", label: "¼–½ in", spoken: "one quarter to one half inch", mm: 12.7, mmLabel: "tuberculin syringe", sources: ["tb_chart"] },
  in58: { id: "in58", label: "⅝ in", spoken: "five eighths of an inch", mm: 16, mmLabel: "16 mm", sources: ["acip_admin", "ycts_subcut"] },
  in1: { id: "in1", label: "1 in", spoken: "1 inch", mm: 25, mmLabel: "25 mm", sources: ["acip_admin", "ycts_im_adult"] },
  in125: { id: "in125", label: "1¼ in", spoken: "one and a quarter inches", mm: 32, mmLabel: "32 mm", sources: ["acip_admin"] },
  in15: { id: "in15", label: "1½ in", spoken: "one and a half inches", mm: 38, mmLabel: "38 mm", sources: ["acip_admin", "ycts_im_adult"] },
};

export const NEEDLE_ORDER: NeedleId[] = ["tb", "in58", "in1", "in125", "in15"];

/* ------------------------------------------------------------- routes */

export type RouteId = "im" | "subcut" | "id";
export type TissueId = "skin" | "fat" | "muscle" | "bone";

export const TISSUES: Record<TissueId, { label: string; plain: string }> = {
  skin: { label: "Skin", plain: "the skin" },
  fat: { label: "Fat", plain: "the fat under the skin (subcutaneous tissue)" },
  muscle: { label: "Muscle", plain: "muscle" },
  bone: { label: "Bone", plain: "bone" },
};

export interface Route {
  id: RouteId;
  label: string;
  /** Taught on the case card, so the learner never meets an unexplained term. */
  plain: string;
  target: TissueId;
  angle: AngleId;
  gauge: Cited;
  technique: Cited;
}

export const ROUTES: Record<RouteId, Route> = {
  im: {
    id: "im",
    label: "Intramuscular",
    plain: "into the muscle",
    target: "muscle",
    angle: "deg90",
    gauge: { text: "22 to 25 gauge needle.", sources: ["acip_admin", "ycts_im_adult"] },
    technique: {
      text: "Insert at a 90-degree angle into the middle and thickest part of the muscle. The needle must be long enough to reach the muscle, but not so long that it reaches nerves, blood vessels or bone underneath.",
      sources: ["ycts_im_adult", "acip_admin"],
    },
  },
  subcut: {
    id: "subcut",
    label: "Subcutaneous",
    plain: "into the fat under the skin",
    target: "fat",
    angle: "deg45",
    gauge: { text: "23 to 25 gauge, ⅝ inch (16 mm) needle.", sources: ["ycts_subcut", "acip_admin"] },
    technique: {
      text: "Insert at a 45-degree angle into the fatty tissue. Pinching up the skin may be needed. Avoid reaching the muscle.",
      sources: ["ycts_subcut", "pinkbook_ch6"],
    },
  },
  id: {
    id: "id",
    label: "Intradermal",
    plain: "into the skin itself",
    target: "skin",
    angle: "shallow",
    gauge: { text: "27 gauge, ¼ to ½ inch needle with a short bevel, on a tuberculin syringe.", sources: ["tb_chart", "tb_guidance"] },
    technique: {
      text: "Insert slowly, bevel up, at a 5 to 15 degree angle, until the bevel can be seen just below the skin surface. A pale raised bump (wheal) 6 to 10 mm across should appear.",
      sources: ["tb_chart", "tb_guidance"],
    },
  },
};

/* -------------------------------------------------------------- sites */

/** Zone names match the Zone_* meshes in the patient models. */
export type SiteId = "Deltoid" | "VastusLateralis" | "Triceps" | "Forearm" | "Ventrogluteal" | "Buttock";

export interface Site {
  id: SiteId;
  label: string;
  /** Used in sentences: "You tapped ...". */
  plain: string;
  find: Cited;
}

export const SITES: Record<SiteId, Site> = {
  Deltoid: {
    id: "Deltoid",
    label: "Deltoid, upper arm",
    plain: "the deltoid muscle of the upper arm",
    find: {
      text: "Find the acromion, the bony point at the end of the shoulder. The site is about 2 inches below it and above the armpit, in the middle and thickest part of the muscle.",
      sources: ["ycts_im_adult"],
    },
  },
  VastusLateralis: {
    id: "VastusLateralis",
    label: "Outer front of the thigh",
    plain: "the outer front of the thigh (vastus lateralis)",
    find: {
      text: "Use the middle third of the muscle on the outer front of the thigh: below the greater trochanter (the bony point of the hip) and above the lateral condyle (the outer bony point of the knee).",
      sources: ["ycts_im_infant"],
    },
  },
  Triceps: {
    id: "Triceps",
    label: "Upper outer triceps area",
    plain: "the upper outer triceps area of the arm",
    find: {
      text: "The fatty tissue over the upper outer triceps area of the arm. The triceps is the muscle on the back of the upper arm.",
      sources: ["pinkbook_ch6", "ycts_subcut", "acip_admin"],
    },
  },
  Forearm: {
    id: "Forearm",
    label: "Inner forearm",
    plain: "the inner surface of the forearm",
    find: {
      text: "With the forearm palm side up, use an area 2 to 4 inches below the elbow joint that is free of scars and sores.",
      sources: ["tb_chart", "tb_guidance"],
    },
  },
  Ventrogluteal: {
    id: "Ventrogluteal",
    label: "Ventrogluteal site, hip",
    plain: "the ventrogluteal site on the hip",
    find: {
      text: "The centre of a triangle between the anterior superior iliac spine (front point of the hip bone), the tubercle of the iliac crest (top rim of the hip bone) and the upper border of the greater trochanter. CDC describes it for when a gluteal muscle must be used; its two recommended sites for intramuscular vaccines are the deltoid and the outer front of the thigh.",
      sources: ["pinkbook_ch6", "acip_admin"],
    },
  },
  Buttock: {
    id: "Buttock",
    label: "Buttock",
    plain: "the buttock",
    find: {
      text: "CDC does not use the muscles of the buttock for vaccines in infants and children, because of possible injury to the sciatic nerve.",
      sources: ["pinkbook_ch6"],
    },
  },
};

/** Why a tapped zone is wrong when it is not accepted for a case. */
export const SITE_NOT_USED: Record<SiteId, { infant: Cited; adult: Cited }> = {
  Deltoid: {
    infant: { text: "For most infants under 12 months, CDC recommends the outer front of the thigh, because it has more muscle than the deltoid.", sources: ["acip_admin", "ycts_im_infant"] },
    adult: { text: "The deltoid is CDC's site for intramuscular injections, not for this route.", sources: ["ycts_im_adult"] },
  },
  VastusLateralis: {
    infant: { text: "The thigh is not the site CDC gives for this.", sources: ["acip_admin"] },
    adult: { text: "The thigh is not the site CDC gives for this route in adults.", sources: ["acip_admin"] },
  },
  Triceps: {
    infant: { text: "The upper outer triceps area is CDC's site for subcutaneous injections, not for intramuscular ones.", sources: ["ycts_subcut", "pinkbook_ch6"] },
    adult: { text: "The upper outer triceps area is CDC's site for subcutaneous injections, not for this route.", sources: ["ycts_subcut", "pinkbook_ch6"] },
  },
  Forearm: {
    infant: { text: "The inner forearm is where CDC places the tuberculin skin test, not vaccines.", sources: ["tb_chart"] },
    adult: { text: "The inner forearm is where CDC places the tuberculin skin test, not vaccines.", sources: ["tb_chart"] },
  },
  Ventrogluteal: {
    infant: { text: "CDC describes the ventrogluteal site only for when a gluteal muscle must be used. For infants the recommended site is the outer front of the thigh.", sources: ["pinkbook_ch6", "acip_admin"] },
    adult: { text: "CDC describes the ventrogluteal site only for when a gluteal muscle must be used. It is not a routine site for this.", sources: ["pinkbook_ch6", "acip_admin"] },
  },
  Buttock: {
    infant: { text: "CDC does not use the muscles of the buttock for vaccines in infants and children, because of possible injury to the sciatic nerve.", sources: ["pinkbook_ch6"] },
    adult: { text: "The buttock is not a site CDC recommends here. CDC names only two sites for intramuscular vaccines, the deltoid and the outer front of the thigh, and recommends the deltoid for adults.", sources: ["pinkbook_ch6", "acip_admin"] },
  },
};

/** Plain names for the parts of the body a tap can land on outside every zone. */
export const REGIONS: Record<string, string> = {
  Head: "the head",
  Neck: "the neck",
  Chest: "the chest",
  UpperBack: "the upper back",
  Abdomen: "the abdomen",
  LowerBack: "the lower back",
  Groin: "the groin",
  Shoulder: "the top of the shoulder",
  UpperArm: "the upper arm, outside the injection areas",
  Elbow: "the elbow",
  Forearm: "the forearm, outside the test area",
  Wrist: "the wrist",
  Hand: "the hand",
  Hip: "the hip, outside the injection areas",
  Buttock: "the buttock",
  ThighUpper: "the upper third of the thigh",
  ThighMiddle: "the middle third of the thigh, away from the outer front",
  ThighLower: "the lower third of the thigh",
  Knee: "the knee",
  LowerLeg: "the lower leg",
  Ankle: "the ankle",
  Foot: "the foot",
  Body: "the body",
};

/** Short labels for the bony landmarks shown with "Show landmarks". */
export const LANDMARKS: Record<string, string> = {
  Acromion: "Acromion",
  AxillaryFold: "Armpit fold",
  Elbow: "Elbow joint",
  GreaterTrochanter: "Greater trochanter",
  IliacCrest: "Iliac crest",
  ASIS: "Anterior superior iliac spine",
  LateralCondyle: "Lateral condyle",
};

/* -------------------------------------------- intramuscular needle rules */

export type ProfileId =
  | "newborn"
  | "infant"
  | "adult_under_60"
  | "adult_60_70"
  | "adult_man_70_118"
  | "adult_woman_70_90"
  | "adult_woman_over_90";

export interface NeedleRule {
  /** Lengths CDC lists without a condition. */
  ok: NeedleId[];
  /** Lengths CDC allows only with a stated technique. */
  conditional: { needle: NeedleId; when: string }[];
  statement: Cited;
}

export interface Profile {
  id: ProfileId;
  group: "infant" | "adult";
  /** CDC's own wording for the group, used in feedback. */
  band: string;
  im: Partial<Record<"Deltoid" | "VastusLateralis", NeedleRule>>;
}

const STRETCH = "the skin is stretched tightly and the tissue under it is not bunched";

const ADULT_THIGH: NeedleRule = {
  ok: ["in15"],
  conditional: [{ needle: "in1", when: STRETCH }],
  statement: {
    text: "For the adult thigh, CDC lists a 1½ inch needle; a 1 inch needle may be used if the skin is stretched tightly and the tissue under it is not bunched.",
    sources: ["acip_admin"],
  },
};

export const PROFILES: Record<ProfileId, Profile> = {
  newborn: {
    id: "newborn",
    group: "infant",
    band: "a newborn in the first 28 days",
    im: {
      VastusLateralis: {
        ok: ["in1"],
        conditional: [{ needle: "in58", when: STRETCH }],
        statement: {
          text: "For newborns in the first 28 days, CDC's needle tables list ⅝ inch, used with the skin stretched tightly and the tissue under it not bunched. CDC's infant job aid lists 1 inch for infants 11 months and younger.",
          sources: ["acip_admin", "pinkbook_ch6", "ycts_im_infant"],
        },
      },
    },
  },
  infant: {
    id: "infant",
    group: "infant",
    band: "an infant of 1 to 12 months",
    im: {
      VastusLateralis: {
        ok: ["in1"],
        conditional: [],
        statement: { text: "For infants of 1 to 12 months CDC lists a 1 inch (25 mm) needle in the thigh.", sources: ["acip_admin", "ycts_im_infant"] },
      },
    },
  },
  adult_under_60: {
    id: "adult_under_60",
    group: "adult",
    band: "an adult under 60 kg (130 lb)",
    im: {
      Deltoid: {
        ok: ["in1"],
        conditional: [{ needle: "in58", when: STRETCH }],
        statement: {
          text: "For adults under 60 kg (130 lb) CDC lists a 1 inch needle in the deltoid; some experts use ⅝ inch if the skin is stretched tightly and the tissue under it is not bunched.",
          sources: ["acip_admin", "ycts_im_adult"],
        },
      },
      VastusLateralis: ADULT_THIGH,
    },
  },
  adult_60_70: {
    id: "adult_60_70",
    group: "adult",
    band: "an adult of 60 to 70 kg (130 to 152 lb)",
    im: {
      Deltoid: {
        ok: ["in1"],
        conditional: [],
        statement: { text: "For adults of 60 to 70 kg (130 to 152 lb) CDC lists a 1 inch (25 mm) needle in the deltoid.", sources: ["acip_admin", "ycts_im_adult"] },
      },
      VastusLateralis: ADULT_THIGH,
    },
  },
  adult_man_70_118: {
    id: "adult_man_70_118",
    group: "adult",
    band: "a man of 70 to 118 kg (152 to 260 lb)",
    im: {
      Deltoid: {
        ok: ["in1", "in125", "in15"],
        conditional: [],
        statement: { text: "For men of 70 to 118 kg (152 to 260 lb) CDC lists a 1 to 1½ inch (25 to 38 mm) needle in the deltoid.", sources: ["acip_admin", "ycts_im_adult"] },
      },
      VastusLateralis: ADULT_THIGH,
    },
  },
  adult_woman_70_90: {
    id: "adult_woman_70_90",
    group: "adult",
    band: "a woman of 70 to 90 kg (152 to 200 lb)",
    im: {
      Deltoid: {
        ok: ["in1", "in125", "in15"],
        conditional: [],
        statement: { text: "For women of 70 to 90 kg (152 to 200 lb) CDC lists a 1 to 1½ inch (25 to 38 mm) needle in the deltoid.", sources: ["acip_admin", "ycts_im_adult"] },
      },
      VastusLateralis: ADULT_THIGH,
    },
  },
  adult_woman_over_90: {
    id: "adult_woman_over_90",
    group: "adult",
    band: "a woman over 90 kg (200 lb)",
    im: {
      Deltoid: {
        ok: ["in15"],
        conditional: [],
        statement: { text: "For women over 90 kg (200 lb) CDC lists a 1½ inch (38 mm) needle in the deltoid.", sources: ["acip_admin", "ycts_im_adult"] },
      },
      VastusLateralis: ADULT_THIGH,
    },
  },
};

/** Needles CDC gives for the non-intramuscular routes. */
export const ROUTE_NEEDLES: Record<Exclude<RouteId, "im">, { ok: NeedleId[]; statement: Cited }> = {
  subcut: {
    ok: ["in58"],
    statement: { text: "For subcutaneous injections CDC lists a ⅝ inch (16 mm), 23 to 25 gauge needle at every age.", sources: ["pinkbook_ch6", "ycts_subcut", "acip_admin"] },
  },
  id: {
    ok: ["tb"],
    statement: { text: "For the tuberculin skin test CDC lists a ¼ to ½ inch, 27 gauge needle on a tuberculin syringe.", sources: ["tb_chart", "tb_guidance"] },
  },
};

/* -------------------------------------------------------------- cases */

export interface CaseSite {
  site: SiteId;
  /** "recommended" is CDC's first choice; "alternative" is allowed, with the note shown. */
  status: "recommended" | "alternative";
  note: Cited;
}

export interface Case {
  id: string;
  model: "adult" | "infant";
  profile: ProfileId;
  route: RouteId;
  /** Case card title, for example "Adult, routine vaccine, intramuscular". */
  title: string;
  /** Synthetic patient line. */
  patient: string;
  /** Generic scenario label only. No drug names. */
  scenario: string;
  /** Extra constraint, when the case has one. */
  constraint?: string;
  sites: CaseSite[];
}

const IM_ADULT_SITES: CaseSite[] = [
  {
    site: "Deltoid",
    status: "recommended",
    note: { text: "For adults, CDC recommends the deltoid muscle of the upper arm for routine intramuscular vaccines.", sources: ["acip_admin", "ycts_im_adult"] },
  },
  {
    site: "VastusLateralis",
    status: "alternative",
    note: { text: "CDC recommends the deltoid for adults. The outer front of the thigh can also be used; the Pink Book describes it as the alternative when the deltoid cannot be used.", sources: ["acip_admin", "pinkbook_ch6"] },
  },
];

const IM_INFANT_SITES: CaseSite[] = [
  {
    site: "VastusLateralis",
    status: "recommended",
    note: { text: "For most infants under 12 months, CDC recommends the vastus lateralis muscle on the outer front of the thigh.", sources: ["acip_admin", "pinkbook_ch6", "ycts_im_infant"] },
  },
];

export const CASES: Case[] = [
  {
    id: "adult-im",
    model: "adult",
    profile: "adult_60_70",
    route: "im",
    title: "Adult, routine vaccine, intramuscular",
    patient: "Adult, 34 years, 65 kg (143 lb)",
    scenario: "Routine vaccine",
    sites: IM_ADULT_SITES,
  },
  {
    id: "infant-im",
    model: "infant",
    profile: "infant",
    route: "im",
    title: "Infant, routine vaccine, intramuscular",
    patient: "Infant, 6 months",
    scenario: "Routine vaccine",
    sites: IM_INFANT_SITES,
  },
  {
    id: "adult-subcut",
    model: "adult",
    profile: "adult_60_70",
    route: "subcut",
    title: "Adult, routine vaccine, subcutaneous",
    patient: "Adult, 52 years, 68 kg (150 lb)",
    scenario: "Routine vaccine",
    sites: [
      {
        site: "Triceps",
        status: "recommended",
        note: { text: "For anyone 12 months and older, CDC gives subcutaneous injections in the upper outer triceps area of the arm.", sources: ["ycts_subcut", "acip_admin"] },
      },
    ],
  },
  {
    id: "adult-man-im",
    model: "adult",
    profile: "adult_man_70_118",
    route: "im",
    title: "Adult man, routine vaccine, intramuscular",
    patient: "Man, 47 years, 100 kg (220 lb)",
    scenario: "Routine vaccine",
    sites: IM_ADULT_SITES,
  },
  {
    id: "adult-id",
    model: "adult",
    profile: "adult_60_70",
    route: "id",
    title: "Adult, tuberculin skin test, intradermal",
    patient: "Adult, 28 years, 62 kg (137 lb)",
    scenario: "Tuberculin skin test",
    sites: [
      {
        site: "Forearm",
        status: "recommended",
        note: { text: "CDC places the tuberculin skin test on the inner surface of the forearm, 2 to 4 inches below the elbow joint.", sources: ["tb_chart", "tb_guidance"] },
      },
    ],
  },
  {
    id: "infant-subcut",
    model: "infant",
    profile: "infant",
    route: "subcut",
    title: "Infant, routine vaccine, subcutaneous",
    patient: "Infant, 9 months",
    scenario: "Routine vaccine",
    sites: [
      {
        site: "VastusLateralis",
        status: "recommended",
        note: { text: "For infants under 12 months, CDC usually gives subcutaneous injections in the fatty tissue of the thigh.", sources: ["acip_admin", "pinkbook_ch6", "ycts_subcut"] },
      },
      {
        site: "Triceps",
        status: "alternative",
        note: { text: "CDC uses the thigh for infants under 12 months. The upper outer triceps area may be used if necessary.", sources: ["ycts_subcut", "acip_admin"] },
      },
    ],
  },
  {
    id: "adult-woman-im",
    model: "adult",
    profile: "adult_woman_over_90",
    route: "im",
    title: "Adult woman, routine vaccine, intramuscular",
    patient: "Woman, 61 years, 95 kg (209 lb)",
    scenario: "Routine vaccine",
    sites: IM_ADULT_SITES,
  },
  {
    id: "newborn-im",
    model: "infant",
    profile: "newborn",
    route: "im",
    title: "Newborn, routine vaccine, intramuscular",
    patient: "Newborn, 2 weeks",
    scenario: "Routine vaccine",
    sites: IM_INFANT_SITES,
  },
  {
    id: "adult-light-im",
    model: "adult",
    profile: "adult_under_60",
    route: "im",
    title: "Adult, routine vaccine, intramuscular",
    patient: "Adult, 23 years, 55 kg (121 lb)",
    scenario: "Routine vaccine",
    sites: IM_ADULT_SITES,
  },
  {
    id: "adult-thigh-im",
    model: "adult",
    profile: "adult_60_70",
    route: "im",
    title: "Adult, routine vaccine, intramuscular",
    patient: "Adult, 40 years, 66 kg (146 lb)",
    scenario: "Routine vaccine",
    constraint: "Neither upper arm can be used today.",
    sites: [
      {
        site: "VastusLateralis",
        status: "recommended",
        note: { text: "When the deltoid cannot be used, the vastus lateralis muscle on the outer front of the thigh can be used for adults.", sources: ["pinkbook_ch6", "acip_admin"] },
      },
    ],
  },
];

/** The 30-second demo case. */
export const DEMO_CASE_ID = "adult-im";

/* --------------------------------------------------------- trust copy */

export const COPY = {
  tagline: "Practice choosing the right injection route, site, needle and angle on a 3D patient.",
  synthetic: "All patients are synthetic. No real patient data is used or collected.",
  educational:
    "Educational tool. Not medical advice, not a medical device, and not a substitute for supervised clinical training or your employer's procedures.",
  shortTrust: "Synthetic patients only. Educational tool, not medical advice.",
  schematic:
    "The cutaway is a schematic, not to scale. Its layer depths are drawn from CDC's needle-length guidance for the patient in the case, not from measured anatomy.",
};

/** Asked for in the brief but not found in a CDC source, so left out. */
export const NOT_COVERED: string[] = [
  "Volume limits per injection site: the CDC vaccine administration sources do not give one, so the trainer does not grade volume.",
  "Intradermal vaccines: CDC states that no routinely recommended U.S. vaccine is given by the intradermal route, so the intradermal case is the tuberculin skin test.",
  "Tissue layer thickness: CDC gives needle lengths, not layer depths, so the cutaway is a labelled schematic.",
];
