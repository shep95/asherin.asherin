/**
 * asherin.agents — pure transforms over what shepherd writes. no react, no
 * storage, no network: everything here is unit-tested in isolation.
 */

export interface WorkflowStep {
  n: number;
  label: string;
}

export type Trigger = { kind: "manual" } | { kind: "interval"; minutes: number };

export const MIN_INTERVAL_MINUTES = 5;
export const MAX_INTERVAL_MINUTES = 24 * 60;

/** the sentinel line that closes every build pass. */
export function parseStatus(text: string): "refining" | "complete" | null {
  const m = text.match(/STATUS:\s*(REFINING|COMPLETE|MISSION_COMPLETE)\b/i);
  if (!m) return null;
  return /COMPLETE/i.test(m[1]) ? "complete" : "refining";
}

/** the scope assessor answers READY or CLARIFY; anything else counts as ready. */
export function parseAssessor(text: string): { ready: true; restated: string } | { ready: false; questions: string[] } {
  const t = text.trim();
  if (/^READY\b/i.test(t)) {
    const rest = t.replace(/^READY\s*/i, "").trim();
    return { ready: true, restated: rest || "scope confirmed." };
  }
  if (/^CLARIFY\b/i.test(t)) {
    const questions = t
      .split("\n")
      .slice(1)
      .map((l) => l.replace(/^\s*\d+[.)]\s*/, "").trim())
      .filter(Boolean)
      .slice(0, 5);
    if (questions.length) return { ready: false, questions };
  }
  return { ready: true, restated: t.slice(0, 240) || "scope confirmed." };
}

function specLine(text: string, key: string): string | null {
  const re = new RegExp(`^\\s*[-*]?\\s*\\**${key}\\**\\s*:\\s*(.+)$`, "im");
  const m = text.match(re);
  if (!m) return null;
  return m[1].replace(/[`*]/g, "").trim();
}

/** "- name: release notes digest" → "release notes digest" */
export function parseSpecName(text: string): string | null {
  const v = specLine(text, "name");
  if (!v) return null;
  const clean = v.replace(/[<>]/g, "").trim().toLowerCase().slice(0, 48);
  return clean || null;
}

/** "- trigger: interval(30m)" → { kind: "interval", minutes: 30 }; anything else is manual. */
export function parseSpecTrigger(text: string): Trigger | null {
  const v = specLine(text, "trigger");
  if (!v) return null;
  const m = v.match(/interval\s*\(?\s*(\d+)\s*(m|min|minutes?|h|hours?)?\s*\)?/i);
  if (m) {
    const n = parseInt(m[1], 10);
    const unit = (m[2] || "m").toLowerCase();
    const minutes = unit.startsWith("h") ? n * 60 : n;
    return { kind: "interval", minutes: clampInterval(minutes) };
  }
  if (/manual|on demand|run now/i.test(v)) return { kind: "manual" };
  return { kind: "manual" };
}

export function clampInterval(minutes: number): number {
  if (!Number.isFinite(minutes)) return MIN_INTERVAL_MINUTES;
  return Math.max(MIN_INTERVAL_MINUTES, Math.min(MAX_INTERVAL_MINUTES, Math.round(minutes)));
}

/** "- needs outside this device: Slack api, GitHub token" → ["Slack api", "GitHub token"] */
export function parseNeeds(text: string): string[] {
  const v = specLine(text, "needs outside this device") ?? specLine(text, "secrets? required");
  if (!v) return [];
  if (/^(none|n\/?a|—|-|nothing)\b/i.test(v)) return [];
  return v
    .split(/[,;]| and /i)
    .map((s) => s.replace(/[<>]/g, "").trim())
    .filter((s) => s && s.length < 80)
    .slice(0, 12);
}

/** numbered lines under **WORKFLOW**, cut at the next heading. */
export function parseWorkflowSteps(text: string): WorkflowStep[] {
  if (!text) return [];
  const wf = text.match(/\*\*WORKFLOW\*\*([\s\S]*?)(?:\n\s*\*\*(?:CODE|TEST PLAN|AGENT SPEC)\*\*|$)/i);
  const block = wf ? wf[1] : text;
  const steps: WorkflowStep[] = [];
  const re = /^\s*(\d+)[.)]\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(block)) !== null) {
    const label = m[2].split(/\s[—–]\s|:\s|\s\|\s/)[0].replace(/[*`]/g, "").trim().slice(0, 80);
    if (label) steps.push({ n: parseInt(m[1], 10), label });
    if (steps.length >= 16) break;
  }
  return steps;
}

