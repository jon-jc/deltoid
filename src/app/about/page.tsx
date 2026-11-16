import type { Metadata } from "next";
import Link from "next/link";
import SiteHeader from "@/components/SiteHeader";
import { COPY } from "@/content/clinical";

export const metadata: Metadata = {
  title: "About | Deltoid",
  description: "What Deltoid is, how it grades answers, and what it is not.",
};

export default function AboutPage() {
  return (
    <>
      <SiteHeader current="about" />
      <main className="doc">
        <div className="doc-inner">
          <h1>About Deltoid</h1>
          <p>
            Deltoid is a practice tool for medical assistants. Each case gives you a synthetic patient and a route. You
            tap the injection site on a 3D figure, pick a needle length and an angle, and watch in a cutaway how deep the
            needle goes. The result says which tissue the needle ended in, what was off, and which CDC source the answer
            comes from.
          </p>

          <div className="callout">
            <p>
              <strong>{COPY.synthetic}</strong>
            </p>
            <p>
              <strong>{COPY.educational}</strong>
            </p>
          </div>

          <h2>How answers are graded</h2>
          <ul>
            <li>
              <strong>Site.</strong> The figure carries the same injection areas you see when you switch landmarks on.
              Your tap is checked against those areas, so grading uses the geometry on screen.
            </li>
            <li>
              <strong>Angle.</strong> CDC gives one angle per route: 90 degrees into muscle, 45 degrees into the fat
              under the skin, and 5 to 15 degrees into the skin for the tuberculin skin test.
            </li>
            <li>
              <strong>Needle length.</strong> For injections into muscle, CDC lists lengths by age and, for adults, by
              weight and sex. Where CDC allows a shorter needle only with a stated technique, the trainer accepts it and
              shows that condition.
            </li>
          </ul>
          <p>
            An answer is correct only when all three match the cited CDC guidance. Every value is listed with its source
            on the <Link href="/sources">Sources</Link> page.
          </p>

          <h2>About the cutaway</h2>
          <p>{COPY.schematic}</p>
          <p>
            In the cutaway, muscle begins between the longest needle that is too short for the patient and the shortest
            one CDC lists, and bone begins just past the longest one CDC lists. At 45 and 90 degrees the needle is shown
            fully inserted. At 5 to 15 degrees only the bevel goes under the skin, as CDC describes for the tuberculin
            skin test.
          </p>

          <h2>About the 3D patients</h2>
          <p>
            The adult and infant figures, their skeletons and muscles, the tissue block and the syringe were modelled in
            Blender for this project. The figures have no face and represent no real person. The bony landmarks you can
            switch on (the acromion, the greater trochanter, the iliac crest and the anterior superior iliac spine) sit
            on the skin over the matching bones of the model.
          </p>

          <h2>Privacy</h2>
          <p>
            No login, no cookies, no analytics and no database. Your progress is kept in this browser tab only and is
            gone when you close or reload it.
          </p>

          <h2>Scope</h2>
          <p>
            The trainer covers intramuscular, subcutaneous and intradermal injection: route, site, needle and angle. It
            does not cover drug dosing, drug names, preparation, documentation or patient care.
          </p>

          <p>
            <Link href="/" className="back-link">
              Back to the trainer
            </Link>
          </p>
        </div>
      </main>
    </>
  );
}
