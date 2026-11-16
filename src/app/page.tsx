"use client";

import Stage3D from "@/components/Stage3D";

const PROFILE = { skinMm: 2.5, fatBottomMm: 20.5, boneTopMm: 28.5 };
const NO_NEEDLE = { lengthMm: null, angleDeg: null, bevelOnly: false };

export default function Home() {
  return (
    <main style={{ flex: 1, minHeight: 0 }}>
      <Stage3D
        mode="home"
        patient="adult"
        landmarks={false}
        view={{ name: "body", nonce: 0 }}
        marker={null}
        profile={PROFILE}
        needle={NO_NEEDLE}
        injected={false}
        tipTissue={null}
        onTap={() => undefined}
      />
    </main>
  );
}