/** the first ```ts / ```typescript block; empty when there is none. */
export function extractCode(text: string): string {
  if (!text) return "";
  const m = text.match(/```(?:ts|typescript)\s*\n([\s\S]*?)```/i);
  if (m) return m[1].trim();
  const any = text.match(/```\w*\s*\n([\s\S]*?)```/);
  return any ? any[1].trim() : "";
}

/** the spec block alone, for the tab and the run prompt. */
export function extractSpec(text: string): string {
  const m = text.match(/\*\*AGENT SPEC\*\*([\s\S]*?)(?:\n\s*\*\*WORKFLOW\*\*|$)/i);
  return (m ? m[1] : "").trim();
}

/** a run reply: "step n · …" lines, then **OUTPUT** and the result. */
export function parseRunReply(text: string): { log: string[]; output: string } {
  const t = (text || "").trim();
  const idx = t.search(/\*\*OUTPUT\*\*/i);
  const head = idx >= 0 ? t.slice(0, idx) : t;
  const output = idx >= 0 ? t.slice(idx).replace(/^\*\*OUTPUT\*\*\s*:?\s*/i, "").trim() : "";
  const log = head
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^step\s+\d+/i.test(l))
    .map((l) => l.replace(/^\*+|\*+$/g, ""));
  return { log, output: output || (log.length ? "" : t) };
}

export function triggerLabel(t: Trigger): string {
  return t.kind === "manual" ? "run now" : `every ${t.minutes} min while open`;
}

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

export const TAB_CSP =
  "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; img-src data:; font-src data:";

