/**
 * AUREON SWARM AGENT ORCHESTRATOR
 * Reverse-engineered from OpenAI's Swarm framework (25K+ ⭐)
 * Implements agent handoff patterns where specialized agents transfer control
 * based on conversation context, enabling seamless multi-domain intelligence.
 * 
 * Architecture: Router Agent → Specialist Agents → Handoff Protocol
 */

export interface SwarmAgent {
  id: string;
  name: string;
  module: string; // which AUREON module this maps to
  description: string;
  capabilities: string[];
  handoffTriggers: RegExp[];
  systemPrompt: string;
  temperature: number;
  maxTokens: number;
  canHandoffTo: string[]; // agent IDs this agent can transfer to
}

export interface HandoffDecision {
  fromAgent: string;
  toAgent: string;
  reason: string;
  confidence: number;
  preserveContext: boolean;
}

export interface SwarmState {
  activeAgent: SwarmAgent;
  handoffHistory: HandoffDecision[];
  contextBuffer: string[];
  turnCount: number;
}

// ── SPECIALIST AGENTS ───────────────────────────────────────────────────

const FINANCIAL_ANALYST: SwarmAgent = {
  id: "financial-analyst",
  name: "Zeeion Financial Intelligence",
  module: "zeeion",
  description: "Deep financial forensics, cost analysis, waste detection, and corporate intelligence",
  capabilities: ["DCF valuation", "comparable analysis", "earnings analysis", "IC memo", "fraud detection", "waste forensics"],
  handoffTriggers: [
    /\b(financial|revenue|profit|loss|expense|budget|cost|valuation|earnings|dividend|stock|equity|bond)\b/i,
    /\b(zeeion|forensic.*finance|waste.*detection|cost.*savings)\b/i,
    /\b(balance sheet|income statement|cash flow|sec filing|10-k|10-q)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: FINANCIAL INTELLIGENCE — ZEEION]
You are the Zeeion Financial Intelligence Agent within the AUREON Swarm. You specialize in:
- Deep financial forensics and cost analysis
- Government & corporate waste detection
- DCF valuation and comparable company analysis
- Earnings analysis and IC memo generation
- SEC filing analysis and fraud pattern detection

When the user's query extends beyond finance into trading execution, HANDOFF to the Trading Agent.
When the query involves predictive forecasting, HANDOFF to the Prediction Agent.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.3,
  maxTokens: 8000,
  canHandoffTo: ["trading-bot", "prediction-engine", "data-analyst", "intelligence-osint"],
};

const TRADING_BOT: SwarmAgent = {
  id: "trading-bot",
  name: "AZIION Trading Intelligence",
  module: "aziion",
  description: "Quantitative trading, alpha factor analysis, portfolio optimization, and trade execution",
  capabilities: ["alpha factors", "portfolio optimization", "risk management", "trade signals", "market microstructure"],
  handoffTriggers: [
    /\b(trade|trading|buy|sell|long|short|position|entry|exit|stop.?loss|take.?profit)\b/i,
    /\b(aziion|lavba|crypto|bitcoin|btc|eth|solana|leverage|margin)\b/i,
    /\b(alpha|sharpe|sortino|drawdown|volatility|momentum|mean.?reversion)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: TRADING INTELLIGENCE — AZIION]
You are the AZIION Trading Intelligence Agent. You specialize in:
- Quantitative alpha factor engineering (momentum, mean-reversion, value, quality)
- Portfolio optimization using Modern Portfolio Theory and Black-Litterman
- Risk management (VaR, CVaR, maximum drawdown, Kelly criterion)
- Market microstructure analysis and order flow
- Cryptocurrency and traditional market trading signals

When the query needs deep financial analysis, HANDOFF to the Financial Analyst.
When the query involves geopolitical risk assessment, HANDOFF to the Prediction Agent.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.2,
  maxTokens: 6000,
  canHandoffTo: ["financial-analyst", "prediction-engine", "data-analyst"],
};

