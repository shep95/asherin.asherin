import { Check, Settings } from "lucide-react";

const categoryLabels: Record<string, string> = {
  cicd: "CI/CD",
  issues: "Issue Tracking",
  comms: "Communication",
  identity: "Identity & SSO",
  siem: "SIEM & Monitoring",
  compliance: "Compliance",
};

const integrations = [
  { id: "github-actions", name: "GitHub Actions", category: "cicd", icon: "◈", connected: false },
  { id: "gitlab-ci", name: "GitLab CI", category: "cicd", icon: "◈", connected: false },
  { id: "jenkins", name: "Jenkins", category: "cicd", icon: "◈", connected: false },
  { id: "circleci", name: "CircleCI", category: "cicd", icon: "◈", connected: false },
  { id: "azure-devops", name: "Azure DevOps", category: "cicd", icon: "◈", connected: false },
  { id: "jira", name: "JIRA", category: "issues", icon: "◉", connected: false },
  { id: "linear", name: "Linear", category: "issues", icon: "◉", connected: false },
  { id: "github-issues", name: "GitHub Issues", category: "issues", icon: "◉", connected: false },
  { id: "shortcut", name: "Shortcut", category: "issues", icon: "◉", connected: false },
  { id: "slack", name: "Slack", category: "comms", icon: "◎", connected: false },
  { id: "teams", name: "Microsoft Teams", category: "comms", icon: "◎", connected: false },
  { id: "pagerduty", name: "PagerDuty", category: "comms", icon: "◎", connected: false },
  { id: "okta", name: "Okta", category: "identity", icon: "◈", connected: false },
  { id: "azure-ad", name: "Azure AD", category: "identity", icon: "◈", connected: false },
  { id: "google-workspace", name: "Google Workspace", category: "identity", icon: "◈", connected: false },
  { id: "splunk", name: "Splunk", category: "siem", icon: "◉", connected: false },
  { id: "datadog", name: "Datadog", category: "siem", icon: "◉", connected: false },
  { id: "elastic", name: "Elastic / ELK", category: "siem", icon: "◉", connected: false },
  { id: "drata", name: "Drata", category: "compliance", icon: "◎", connected: false },
  { id: "vanta", name: "Vanta", category: "compliance", icon: "◎", connected: false },
  { id: "secureframe", name: "Secureframe", category: "compliance", icon: "◎", connected: false },
];

const categoryOrder = ["cicd", "issues", "comms", "identity", "siem", "compliance"];

const IntegrationsScreen = () => {
  const grouped = categoryOrder.map((cat) => ({
    category: cat,
    label: categoryLabels[cat],
    items: integrations.filter((i) => i.category === cat),
  }));

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="p-6 max-w-[1000px] mx-auto space-y-6">
        <div>
          <h2 className="text-sm font-light tracking-[0.1em] text-foreground/80 uppercase">Integrations</h2>
          <p className="text-[10px] text-muted-foreground/35 mt-0.5">Connect your security workflow to existing tools</p>
        </div>
        {grouped.map((group) => (
          <div key={group.category} className="space-y-3">
            <h3 className="text-[10px] text-muted-foreground/40 uppercase tracking-wider">{group.label}</h3>
            <div className="grid grid-cols-3 gap-3">
              {group.items.map((item) => (
                <div key={item.id} className="rounded-xl border border-border/[0.06] bg-card/20 backdrop-blur-sm p-4 flex items-center justify-between hover:bg-foreground/[0.01] transition-colors">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-lg bg-foreground/[0.03] border border-border/[0.06] flex items-center justify-center text-[12px] text-foreground/30">{item.icon}</div>
                    <div>
                      <div className="text-[10px] text-foreground/50">{item.name}</div>
                      <span className="text-[8px] text-muted-foreground/25">Not connected</span>
                    </div>
                  </div>
                  <button className="p-1.5 text-muted-foreground/20 hover:text-foreground/40 transition-colors"><Settings className="h-3 w-3" /></button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default IntegrationsScreen;
