import { Landmark, Package, Atom, Brain, Lock, Cpu, Siren, Crosshair, Scale, Server, GraduationCap, Globe, UserSearch, Sword, BarChart3, FileCheck, Smartphone, Radar } from "lucide-react";
import type { ZerlalScreen } from "./types";

interface IntelligenceModuleProps {
  screen: ZerlalScreen;
}

const moduleData: Record<string, { title: string; subtitle: string; icon: React.ElementType; features: { name: string; desc: string; status: "active" | "coming" }[] }> = {
  compliance: {
    title: "Regulatory Compliance Automation",
    subtitle: "Auto-map findings to CMMC 2.0, NIST SP 800-171/172, FedRAMP, DORA, NIS2, ISO 27001, SOC 2, PCI DSS, HIPAA, GDPR, EU Cyber Resilience Act, SEC, and False Claims Act Shield",
    icon: Landmark,
    features: [
      { name: "CMMC 2.0 Continuous Compliance Engine", desc: "Auto-maps findings to CMMC Level 1-3 controls, generates POA&M documents, tracks remediation against deadlines, maintains SPRS-ready reporting", status: "active" },
      { name: "NIST SP 800-171/172 Live Gap Tracker", desc: "Ingests every NIST publication update and surfaces which systems are non-compliant the day a new standard drops", status: "active" },
      { name: "Multi-Framework Simultaneous Mapping", desc: "Single findings mapped in real-time to CMMC, NIST CSF 2.0, FISMA, FedRAMP, DORA, NIS2, EU CRA, ISO 27001, SOC 2, PCI DSS, HIPAA, GDPR, SWIFT CSP, SEC rules", status: "active" },
      { name: "False Claims Act Shield Module", desc: "Cryptographically signed, timestamped compliance attestation records that serve as legal evidence for DOJ FCA defense", status: "active" },
      { name: "Regulatory Change Alerting", desc: "Auto-monitors Federal Register, NIST, CISA, EU Official Journal, DoD DFARS — surfaces affected environments overnight", status: "active" },
    ],
  },
  "supply-chain": {
    title: "Supply Chain Intelligence",
    subtitle: "SBOM generation, foreign adversary detection, dependency propagation mapping, vendor risk scoring, real-time CVE monitoring",
    icon: Package,
    features: [
      { name: "SBOM Generator & Analyzer", desc: "Auto-generate CycloneDX and SPDX SBOMs. Analyze vendor SBOMs for prohibited-country components and undisclosed origins. Legally required under Executive Order 14028.", status: "active" },
      { name: "Foreign Adversary Component Detection", desc: "Cross-references dependencies against corporate ownership databases to detect components controlled by NDAA-prohibited entities", status: "active" },
      { name: "Dependency Chain Vulnerability Propagation", desc: "Maps every package importing a vulnerable library, every service calling those packages — generates blast radius visualization", status: "active" },
      { name: "Third-Party Vendor Risk Scanning", desc: "Pulls vendor SBOMs and security attestations, maintains live vendor risk score that updates when vendor pushes new code", status: "coming" },
      { name: "Transitive Dependency Time-Bomb Detection", desc: "Detects dependencies with scheduled EOL dates, maintainer abandonment signals, or declining commit activity", status: "active" },
      { name: "Real-Time CVE Monitoring", desc: "Instant alerts when a CVE is published against any library in your stack — not in the next scheduled scan, instantly", status: "active" },
    ],
  },
  quantum: {
    title: "Post-Quantum Cryptography Readiness",
    subtitle: "Cryptographic inventory, quantum vulnerability assessment, PQC migration roadmap, harvest-now-decrypt-later risk scoring",
    icon: Atom,
    features: [
      { name: "Cryptographic Inventory Scanner", desc: "Identifies every cryptographic primitive: algorithm, key length, library, version — complete crypto asset register across entire codebase and infrastructure", status: "active" },
      { name: "Quantum Vulnerability Assessment", desc: "Classifies crypto usage as Quantum-Safe, Quantum-Vulnerable, or Unknown — prioritized by data sensitivity. Scans certificates, TLS config, SSH keys.", status: "active" },
      { name: "PQC Migration Roadmap Generator", desc: "Phased migration plan to NIST-approved post-quantum algorithms: which systems first, estimated effort, and rollback strategies", status: "active" },
      { name: "Harvest-Now-Decrypt-Later Risk Scoring", desc: "Identifies data adversaries could harvest today to decrypt once quantum computers mature — assigns urgency scores based on data classification", status: "active" },
    ],
  },
  "ai-security": {
    title: "AI System Security",
    subtitle: "Model scanning, prompt injection analysis, agent behavior auditing, training data lineage, shadow AI discovery, AI-generated code auditing",
    icon: Brain,
    features: [
      { name: "AI Model Security Scanning", desc: "Scans ONNX, PyTorch, TensorFlow, HuggingFace models for serialization exploits, embedded payloads, poisoning indicators", status: "active" },
      { name: "Prompt Injection Surface Analysis", desc: "Identifies injection vectors where attacker-controlled content could override system instructions or exfiltrate data", status: "active" },
      { name: "AI Agent Behavior Auditing", desc: "Monitors agent action logs, flags anomalous tool invocations, detects privilege escalation attempts by agents", status: "active" },
      { name: "AI-Generated Code Security Layer", desc: "Intercepts output from Copilot, Cursor, and AI coding assistants. Audits for vulnerability patterns unique to AI-generated code before commit.", status: "active" },
      { name: "Training Data Lineage Scanner", desc: "Flags PII, copyrighted material, data from prohibited jurisdictions, and data poisoning patterns in training datasets", status: "coming" },
      { name: "Shadow AI Discovery", desc: "Scans repositories for API calls to unauthorized AI services, credentials for unapproved AI platforms", status: "active" },
      { name: "OWASP Top 10 for LLMs", desc: "Prompt injection, insecure output handling, training data poisoning, model DoS, supply chain, sensitive disclosure, excessive agency", status: "active" },
    ],
  },
  "zero-trust": {
    title: "Zero-Trust Architecture Validation",
    subtitle: "Gap analysis against DoD ZTA and CISA ZTMM, identity audit, machine identity inventory, lateral movement path analysis",
    icon: Lock,
    features: [
      { name: "Zero-Trust Gap Analysis", desc: "Scans against DoD Zero Trust Reference Architecture and CISA Zero Trust Maturity Model for implicit trust, missing mTLS, overprivileged accounts", status: "active" },
      { name: "Identity & Access Control Audit", desc: "Hardcoded credentials, overpermissioned IAM roles, missing least privilege, JWT handling, OAuth misconfig, API auth bypasses", status: "active" },
      { name: "Machine Identity Inventory", desc: "Discovers every non-human identity: service accounts, API keys, certificates, tokens — maps permissions and flags excessive access", status: "active" },
      { name: "Lateral Movement Path Analysis", desc: "Identifies paths an attacker could use post-access, visualizes as attack graphs, prioritizes highest-value chokepoints", status: "coming" },
    ],
  },
  "ot-ics": {
    title: "Operational Technology & Critical Infrastructure",
    subtitle: "OT/ICS/SCADA protocol analysis, firmware binary analysis, IT/OT convergence risk mapping, Purdue model architecture mapping",
    icon: Cpu,
    features: [
      { name: "OT/ICS Protocol Analysis", desc: "Analyzes Modbus, DNP3, IEC 61850, PROFINET, BACnet, OPC-UA for authentication gaps, unencrypted channels, hardcoded credentials", status: "active" },
      { name: "SCADA Configuration Scanner", desc: "Scans SCADA configurations, PLC firmware, HMI interfaces and ICS network traffic. Maps Purdue model architecture and identifies unsafe IT/OT convergence points.", status: "active" },
      { name: "Firmware Binary Analysis", desc: "Decompiles firmware from embedded devices without source code — identifies hardcoded credentials, insecure boot, undocumented services", status: "active" },
      { name: "IT/OT Convergence Risk Mapping", desc: "Maps pathways between IT and OT environments, identifies cross-domain attack chains, flags which legacy device is the highest-risk entry point", status: "coming" },
      { name: "Legacy System Vulnerability Assessment", desc: "Specialized analysis for COBOL, Fortran, Ada and other legacy languages running government mainframes", status: "coming" },
      { name: "IoT Cyber Trust Mark Compliance", desc: "Scans IoT software and generates Cyber Trust Mark compliance reports automatically per Executive Order requirements", status: "active" },
    ],
  },
  incident: {
    title: "Incident Response Command Center",
    subtitle: "Pre-incident forensic baseline, automated root cause analysis, patch window intelligence, MTTR analytics, breach notification drafting",
    icon: Siren,
    features: [
      { name: "Incident Response Command Center", desc: "Active intrusion detected → isolate systems, preserve forensic artifacts, generate real-time timeline, auto-draft GDPR/HIPAA/SEC breach notifications, assign remediation tasks", status: "active" },
      { name: "Pre-Incident Forensic Baseline", desc: "Complete forensic baseline: dependency graph, cryptographic inventory, service map, known-good binary hashes — instant comparison during incidents", status: "active" },
      { name: "Automated Root Cause Analysis", desc: "Correlates attack vectors against findings database — answers 'Was this flagged? Was it remediated?' for regulatory reporting", status: "active" },
      { name: "Patch Window Intelligence", desc: "Tracks findings with public PoC code, estimates exploitability timelines, generates urgent remediation windows with business-impact context", status: "active" },
      { name: "Mean Time to Remediation Analytics", desc: "Tracks every finding from discovery to close — surfaces slowest teams, longest vulnerability classes, bottlenecks in patch cycle", status: "active" },
    ],
  },
  "threat-intel": {
    title: "Nation-State Threat Intelligence",
    subtitle: "MITRE ATT&CK mapping, STIX/TAXII feed integration, foreign adversary code signatures, sector-specific threat profiles, geopolitical scenario modeling",
    icon: Crosshair,
    features: [
      { name: "Threat Actor TTP Mapping", desc: "Maps findings to MITRE ATT&CK techniques and known threat actor playbooks — identifies which nation-state groups exploit this vulnerability class", status: "active" },
      { name: "Attribution-Grade Indicator Correlation", desc: "Integrates classified and unclassified threat intel feeds (STIX/TAXII) — escalates when matching active threat actor techniques", status: "active" },
      { name: "Foreign Adversary Code Signature Detection", desc: "Analyzes code for patterns consistent with known nation-state implants and backdoors via supply chain compromise", status: "coming" },
      { name: "Sector-Specific Threat Profiles", desc: "Defense Industrial Base, Energy & Utilities, Financial Services, Healthcare, Federal Civilian — different adversaries, different techniques", status: "active" },
      { name: "Geopolitical Threat Scenario Modeling", desc: "War-gaming simulation: model cyberattack vectors based on geopolitical escalation. Estimate time-to-exploitation for top vulnerabilities if a nation-state prioritized your org.", status: "active" },
    ],
  },
  "dark-web": {
    title: "Dark Web & Threat Feed Intelligence",
    subtitle: "Dark web monitoring, credential leak detection, exploit marketplace tracking, early warning system",
    icon: Globe,
    features: [
      { name: "Dark Web Monitoring Engine", desc: "Watches for your organization's source code appearing for sale, employees' credentials being traded, and discussion of your software in threat actor forums", status: "active" },
      { name: "Credential Leak Detection", desc: "Real-time alerting when employee or customer credentials appear in data breaches, paste sites, or dark web marketplaces", status: "active" },
      { name: "Exploit Marketplace Tracking", desc: "Monitors exploit brokers and forums for active exploit code being developed for vulnerabilities in systems you use", status: "active" },
      { name: "Brand Misuse & Phishing Detection", desc: "Monitors for phishing sites, fake social media accounts, domain impersonations, and mobile app fraud targeting your brand", status: "coming" },
      { name: "Early Warning Intelligence", desc: "Before an attacker uses a vulnerability against you, they talk about it somewhere. ZERLAL listens and alerts before the attack happens.", status: "active" },
    ],
  },
  ueba: {
    title: "Insider Threat & Behavioral Analytics (UEBA)",
    subtitle: "User and entity behavior analytics, compromised account detection, anomaly detection, zero-day attack identification",
    icon: UserSearch,
    features: [
      { name: "Behavioral Baseline Engine", desc: "Establishes baseline of normal activity for every user and entity. Flags deviations — developer downloading entire repos at 2am, unusual API calls, logins from strange locations.", status: "active" },
      { name: "Compromised Account Detection", desc: "ML-driven detection of credential stuffing, session hijacking, and lateral movement using stolen credentials that blend into normal activity", status: "active" },
      { name: "Insider Threat Scoring", desc: "Risk scores for users based on behavioral anomalies, data access patterns, and policy violations — with full audit trail for investigations", status: "active" },
      { name: "AI-Powered Alert Prioritization", desc: "Reduces SOC noise by 90%+ — focuses on true positives, suppresses false alarms, and ranks alerts by actual business impact", status: "coming" },
    ],
  },
  "red-team": {
    title: "Autonomous Red Team Agent",
    subtitle: "Continuous adversary simulation, automated kill chain mapping, persistent probing on every commit and config change",
    icon: Sword,
    features: [
      { name: "Continuous Red Team Agent", desc: "Persistent agent that never stops probing. Every code push, config change, or new CVE triggers a re-run against your live environment. Simulates what a nation-state attacker would actually do.", status: "active" },
      { name: "Full Kill Chain Simulation", desc: "Not just 'here is a buffer overflow' — traces the full kill chain from initial entry to lateral movement to data exfiltration or system destruction, step by step", status: "active" },
      { name: "Adversary Emulation Profiles", desc: "Simulate specific threat actors: APT28, APT41, Lazarus Group, Sandworm. Uses their real TTPs from MITRE ATT&CK to test your defenses.", status: "active" },
      { name: "Automated PoC Generation", desc: "For every confirmed vulnerability, generates a working proof-of-concept exploit. Validates exploitability, not just theoretical risk.", status: "coming" },
    ],
  },
  "exec-risk": {
    title: "Executive & Board-Level Cyber Risk Scoring",
    subtitle: "Dynamic 0-1000 risk score, trend analysis, industry benchmarking, board-ready slide generation",
    icon: BarChart3,
    features: [
      { name: "Dynamic Cyber Risk Score", desc: "A single 0-1000 number updated in real time that quantifies total security posture. Breaks down by code security, infrastructure, supply chain, device hygiene, human factors.", status: "active" },
      { name: "Industry Peer Benchmarking", desc: "Compare your security posture against similar companies in your sector. Know if you're ahead or behind your peers.", status: "active" },
      { name: "Board-Ready Dashboard & Slides", desc: "One-click auto-generated slide deck a CISO presents to their board every quarter. Posture grade, trend, top 5 risks in plain English, cost of inaction estimate.", status: "active" },
      { name: "Trend Analysis & Forecasting", desc: "Historical risk trajectory with predictive modeling. Shows impact of remediation efforts and projects future risk reduction from planned fixes.", status: "active" },
    ],
  },
  "cvd-pipeline": {
    title: "Coordinated Vulnerability Disclosure Pipeline",
    subtitle: "CVE filing, vendor notification, NVD integration, disclosure tracking, 90-day countdown timers",
    icon: FileCheck,
    features: [
      { name: "CVD Workflow Engine", desc: "Built-in workflow to report findings to software vendors with auto-generated professional CVD reports, tracking of disclosure status, and 90-day countdown timers", status: "active" },
      { name: "CVE Pipeline & NVD Integration", desc: "Direct integration with CISA and NVD. When ZERLAL discovers a zero-day and responsible disclosure is complete, the CVE is filed through ZERLAL's platform automatically.", status: "active" },
      { name: "Disclosure Tracking Dashboard", desc: "Track every disclosure from initial report to vendor acknowledgment to patch release. Full audit trail for regulatory compliance.", status: "active" },
      { name: "Vendor Communication Templates", desc: "Pre-built professional disclosure templates following ISO 29147 and ISO 30111 standards. Auto-populated with finding details.", status: "active" },
    ],
  },
  "device-security": {
    title: "Device Security Scanning",
    subtitle: "Mobile/tablet security scan, permission auditing, certificate store analysis, OS vulnerability check, multi-device management",
    icon: Smartphone,
    features: [
      { name: "On-Device Security Assessment", desc: "Scans OS version & patch level, installed apps against CVE history, permission audit (camera, mic, location), network security, certificate store, Bluetooth exposure", status: "coming" },
      { name: "Device Security Score", desc: "Each device gets a 0-100 score with risk level badge (Safe / Moderate / Critical). Drill into any device for detailed category-by-category findings.", status: "coming" },
      { name: "Multi-Device Enterprise Management", desc: "IT admins see all enrolled employee devices on one screen. Push security policies, enforce encryption, monitor compliance status.", status: "coming" },
      { name: "CVE Push Notifications", desc: "Instant push notification when a new CVE drops that affects your device's OS version. Same-day awareness before exploitation.", status: "coming" },
      { name: "Privacy Controls", desc: "Explicit consent, category exclusions, one-tap delete, local-only mode (zero cloud sync), and auto-delete retention settings (30/60/90 days)", status: "coming" },
    ],
  },
  governance: {
    title: "Governance, Explainability & Audit",
    subtitle: "Full AI decision explainability, immutable audit log, human override workflows, scan reproducibility, board-level reporting",
    icon: Scale,
    features: [
      { name: "Full AI Decision Explainability", desc: "Every finding includes reasoning chain, false positive rate, confidence interval — not a black box", status: "active" },
      { name: "Immutable Audit Log", desc: "Cryptographically chained, append-only log of every scan, finding, status change, API call — tamper-evident, FISMA/FedRAMP exportable", status: "active" },
      { name: "Human Override & Accountability Layer", desc: "Configurable human approval workflow for every automated action — governments need proof no autonomous action without authorization", status: "active" },
      { name: "Scan Reproducibility", desc: "Every scan precisely reproducible: same code state, same parameters, same output — required for legal proceedings", status: "active" },
      { name: "Board-Level Risk Reporting", desc: "One-click non-technical risk summary: posture grade, trend, top 5 risks in plain English, cost of inaction estimate", status: "active" },
    ],
  },
  deployment: {
    title: "Elite Deployment Architecture",
    subtitle: "Air-gapped sovereign mode, GovCloud, classified network kits, sovereign data residency, CAC/PIV authentication, C-ATO support",
    icon: Server,
    features: [
      { name: "Classified Network Deployment Kits", desc: "AWS GovCloud (IL2/4/5), Azure Government (SECRET, TS/SCI), on-premise air-gapped, JWICS-connected networks", status: "active" },
      { name: "Sovereign / Air-Gap Mode", desc: "Entire stack runs inside customer's own data center or sovereign cloud. Zero telemetry, zero callbacks, customer-controlled encryption keys.", status: "active" },
      { name: "Multi-Tenant Intelligence Sharing", desc: "Agencies share anonymized finding patterns without sharing classified code — collective detection improvement", status: "coming" },
      { name: "Sovereign Data Residency", desc: "Data never leaves customer's jurisdiction — scan telemetry, findings, code stays geofenced per data center", status: "active" },
      { name: "Continuous Authority to Operate (C-ATO)", desc: "Auto-updated risk registers, control validation evidence, deviation tracking — continuous ATO vs. painful annual renewal", status: "active" },
      { name: "CAC/PIV Authentication", desc: "Native Common Access Card and PIV hardware identity card authentication for federal agency compliance", status: "active" },
    ],
  },
  workforce: {
    title: "Economics & Workforce Augmentation",
    subtitle: "Junior analyst augmentation, CMMC assessment preparation, vCISO support packages",
    icon: GraduationCap,
    features: [
      { name: "Junior Analyst Augmentation Mode", desc: "Guided interface explaining every finding in educational context — turns a junior analyst into mid-level within weeks", status: "active" },
      { name: "CMMC Assessment Preparation Pack", desc: "Generates system security plan, network diagrams from code, control implementation statements, evidence artifacts for Level 2/3 assessment", status: "active" },
      { name: "vCISO Support Package", desc: "Multi-client dashboard, client-specific reporting, cross-client anonymized benchmarking, white-label reporting", status: "coming" },
    ],
  },
  "pattern-engine": {
    title: "Pattern Recognition Engine",
    subtitle: "Cross-codebase vulnerability pattern mapping, developer-level attribution, temporal drift detection, architectural risk clustering",
    icon: Radar,
    features: [
      { name: "Recurring Vulnerability Class Detection", desc: "Identifies patterns across your entire codebase — e.g., 'you consistently mishandle input validation in async functions' — with root cause analysis and org-wide remediation plans", status: "active" },
      { name: "Developer-Level Attribution", desc: "Connect Git history to see which developer introduced the most security debt. Not for blame — for targeted training and code review prioritization.", status: "active" },
      { name: "Cross-Project Pattern Analysis", desc: "Enterprise tier: identifies when the same vulnerability class appears across multiple repos. 'This vuln class appeared in 3 of your 7 repos' with shared root cause.", status: "active" },
      { name: "Temporal Drift & Regression Tracking", desc: "Tracks whether new code introduces more vulnerabilities than old code. Detects security regressions, measures improvement over sprints, flags backsliding.", status: "active" },
      { name: "Architectural Risk Clustering", desc: "Maps whole subsystems that are structurally more dangerous than others — identifies high-risk zones in your architecture before they become breach points.", status: "active" },
      { name: "Zero-Day Confidence Scoring", desc: "Proprietary score showing how likely a finding is to be a genuine novel zero-day vs a known vulnerability class. The number governments care about most.", status: "active" },
    ],
  },
};

const IntelligenceModule = ({ screen }: IntelligenceModuleProps) => {
  const data = moduleData[screen];
  if (!data) return null;

  const Icon = data.icon;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-5 max-w-[900px] mx-auto space-y-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center">
            <Icon className="h-5 w-5 text-foreground/40" />
          </div>
          <div>
            <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">{data.title}</h2>
            <p className="text-[10px] text-muted-foreground/35 mt-0.5 max-w-xl">{data.subtitle}</p>
          </div>
        </div>

        <div className="space-y-3">
          {data.features.map((f, i) => (
            <div key={i} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-4 hover:bg-foreground/[0.01] transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="text-[11px] text-foreground/60">{f.name}</h3>
                    <span className={`text-[7px] px-1.5 py-0.5 rounded-full uppercase tracking-wider ${
                      f.status === "active" ? "bg-emerald-500/10 text-emerald-400" : "bg-foreground/[0.03] text-muted-foreground/30"
                    }`}>
                      {f.status === "active" ? "Active" : "Coming Soon"}
                    </span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/35 mt-1 leading-relaxed">{f.desc}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default IntelligenceModule;