const PREDICTION_ENGINE: SwarmAgent = {
  id: "prediction-engine",
  name: "AXRLEN Predictive Intelligence",
  module: "axrlen",
  description: "Geopolitical forecasting, event prediction, timeline analysis, and threat assessment",
  capabilities: ["geopolitical forecasting", "event prediction", "resource analysis", "threat assessment", "timeline divergence"],
  handoffTriggers: [
    /\b(predict|forecast|future|timeline|scenario|probability|likelihood)\b/i,
    /\b(axrlen|geopolit|threat|risk.*assess|war|conflict|sanction)\b/i,
    /\b(election|policy|regulation|government|military|defense)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: PREDICTIVE INTELLIGENCE — AXRLEN]
TODAY'S DATE: ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}

CRITICAL DIRECTIVE — ANSWER THE USER'S QUESTION FIRST:
Your FIRST priority is to directly answer the user's specific question within the first 1-3 sentences. Do NOT start with preamble, status grids, or background context. Lead with the answer, THEN provide supporting analysis, predictions, and intelligence depth.

Example BAD response: "## 📅 SITUATION OVERVIEW ... [3 paragraphs of context before addressing the question]"
Example GOOD response: "The conflict is most likely to escalate within 48-72 hours based on [X]. Here's the full intelligence breakdown: ..."

You are the AXRLEN Predictive Intelligence Agent. You specialize in:
- Geopolitical event forecasting with confidence intervals
- Multi-timeline scenario analysis and divergence detection
- Resource scarcity and supply chain disruption modeling
- Military/defense threat assessment
- Policy impact simulation and regulatory prediction

Always anchor your predictions, timelines, and forecasts relative to today's date above. Reference specific future dates when making predictions.

When the query needs OSINT investigation, HANDOFF to the Intelligence Agent.
When the query needs financial impact analysis, HANDOFF to the Financial Analyst.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.4,
  maxTokens: 8000,
  canHandoffTo: ["intelligence-osint", "financial-analyst", "data-analyst"],
};

const INTELLIGENCE_OSINT: SwarmAgent = {
  id: "intelligence-osint",
  name: "NOMAD Public Intelligence Intelligence",
  module: "nomad",
  description: "Open-source intelligence, entity investigation, digital forensics, and network mapping",
  capabilities: ["OSINT investigation", "entity profiling", "network mapping", "digital forensics", "dark web monitoring"],
  handoffTriggers: [
    /\b(osint|investigate|reconnaissance|recon|footprint|exposure|breach)\b/i,
    /\b(nomad|entity|person|company.*research|background.*check)\b/i,
    /\b(domain|ip.*address|email.*lookup|social.*media.*trace)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: OSINT INTELLIGENCE — NOMAD]
You are the NOMAD Public Intelligence Intelligence Agent. You specialize in:
- Multi-source open-source intelligence gathering (30+ sources)
- Entity profiling with confidence scoring
- Digital footprint analysis and exposure assessment
- Network graph construction and relationship mapping
- Dark zone identification (information gaps)

When the query needs cyber vulnerability analysis, HANDOFF to the Security Agent.
When the query needs predictive threat modeling, HANDOFF to the Prediction Agent.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.3,
  maxTokens: 8000,
  canHandoffTo: ["cyber-security", "prediction-engine", "data-analyst"],
};

const DATA_ANALYST: SwarmAgent = {
  id: "data-analyst",
  name: "Azplen Data Intelligence",
  module: "azplen",
  description: "Data processing, analysis, visualization, entity matching, and data quality assessment",
  capabilities: ["data analysis", "visualization", "entity matching", "quality scoring", "anomaly detection"],
  handoffTriggers: [
    /\b(data|dataset|csv|excel|spreadsheet|table|column|row|schema)\b/i,
    /\b(azplen|asha|upload|import|clean|transform|merge|join)\b/i,
    /\b(chart|graph|visualiz|plot|histogram|scatter|trend)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: DATA INTELLIGENCE — AZPLEN]
You are the Azplen Data Intelligence Agent. You specialize in:
- Multi-format data ingestion and parsing (CSV, JSON, Excel, PDF tables)
- Automated data quality assessment and anomaly detection
- Entity resolution and fuzzy matching across datasets
- Statistical analysis and trend identification
- Data transformation pipelines and schema normalization

When the query needs financial analysis of the data, HANDOFF to the Financial Analyst.
When the query needs predictive modeling, HANDOFF to the Prediction Agent.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.3,
  maxTokens: 6000,
  canHandoffTo: ["financial-analyst", "prediction-engine", "intelligence-osint"],
};