/** every page shown in the published-tab frame carries a policy that forbids network. */
export function ensureCsp(html: string): string {
  if (/http-equiv\s*=\s*["']content-security-policy["']/i.test(html)) return html;
  const tag = `<meta http-equiv="Content-Security-Policy" content="${TAB_CSP}">`;
  if (/<head[^>]*>/i.test(html)) return html.replace(/<head[^>]*>/i, (m) => `${m}${tag}`);
  if (/<html[^>]*>/i.test(html)) return html.replace(/<html[^>]*>/i, (m) => `${m}<head>${tag}</head>`);
  return `${tag}${html}`;
}

/** the agent id a published page carries, so the frame knows which agent to run. */
export function readTabAgentId(html: string): string | null {
  const m = html.match(/<meta\s+name=["']zahten-agent["']\s+content=["']([^"']+)["']/i);
  return m ? m[1] : null;
}

export interface TabHtmlInput {
  agentId: string;
  name: string;
  objective: string;
  steps: WorkflowStep[];
  code: string;
  trigger: Trigger;
  needs: string[];
}

/** the default page for a published agent tab. self-contained; the only way out is postMessage to asherin. */
export function buildTabHtml(i: TabHtmlInput): string {
  const name = escapeHtml(i.name || "agent");
  const objective = escapeHtml(i.objective || "");
  const steps = i.steps.map((s) => `<li><span class="n">${String(s.n).padStart(2, "0")}</span>${escapeHtml(s.label)}</li>`).join("");
  const needs = i.needs.length ? `<p class="needs">needs outside this device: ${escapeHtml(i.needs.join(", "))}</p>` : "";
  const code = escapeHtml(i.code || "// no code in this build");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${TAB_CSP}">
<meta name="zahten-agent" content="${escapeHtml(i.agentId)}">
<title>${name}</title>
<style>
:root{color-scheme:dark}*{box-sizing:border-box}
body{margin:0;font-family:ui-sans-serif,system-ui,sans-serif;background:#0b0b0c;color:#e6e6e6;padding:20px 16px 32px;line-height:1.55;font-size:14px}
main{max-width:760px;margin:0 auto}
h1{font-weight:300;font-size:18px;margin:0 0 2px;letter-spacing:.02em}
.sub{font-size:11px;color:#8a8a8a;margin:0 0 18px}
.card{border:1px solid #232325;border-radius:12px;padding:14px 16px;margin-bottom:12px;background:#111113}
.label{font-size:10px;letter-spacing:.14em;color:#8a8a8a;margin-bottom:8px}
ol{margin:0;padding:0;list-style:none}ol li{padding:5px 0;border-bottom:1px solid #1d1d1f;font-size:13px;font-weight:300}ol li:last-child{border:0}
.n{display:inline-block;width:26px;color:#6a6a6a;font-family:ui-monospace,monospace;font-size:10px}
textarea{width:100%;min-height:88px;background:#0b0b0c;border:1px solid #2a2a2d;border-radius:8px;color:#e6e6e6;padding:10px;font:inherit;font-size:13px;resize:vertical}
button{margin-top:10px;background:#e6e6e6;color:#0b0b0c;border:0;border-radius:8px;padding:9px 14px;font:inherit;font-size:13px;cursor:pointer}
button[disabled]{opacity:.5;cursor:default}
pre{white-space:pre-wrap;word-break:break-word;background:#0b0b0c;border:1px solid #1d1d1f;border-radius:8px;padding:12px;font-size:12px;color:#d0d0d0;max-height:420px;overflow:auto;margin:0}
.needs{font-size:12px;color:#b89a5a;margin:10px 0 0}
.log{font-family:ui-monospace,monospace;font-size:11px;color:#9a9a9a;margin:0 0 8px;white-space:pre-wrap}
.state{font-size:12px;color:#8a8a8a;margin:8px 0 0}
.err{color:#e08f8f}
details summary{cursor:pointer;font-size:12px;color:#8a8a8a}
.runs li{display:flex;justify-content:space-between;gap:12px;font-family:ui-monospace,monospace;font-size:11px;color:#9a9a9a}
</style></head><body><main>
<h1>${name}</h1>
<p class="sub">an agent built in asherin.agents · runs on this device with shepherd · ${escapeHtml(triggerLabel(i.trigger))}</p>
<section class="card"><div class="label">purpose</div><p style="margin:0;font-weight:300">${objective}</p>${needs}</section>
${steps ? `<section class="card"><div class="label">workflow</div><ol>${steps}</ol></section>` : ""}
<section class="card"><div class="label">run now</div>
<textarea id="input" placeholder="paste the input this agent works on (optional)"></textarea>
<button id="run">run now</button>
<p class="state" id="state">press run now. shepherd follows the workflow on this device; nothing leaves it except the request to your model provider.</p>
</section>
<section class="card" id="result" hidden><div class="label">latest run</div><p class="log" id="log"></p><pre id="output"></pre></section>
<section class="card"><details><summary>recent runs</summary><ol class="runs" id="runs"></ol></details></section>
<section class="card"><details><summary>portable code (not executed here)</summary><pre style="margin-top:10px">${code}</pre></details></section>
</main>
<script>
(function(){
  var $=function(id){return document.getElementById(id)};
  var busy=false;
  function setState(t,err){var s=$("state");s.textContent=t;s.className="state"+(err?" err":"")}
  function show(run){
    if(!run)return;
    $("result").hidden=false;
    $("log").textContent=(run.log||[]).join("\\n");
    $("output").textContent=run.output||run.error||"";
  }
  function list(runs){
    var ol=$("runs");ol.innerHTML="";
    (runs||[]).slice(0,10).forEach(function(r){
      var li=document.createElement("li");
      var a=document.createElement("span");a.textContent=new Date(r.started_at).toLocaleString();
      var b=document.createElement("span");b.textContent=r.status;
      li.appendChild(a);li.appendChild(b);ol.appendChild(li);
    });
  }
  $("run").addEventListener("click",function(){
    if(busy)return;busy=true;$("run").disabled=true;setState("running…");
    parent.postMessage({type:"zahten:run",input:$("input").value},"*");
  });
  window.addEventListener("message",function(e){
    var d=e.data||{};
    if(d.type==="zahten:runs"){list(d.runs);if(d.runs&&d.runs[0])show(d.runs[0]);}
    if(d.type==="zahten:result"){busy=false;$("run").disabled=false;setState("done · "+new Date().toLocaleTimeString());show(d.run);list(d.runs);}
    if(d.type==="zahten:error"){busy=false;$("run").disabled=false;setState(d.message||"the run failed.",true);}
  });
  parent.postMessage({type:"zahten:ready"},"*");
})();
</script>
</body></html>`;
}
