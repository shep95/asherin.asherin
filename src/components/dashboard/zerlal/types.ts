export type ZerlalScreen = "dashboard" | "project" | "finding" | "reports" | "integrations" | "settings" | "team" | "compliance" | "supply-chain" | "quantum" | "ai-security" | "zero-trust" | "incident" | "threat-intel" | "governance" | "ot-ics" | "deployment" | "workforce" | "dark-web" | "ueba" | "cvd-pipeline" | "exec-risk" | "red-team" | "device-security" | "pattern-engine" | "domain-recon" | "path-map" | "sigma-rules" | "stix-feed" | "log-correlation" | "cert-transparency" | "code-scanner" | "port-scanner" | "whois-timeline" | "tor-checker" | "ghostchain";

export type FindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type FindingType = "security" | "workflow-function";
export type FindingCategory = "memory-safety" | "injection" | "secrets" | "dependencies" | "logic" | "crypto" | "auth" | "config" | "supply-chain" | "ai-security" | "zero-trust" | "ot-ics" | "infrastructure" | "cross-domain" | "concealment" | "workflow" | "function" | "state" | "data-integrity" | "user-flow" | "other";
export type FindingStatus = "open" | "in-progress" | "resolved" | "waived";
export type ScanStatus = "idle" | "queued" | "scanning" | "complete" | "failed";
export type RiskGrade = "A" | "B" | "C" | "D" | "F";

export interface ZerlalProject {
  id: string;
  user_id: string;
  name: string;
  repo_url: string | null;
  source_type: string;
  language: string;
  risk_grade: RiskGrade;
  last_scan_at: string | null;
  scan_duration: number | null;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  status: ScanStatus;
  file_size: number;
  storage_path: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZerlalFinding {
  id: string;
  user_id: string;
  project_id: string;
  scan_id: string | null;
  finding_type: FindingType;
  severity: FindingSeverity;
  title: string;
  file_path: string | null;
  line_number: number;
  category: string;
  confidence: number;
  age_days: number;
  first_seen_at: string;
  assignee: string | null;
  status: FindingStatus;
  cwe_id: string;
  cvss_score: number;
  description: string;
  impact: string;
  exploitation_steps: string[];
  code_snippet: string;
  suggested_fix: string;
  dataflow_trace: { file: string; line: number; label: string }[];
  chained_with: string[];
  compliance_controls: string[];
  similar_cves: string[];
  is_false_positive: boolean;
  waiver_reason: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ZerlalScan {
  id: string;
  user_id: string;
  project_id: string;
  scan_profile: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  duration: number | null;
  findings_count: number;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  info_count: number;
  error: string | null;
  created_at: string;
}

export interface ScanProfile {
  id: string;
  name: string;
  description: string;
  estimatedTime: string;
  includes: string[];
}

export interface IntegrationTile {
  id: string;
  name: string;
  category: "cicd" | "issues" | "comms" | "identity" | "siem" | "compliance";
  icon: string;
  connected: boolean;
}