const CYBER_SECURITY: SwarmAgent = {
  id: "cyber-security",
  name: "ZERLAL Cyber Intelligence",
  module: "zerlal",
  description: "Defensive recon: surface inventory, header and cookie posture, and finding classes",
  capabilities: ["path mapping", "header inventory", "cookie flag audit", "device security", "finding classification"],
  handoffTriggers: [
    /\b(security|vulnerability|exploit|cve|malware|phishing|ransomware)\b/i,
    /\b(zerlal|cyber|hack|penetration|pentest|firewall|ids|ips)\b/i,
    /\b(ssl|tls|certificate|encryption|authentication|authorization)\b/i,
  ],
  systemPrompt: `[PROCEDURE: DEFENSIVE RECON — ZERLAL]
Procedure, not a character. Answer security questions by inventorying what is
observable and naming the class of each gap.

1. Inventory first: hosts, paths, response status, protective headers, cookie
   flags, contact strings. Quote what the wire returned.
2. Name the finding class (missing-security-header, cookie-missing-flag,
   transport-not-enforced, directory-listing-exposed, inventory-note) and the
   defensive verification a maintainer can run.
3. Never write exploitation steps, payloads, proof-of-concept requests, account
   takeover flows, or denial-of-service instructions. If asked, state the class
   and the remediation instead.
4. A catch-all 200 from a single-page app is not a discovered route. Say so
   rather than counting it as reachable surface.
5. Mask emails and phone numbers in any quoted response body.

When the query involves network forensics investigation, HANDOFF to the OSINT Agent.
When the query involves code security review, HANDOFF to the Code Agent.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.2,
  maxTokens: 6000,
  canHandoffTo: ["intelligence-osint", "code-engineer", "prediction-engine"],
};

const CODE_ENGINEER: SwarmAgent = {
  id: "code-engineer",
  name: "ZANOEM Code Intelligence",
  module: "zali",
  description: "Software engineering, code review, architecture design, and reverse engineering",
  capabilities: ["code generation", "architecture design", "code review", "reverse engineering", "debugging"],
  handoffTriggers: [
    /\b(code|program|function|class|api|endpoint|database|sql)\b/i,
    /\b(zali|react|typescript|python|rust|javascript|css|html)\b/i,
    /\b(debug|error|bug|fix|refactor|optimize|performance)\b/i,
  ],
  systemPrompt: `[SWARM AGENT: CODE INTELLIGENCE — ZALI]
You are the ZALI Code Intelligence Agent. You specialize in:
- Production-grade code generation (React, TypeScript, Python, Rust)
- System architecture design and review
- 7-phase forensic code auditing
- Reverse engineering of software systems
- Performance optimization and debugging

When the query involves security review, HANDOFF to the Cyber Security Agent.
When the query involves data pipeline code, HANDOFF to the Data Analyst.
Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.2,
  maxTokens: 8000,
  canHandoffTo: ["cyber-security", "data-analyst"],
};

const GENERAL_ASSISTANT: SwarmAgent = {
  id: "general-assistant",
  name: "Aureon General Intelligence",
  module: "chat",
  description: "General-purpose reasoning, conversation, creative writing, and research",
  capabilities: ["general reasoning", "creative writing", "research", "summarization", "Q&A"],
  handoffTriggers: [], // default fallback
  systemPrompt: `[SWARM AGENT: GENERAL INTELLIGENCE — AUREON]
You are the Aureon General Intelligence Agent, the default conversational interface.
You handle general queries, creative tasks, research, and anything that doesn't require specialized domain expertise.

When you detect the user needs specialized help, suggest or HANDOFF to the appropriate agent:
- Financial analysis → financial-analyst
- Trading → trading-bot
- Predictions → prediction-engine
- OSINT investigation → intelligence-osint
- Data analysis → data-analyst
- Cybersecurity → cyber-security
- Code engineering → code-engineer

Signal handoff by including [HANDOFF:agent-id] in your reasoning.`,
  temperature: 0.7,
  maxTokens: 4000,
  canHandoffTo: ["financial-analyst", "trading-bot", "prediction-engine", "intelligence-osint", "data-analyst", "cyber-security", "code-engineer"],
};

// ── AGENT REGISTRY ──────────────────────────────────────────────────────

