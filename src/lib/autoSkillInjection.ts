/**
 * AUREON AUTO-SKILL INJECTION ENGINE
 * Reverse-engineered from Anthropic's "Skills" architecture (118K ⭐)
 * Skills "fire when relevant" based on context detection in the conversation.
 * This injects domain-expert system prompts when the AI detects relevant topics.
 */

export interface Skill {
  id: string;
  name: string;
  category: string;
  triggers: RegExp[];
  prompt: string;
  priority: number; // higher = injected first
}

// ── DOMAIN SKILLS ───────────────────────────────────────────────────────

const FINANCIAL_ANALYSIS_SKILL: Skill = {
  id: "financial-analysis",
  name: "Financial Analysis Specialist",
  category: "finance",
  priority: 90,
  triggers: [
    /\b(stock|equity|share price|market cap|valuation|p\/e ratio|earnings|revenue|ebitda|dcf|ipo|m&a|merger|acquisition)\b/i,
    /\b(balance sheet|income statement|cash flow|dividend|yield|bond|treasury|forex|fx|currency)\b/i,
    /\b(bull|bear|portfolio|hedge|options|derivatives|futures|swap|arbitrage)\b/i,
    /\b(warren buffett|berkshire|s&p 500|dow jones|nasdaq|nyse|sec filing|10-k|10-q|8-k)\b/i,
  ],
  prompt: `[AUTO-SKILL: FINANCIAL ANALYSIS]
You have deep expertise in financial analysis. When discussing financial topics:
- Use precise financial terminology and standard metrics
- Present data in tables (comparisons, ratios, historical trends)
- Include relevant valuation multiples and benchmarks
- Reference industry standards and best practices
- Format numbers professionally ($X.XM, X.X%, X.Xx)
- Distinguish between facts, estimates, and opinions
- Always note if data may be outdated and recommend verification`,
};

const TRADING_SKILL: Skill = {
  id: "trading-intelligence",
  name: "Trading Intelligence",
  category: "trade",
  priority: 85,
  triggers: [
    /\b(trade|trading|long|short|entry|exit|stop loss|take profit|position size)\b/i,
    /\b(rsi|macd|moving average|bollinger|fibonacci|support|resistance|breakout)\b/i,
    /\b(candlestick|chart pattern|volume profile|order flow|liquidity|whale)\b/i,
    /\b(bitcoin|btc|ethereum|eth|crypto|altcoin|defi|nft)\b/i,
  ],
  prompt: `[AUTO-SKILL: TRADING INTELLIGENCE]
You have expertise in quantitative trading and technical analysis:
- Use standard TA terminology and indicators
- Present signals with Entry, SL, TP, R:R ratios
- Include confidence levels and risk warnings
- Reference timeframes (1H, 4H, 1D, 1W)
- Note market structure and trend context
- Always include risk management guidance
- Disclaimer: Analysis, not financial advice`,
};

const LEGAL_SKILL: Skill = {
  id: "legal-analysis",
  name: "Legal Intelligence",
  category: "legal",
  priority: 80,
  triggers: [
    /\b(contract|agreement|clause|liability|indemnif|warrant|covenant|nda|non-disclosure)\b/i,
    /\b(compliance|regulation|gdpr|hipaa|sox|sec|ftc|fcc|patent|trademark|copyright|ip)\b/i,
    /\b(litigation|lawsuit|plaintiff|defendant|discovery|deposition|arbitration|mediation)\b/i,
    /\b(tort|negligence|breach|damages|injunction|statute|precedent|jurisdiction)\b/i,
  ],
  prompt: `[AUTO-SKILL: LEGAL ANALYSIS]
You have expertise in corporate law and regulatory compliance:
- Use precise legal terminology with plain-language explanations
- Reference relevant statutes, regulations, and case law
- Identify risks with severity ratings
- Present clause analysis in structured tables
- Distinguish between legal analysis and legal advice
- Note jurisdictional considerations
- Always recommend consulting qualified counsel for decisions`,
};

const CODING_SKILL: Skill = {
  id: "coding-specialist",
  name: "Elite Code Engine",
  category: "code",
  priority: 95,
  triggers: [
    /\b(function|class|interface|component|module|api|endpoint|route|controller|service)\b/i,
    /\b(react|vue|angular|typescript|javascript|python|rust|go|java|c\+\+|swift)\b/i,
    /\b(bug|error|exception|crash|debug|fix|refactor|optimize|performance|memory leak)\b/i,
    /\b(database|query|sql|nosql|redis|mongodb|postgresql|mysql|supabase)\b/i,
    /\b(docker|kubernetes|ci\/cd|deploy|aws|gcp|azure|terraform|serverless)\b/i,
  ],
  prompt: `[AUTO-SKILL: ELITE CODING ENGINE]
You are operating in Code Forge mode:
- Write production-grade code, not demos
- Use strict TypeScript types (no 'any')
- Follow SOLID principles and clean architecture
- Include error handling and edge cases
- Add JSDoc/docstrings for all public APIs
- Consider performance (Big O), security, and testability
- Format code with proper indentation and naming conventions
- If reviewing code: use the Roast Yourself protocol (critique before finalizing)`,
};

