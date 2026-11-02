import { Composition } from "remotion";
import { DX, Diagnostico } from "./dx/Diagnostico";
import type { Lead } from "./dx/base";

// só para abrir o modelo no Studio; o render real sempre recebe o lead por --props
const leadPadrao: Lead = { pasta: "dx_leads/exemplo", dims: {}, empresa: "Lead de exemplo", url: "exemplo.test", teste: true, pontos: [] };

export const RemotionRoot: React.FC = () => (
  <Composition id="Diagnostico" component={Diagnostico} fps={DX.fps} durationInFrames={DX.quadros} width={1080} height={1920}
    defaultProps={{ lead: leadPadrao }} />
);