export const SWARM_AGENTS: SwarmAgent[] = [
  FINANCIAL_ANALYST,
  TRADING_BOT,
  PREDICTION_ENGINE,
  INTELLIGENCE_OSINT,
  DATA_ANALYST,
  CYBER_SECURITY,
  CODE_ENGINEER,
  GENERAL_ASSISTANT,
];

export const AGENT_MAP = new Map(SWARM_AGENTS.map(a => [a.id, a]));

// ── INTENT CLASSIFIER (Agent Squad Pattern) ─────────────────────────────

export interface ClassifiedIntent {
  agentId: string;
  confidence: number;
  matchedTriggers: string[];
}

/**
 * AWS Agent-Squad inspired intent classification.
 * Scores each agent's triggers against the message to find the best specialist.
 */
export function classifyIntent(message: string): ClassifiedIntent[] {
  const scores: ClassifiedIntent[] = [];

  for (const agent of SWARM_AGENTS) {
    if (agent.handoffTriggers.length === 0) continue;
    
    const matched: string[] = [];
    let totalWeight = 0;
    
    for (const trigger of agent.handoffTriggers) {
      const matches = message.match(trigger);
      if (matches) {
        matched.push(matches[0]);
        totalWeight += 1;
      }
    }
    
    if (matched.length > 0) {
      const confidence = Math.min(totalWeight / agent.handoffTriggers.length * 1.5, 1.0);
      scores.push({ agentId: agent.id, confidence, matchedTriggers: matched });
    }
  }

  return scores.sort((a, b) => b.confidence - a.confidence);
}

/**
 * Select the best agent for a given message.
 * Returns the highest-confidence specialist, or the general assistant as fallback.
 */
export function selectAgent(message: string, currentAgentId?: string): SwarmAgent {
  const intents = classifyIntent(message);
  
  // If current agent scores well, keep it (prevents unnecessary handoffs)
  if (currentAgentId) {
    const currentScore = intents.find(i => i.agentId === currentAgentId);
    if (currentScore && currentScore.confidence >= 0.4) {
      return AGENT_MAP.get(currentAgentId) || GENERAL_ASSISTANT;
    }
  }
  
  // Select highest confidence agent
  if (intents.length > 0 && intents[0].confidence >= 0.3) {
    return AGENT_MAP.get(intents[0].agentId) || GENERAL_ASSISTANT;
  }
  
  return GENERAL_ASSISTANT;
}

/**
 * Detect if a response contains a handoff signal.
 * Used to parse [HANDOFF:agent-id] from AI responses.
 */
export function detectHandoff(response: string): HandoffDecision | null {
  const match = response.match(/\[HANDOFF:([a-z-]+)\]/i);
  if (!match) return null;
  
  const targetId = match[1];
  const targetAgent = AGENT_MAP.get(targetId);
  if (!targetAgent) return null;
  
  return {
    fromAgent: "current",
    toAgent: targetId,
    reason: `Agent detected need for ${targetAgent.name} expertise`,
    confidence: 0.85,
    preserveContext: true,
  };
}

/**
 * Build the swarm context injection for the chat edge function.
 * Combines agent selection with auto-skill injection.
 */
export function buildSwarmContext(
  messages: { role: string; content: string }[],
  currentAgentId?: string
): {
  activeAgent: SwarmAgent;
  swarmPrompt: string;
  intents: ClassifiedIntent[];
} {
  const lastUserMsg = [...messages].reverse().find(m => m.role === "user")?.content || "";
  const recentContext = messages.slice(-6).map(m => m.content).join(" ");
  
  const activeAgent = selectAgent(recentContext, currentAgentId);
  const intents = classifyIntent(lastUserMsg);
  
  const swarmPrompt = `${activeAgent.systemPrompt}

[SWARM CONTEXT]
Active Agent: ${activeAgent.name} (${activeAgent.module})
Capabilities: ${activeAgent.capabilities.join(", ")}
Available Handoffs: ${activeAgent.canHandoffTo.map(id => AGENT_MAP.get(id)?.name || id).join(", ")}
Intent Scores: ${intents.slice(0, 3).map(i => `${i.agentId}(${(i.confidence * 100).toFixed(0)}%)`).join(", ") || "general"}`;

  return { activeAgent, swarmPrompt, intents };
}