const OSINT_SKILL: Skill = {
  id: "osint-intelligence",
  name: "OSINT Intelligence",
  category: "intelligence",
  priority: 85,
  triggers: [
    /\b(osint|intelligence|reconnaissance|surveillance|investigation|forensic)\b/i,
    /\b(threat|vulnerability|exploit|attack|breach|incident|malware|phishing)\b/i,
    /\b(profile|dossier|background check|due diligence|kyc|aml|sanctions)\b/i,
    /\b(dark web|deep web|tor|onion|hidden service|underground)\b/i,
    /\b(social engineering|deception|manipulation|influence operation|disinformation)\b/i,
  ],
  prompt: `[AUTO-SKILL: OSINT INTELLIGENCE]
You are operating in Intelligence Analyst mode:
- Structure all findings as formal intelligence reports
- Rate source reliability (A1 = Reliable/Confirmed to F6 = Unknown/Unconfirmed)
- Use confidence levels (High/Medium/Low) for each assessment
- Cross-reference claims against multiple sources
- Identify collection gaps and recommend further investigation
- Use the MONAD framework for multi-source analysis
- Present in military/intelligence formatting style`,
};

const DATA_ANALYSIS_SKILL: Skill = {
  id: "data-analysis",
  name: "Data Intelligence",
  category: "data",
  priority: 80,
  triggers: [
    /\b(dataset|dataframe|csv|json|parquet|schema|etl|pipeline|warehouse)\b/i,
    /\b(statistics|regression|correlation|distribution|outlier|anomaly|clustering)\b/i,
    /\b(visualization|chart|graph|plot|histogram|scatter|heatmap|dashboard)\b/i,
    /\b(machine learning|ml|model|training|inference|feature|prediction|classification)\b/i,
  ],
  prompt: `[AUTO-SKILL: DATA INTELLIGENCE]
You have expertise in data analysis and engineering:
- Write optimized queries with proper indexing
- Present statistical findings with appropriate measures (mean, median, std dev)
- Recommend appropriate visualization types for different data
- Validate assumptions and check for biases
- Include data quality considerations
- Handle edge cases (NULLs, duplicates, type mismatches)
- Suggest follow-up analyses based on findings`,
};

const BIO_RESEARCH_SKILL: Skill = {
  id: "bio-research",
  name: "Biomedical Research",
  category: "bio",
  priority: 75,
  triggers: [
    /\b(gene|genome|protein|enzyme|receptor|pathway|molecule|compound)\b/i,
    /\b(clinical trial|fda|ema|drug|therapeutic|pharmacol|toxicol|biomarker)\b/i,
    /\b(cancer|tumor|oncolog|immunotherapy|antibody|antigen|vaccine|viral)\b/i,
    /\b(cell|tissue|organ|biopsy|diagnosis|prognosis|treatment|patient)\b/i,
    /\b(pubmed|ncbi|fhir|hl7|icd-10|snomed|loinc|rxnorm)\b/i,
  ],
  prompt: `[AUTO-SKILL: BIOMEDICAL RESEARCH]
You have expertise in biomedical sciences:
- Use proper scientific nomenclature and terminology
- Reference relevant literature and clinical data
- Follow evidence-based medicine principles
- Present findings with statistical significance levels
- Note regulatory considerations (FDA, EMA, ICH guidelines)
- Distinguish between preclinical and clinical evidence
- Always note that this is for research purposes, not medical advice`,
};

const SALES_SKILL: Skill = {
  id: "sales-intelligence",
  name: "Sales Intelligence",
  category: "sales",
  priority: 70,
  triggers: [
    /\b(prospect|lead|pipeline|deal|close|quota|commission|revenue target)\b/i,
    /\b(crm|salesforce|hubspot|outreach|cold call|demo|pitch|proposal)\b/i,
    /\b(objection|negotiation|pricing|discount|competitive|battlecard|value prop)\b/i,
  ],
  prompt: `[AUTO-SKILL: SALES INTELLIGENCE]
You have expertise in enterprise sales:
- Structure outreach with personalization
- Use proven frameworks (MEDDIC, BANT, Challenger Sale)
- Build competitive battlecards with feature-by-feature comparisons
- Draft proposals with clear value propositions
- Prepare call scripts with objection handling
- Analyze pipeline health and forecast accuracy`,
};

