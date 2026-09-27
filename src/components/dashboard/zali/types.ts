export interface ZaliProject {
  id: string;
  name: string;
  description: string;
  designType: string;
  phase: ZaliPhase;
  status: string;
  researchDomains: ResearchDomain[];
  specifications: Record<string, unknown>;
  specs?: Record<string, unknown>;
  materials?: string[];
  costAnalysis: Record<string, unknown>;
  manufacturing: Record<string, unknown>;
  simulationResults: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ZaliMessage {
  id: string;
  projectId: string;
  role: "user" | "assistant";
  content: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ResearchDomain {
  name: string;
  progress: number;
  findings: string[];
  status: "pending" | "active" | "complete";
}

export interface ZaliAgent {
  id: string;
  name: string;
  icon: string;
  domain: string;
  description: string;
  color: string;
}

export type ZaliPhase = "understanding" | "research" | "design" | "simulation" | "iteration" | "documentation";
export type ZaliTab = "workspace" | "specs" | "simulations" | "cost" | "manufacturing" | "agents" | "research" | "community" | "materials-db" | "components" | "sim-engine" | "mfg-verify" | "optimization" | "god-mode";
