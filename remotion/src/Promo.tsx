import React from "react";
import {
  AbsoluteFill,
  Img,
  Sequence,
  interpolate,
  spring,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  Easing,
} from "remotion";

const ACCENT = "#2563eb";
const ACCENT2 = "#00b4d8";
const NAVY = "#0b1220";
const GOLD = "#fbbf24";

const font =
  '"Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';

export type PromoProps = {
  businessName: string;
  catHu: string;
  price: string;
};

const Backdrop: React.FC = () => {
  const frame = useCurrentFrame();
  const shift = interpolate(frame, [0, 300], [0, 25]);
  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <AbsoluteFill
        style={{
          background: `linear-gradient(${130 + shift}deg, #0b1220 0%, #122a4a 55%, #0e3a5f 100%)`,
        }}
      />
      <AbsoluteFill
        style={{
          background:
            "radial-gradient(circle at 20% 15%, rgba(37,99,235,0.30) 0%, transparent 45%), radial-gradient(circle at 85% 85%, rgba(0,180,216,0.25) 0%, transparent 50%)",
        }}
      />
    </AbsoluteFill>
  );
};

const fadeUp = (frame: number, start: number, dist = 40) => ({
  opacity: interpolate(frame, [start, start + 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  }),
  transform: `translateY(${interpolate(frame, [start, start + 14], [dist, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out(Easing.cubic),
  })}px)`,
});