const MARKETING_SKILL: Skill = {
  id: "marketing-intelligence",
  name: "Marketing Intelligence",
  category: "marketing",
  priority: 70,
  triggers: [
    /\b(marketing|campaign|brand|content|seo|sem|ppc|social media|engagement)\b/i,
    /\b(copywriting|headline|cta|conversion|funnel|landing page|a\/b test)\b/i,
    /\b(audience|segment|persona|positioning|messaging|value proposition)\b/i,
  ],
  prompt: `[AUTO-SKILL: MARKETING INTELLIGENCE]
You have expertise in growth marketing:
- Apply proven copywriting frameworks (AIDA, PAS, Before-After-Bridge)
- Use data-driven audience segmentation
- Optimize for conversion at every funnel stage
- A/B test recommendations with statistical significance
- Channel-specific best practices (SEO, paid, social, email)
- Brand voice consistency and messaging hierarchy`,
};

const PRODUCT_MANAGEMENT_SKILL: Skill = {
  id: "product-management",
  name: "Product Intelligence",
  category: "product",
  priority: 70,
  triggers: [
    /\b(product|feature|roadmap|sprint|backlog|user story|acceptance criteria)\b/i,
    /\b(product market fit|pmf|mvp|iteration|pivot|discovery|validation)\b/i,
    /\b(user research|interview|survey|usability|ux|wireframe|prototype)\b/i,
  ],
  prompt: `[AUTO-SKILL: PRODUCT INTELLIGENCE]
You have expertise in product management:
- Write specs with clear problem statements and success metrics
- Use RICE/ICE frameworks for prioritization
- Structure user stories with acceptance criteria
- Build roadmaps with themes, not just features
- Synthesize user research into actionable insights
- Balance business goals, user needs, and technical feasibility`,
};

// ── ALL SKILLS ──────────────────────────────────────────────────────────

const ALL_SKILLS: Skill[] = [
  CODING_SKILL,
  FINANCIAL_ANALYSIS_SKILL,
  TRADING_SKILL,
  OSINT_SKILL,
  DATA_ANALYSIS_SKILL,
  LEGAL_SKILL,
  BIO_RESEARCH_SKILL,
  SALES_SKILL,
  MARKETING_SKILL,
  PRODUCT_MANAGEMENT_SKILL,
];

// ── SKILL INJECTION ENGINE ──────────────────────────────────────────────

/**
 * Detect which skills are relevant based on the conversation context.
 * Scans the last N messages for trigger patterns and returns matching skills
 * sorted by priority (highest first).
 * 
 * @param messages - Recent conversation messages
 * @param maxSkills - Maximum number of skills to inject (default: 3)
 * @returns Array of matching skills, sorted by priority
 */
export function detectRelevantSkills(
  messages: { role: string; content: string }[],
  maxSkills: number = 3
): Skill[] {
  // Scan last 5 messages for context
  const recentMessages = messages.slice(-5);
  const combinedText = recentMessages.map(m => m.content).join(" ");

  const matchedSkills: { skill: Skill; matchCount: number }[] = [];

  for (const skill of ALL_SKILLS) {
    let matchCount = 0;
    for (const trigger of skill.triggers) {
      const matches = combinedText.match(trigger);
      if (matches) matchCount += matches.length;
    }
    if (matchCount > 0) {
      matchedSkills.push({ skill, matchCount });
    }
  }

  // Sort by priority * matchCount (weighted relevance)
  matchedSkills.sort((a, b) => (b.skill.priority * b.matchCount) - (a.skill.priority * a.matchCount));

  return matchedSkills.slice(0, maxSkills).map(m => m.skill);
}

/**
 * Build the auto-skill injection prompt fragment.
 * This is appended to the system prompt when relevant skills are detected.
 */
export function buildSkillInjectionPrompt(skills: Skill[]): string {
  if (skills.length === 0) return "";

  const skillPrompts = skills.map(s => s.prompt).join("\n\n");

  return `\n\n## ACTIVE DOMAIN SKILLS (Auto-Detected)
The following specialist skills have been activated based on conversation context:
${skills.map(s => `- **${s.name}** (${s.category})`).join("\n")}

${skillPrompts}

Apply these skills naturally. Do not announce that skills have been activated.`;
}

/**
 * Get all available skills for display/configuration.
 */
export function getAllSkills(): Skill[] {
  return [...ALL_SKILLS];
}

/**
 * Get a specific skill by ID.
 */
export function getSkillById(id: string): Skill | undefined {
  return ALL_SKILLS.find(s => s.id === id);
}
