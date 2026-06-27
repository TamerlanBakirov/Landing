import "./index.css";
import { Composition } from "remotion";
import { Promo } from "./Promo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="Promo"
        component={Promo}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{
          businessName: "Minta Vállalkozás",
          catHu: "szolgáltató",
          price: "499",
          hasHero: true,
          hasLogo: true,
        }}
      />
    </>
  );
};