const SceneHook: React.FC<{ name: string }> = ({ name }) => {
  const frame = useCurrentFrame();
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", padding: 90 }}>
      <div style={{ ...fadeUp(frame, 0), textAlign: "center" }}>
        <div style={{ color: ACCENT2, fontFamily: font, fontWeight: 700, fontSize: 34, letterSpacing: 2, textTransform: "uppercase", marginBottom: 26 }}>
          {name}
        </div>
        <div style={{ color: "#fff", fontFamily: font, fontWeight: 900, fontSize: 82, lineHeight: 1.1, letterSpacing: -2 }}>
          Még nincs modern
          <br />
          <span style={{ color: ACCENT2 }}>weboldala?</span>
        </div>
        <div style={{ ...fadeUp(frame, 22), color: "rgba(255,255,255,0.65)", fontFamily: font, fontWeight: 500, fontSize: 36, marginTop: 34 }}>
          Ügyfelei a Google-ban keresik Önt…
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SceneSolution: React.FC<{ hasHero: boolean }> = ({ hasHero }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame: frame - 10, fps, config: { damping: 14 } });
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center" }}>
      <div style={{ ...fadeUp(frame, 0), textAlign: "center", marginBottom: 40 }}>
        <div style={{ color: "#fff", fontFamily: font, fontWeight: 900, fontSize: 64, letterSpacing: -1.5 }}>
          Készítettünk Önnek egyet! ✨
        </div>
      </div>
      <div style={{ width: 760, borderRadius: 20, overflow: "hidden", boxShadow: "0 40px 100px rgba(0,0,0,0.55)", transform: `scale(${interpolate(pop, [0, 1], [0.8, 1])})`, opacity: interpolate(frame, [10, 24], [0, 1], { extrapolateRight: "clamp" }), border: "1px solid rgba(255,255,255,0.1)" }}>
        <div style={{ height: 44, background: "#1f2937", display: "flex", alignItems: "center", paddingLeft: 18, gap: 9 }}>
          <div style={{ width: 13, height: 13, borderRadius: 99, background: "#ff5f57" }} />
          <div style={{ width: 13, height: 13, borderRadius: 99, background: "#febc2e" }} />
          <div style={{ width: 13, height: 13, borderRadius: 99, background: "#28c840" }} />
        </div>
        {hasHero ? (
          <Img src={staticFile("hero.png")} style={{ width: "100%", height: 380, objectFit: "cover", display: "block" }} />
        ) : (
          <div style={{ width: "100%", height: 380, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})` }} />
        )}
      </div>
    </AbsoluteFill>
  );
};

const SceneBenefits: React.FC = () => {
  const frame = useCurrentFrame();
  const benefits = [
    "Modern és mobilbarát dizájn",
    "Megjelenik a Google keresőben",
    "Több megkeresés, több ügyfél",
    "Kész néhány nap alatt",
  ];
  return (
    <AbsoluteFill style={{ justifyContent: "center", padding: "0 120px" }}>
      <div style={{ ...fadeUp(frame, 0), color: "#fff", fontFamily: font, fontWeight: 900, fontSize: 60, letterSpacing: -1.5, marginBottom: 54 }}>
        Amit kap:
      </div>
      {benefits.map((b, i) => {
        const start = 12 + i * 11;
        const a = interpolate(frame, [start, start + 13], [0, 1], { extrapolateLeft: "clamp", extrapolateRight: "clamp", easing: Easing.out(Easing.cubic) });
        return (
          <div key={b} style={{ display: "flex", alignItems: "center", gap: 26, marginBottom: 32, opacity: a, transform: `translateX(${interpolate(a, [0, 1], [60, 0])}px)` }}>
            <div style={{ width: 58, height: 58, borderRadius: 16, background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: "#fff", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 32, fontWeight: 900, flexShrink: 0 }}>✓</div>
            <div style={{ color: "#fff", fontFamily: font, fontWeight: 600, fontSize: 46 }}>{b}</div>
          </div>
        );
      })}
    </AbsoluteFill>
  );
};

const SceneOffer: React.FC<{ price: string; hasLogo: boolean }> = ({ price, hasLogo }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const pop = spring({ frame, fps, config: { damping: 12 } });
  const pulse = 1 + 0.04 * Math.sin((frame / fps) * 6);
  return (
    <AbsoluteFill style={{ justifyContent: "center", alignItems: "center", gap: 30 }}>
      <div style={{ ...fadeUp(frame, 0), color: "rgba(255,255,255,0.7)", fontFamily: font, fontWeight: 600, fontSize: 38 }}>
        A teljes weboldal mindössze
      </div>
      <div style={{ fontFamily: font, fontWeight: 900, fontSize: 150, letterSpacing: -4, color: GOLD, lineHeight: 1, transform: `scale(${interpolate(pop, [0, 1], [0.6, 1])})`, textShadow: "0 10px 40px rgba(251,191,36,0.4)" }}>
        €{price}
      </div>
      <div style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT2})`, color: "#fff", fontFamily: font, fontWeight: 800, fontSize: 40, padding: "24px 64px", borderRadius: 60, boxShadow: "0 16px 50px rgba(37,99,235,0.55)", marginTop: 14, transform: `scale(${pulse})`, opacity: interpolate(frame, [18, 32], [0, 1], { extrapolateRight: "clamp" }) }}>
        Nézze meg az ingyenes mintát →
      </div>
      {hasLogo && (
        <div style={{ background: "#fff", borderRadius: 14, padding: "10px 20px", marginTop: 20, opacity: interpolate(frame, [28, 42], [0, 1], { extrapolateRight: "clamp" }) }}>
          <Img src={staticFile("logo.png")} style={{ height: 44 }} />
        </div>
      )}
    </AbsoluteFill>
  );
};

export const Promo: React.FC<PromoProps & { hasHero?: boolean; hasLogo?: boolean }> = ({
  businessName,
  price,
  hasHero = true,
  hasLogo = true,
}) => {
  return (
    <AbsoluteFill style={{ backgroundColor: NAVY }}>
      <Backdrop />
      <Sequence durationInFrames={75}><SceneHook name={businessName} /></Sequence>
      <Sequence from={75} durationInFrames={75}><SceneSolution hasHero={hasHero} /></Sequence>
      <Sequence from={150} durationInFrames={75}><SceneBenefits /></Sequence>
      <Sequence from={225} durationInFrames={75}><SceneOffer price={price} hasLogo={hasLogo} /></Sequence>
    </AbsoluteFill>
  );
};
