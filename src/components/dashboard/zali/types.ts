export interface ZaliProject {
  id: string;
  name: string;
  description: string;
  designType: string;
  phase: ZaliPhase;
  status: string;
  researchDomains: ResearchDomain[];
  specifications: Record<string, unknown>;
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

export type ZaliPhase = "understanding" | "research" | "design" | "simulation" | "iteration" | "documentation";
export type ZaliTab = "workspace" | "specs" | "materials" | "components" | "analysis" | "research";
