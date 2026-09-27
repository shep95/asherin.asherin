import { useEffect } from "react";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { applySeoHead } from "@/lib/seoHead";

/**
 * Vulnerability disclosure policy. `/.well-known/security.txt` previously
 * pointed its `Policy:` field at the privacy policy, which says nothing about
 * how a researcher may test or report. This page is that missing document.
 */
const SecurityPolicy = () => {
  useEffect(() => {
    applySeoHead({
      title: "Security & Vulnerability Disclosure Policy, Asherin",
      description:
        "How to report a security vulnerability in Asherin: scope, rules of engagement, safe harbour, response targets, and the security@asherin.com reporting channel.",
      path: "/security-policy",
    });
  }, []);

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <section className="mb-10">
      <h2 className="mb-3 text-xl font-light tracking-wide text-foreground">{title}</h2>
      <div className="space-y-3 text-sm font-extralight leading-relaxed text-muted-foreground">{children}</div>
    </section>
  );

  return (
    <LandingBackground>
      <Header />

      <div className="relative z-10 px-6 pt-32 pb-24">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="mb-12 inline-flex items-center gap-2 text-sm font-extralight tracking-wide text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="rounded-2xl border border-border/20 bg-card/30 p-8 backdrop-blur-md sm:p-12">
            <h1 className="mb-2 text-3xl font-extralight tracking-wide text-foreground sm:text-4xl">
              Security &amp; Vulnerability Disclosure Policy
            </h1>
            <p className="mb-10 text-xs font-extralight uppercase tracking-[0.2em] text-muted-foreground">
              Last reviewed 13 August 2026
            </p>

            <Section title="Reporting channel">
              <p>
                Send findings to{" "}
                <a className="text-foreground underline underline-offset-4" href="mailto:security@asherin.com">
                  security@asherin.com
                </a>
                . Encrypt if you prefer; plain email is accepted. Include the affected URL or endpoint, the exact
                request, the observed response, and what an attacker gains. One issue per report.
              </p>
              <p>
                This channel is monitored for security reports only. Account, billing, and product questions sent here
                are not triaged as security.
              </p>
              <p>
                Honest limitation, checked 13 August 2026: mail delivery to that address depends on MX records on the
                asherin.com DNS zone, and that zone currently publishes no MX record. Until the operator adds one, mail
                sent to any @asherin.com address may bounce or fail silently. The address is the intended channel, not a
                verified inbox, this page will not claim otherwise. If you get no acknowledgement inside the 3 business
                days below, assume delivery failed rather than that the report was dismissed, and reach the operator
                through a public profile link in the site footer.
              </p>
            </Section>

            <Section title="Response targets">
              <p>Acknowledgement within 3 business days. Triage verdict and severity within 10 business days.</p>
              <p>
                Remediation is prioritised by impact: authentication bypass, cross-tenant data access, and remote code
                execution are treated as immediate; information disclosure and misconfiguration are scheduled.
              </p>
            </Section>

            <Section title="Scope">
              <p>
                In scope: <code>asherin.com</code>, <code>www.asherin.com</code>, the Asherin web application, and the
                Asherin backend API used by that application.
              </p>
              <p>
                Out of scope: third-party services Asherin integrates with, infrastructure operated by our hosting or
                model providers, unrelated domains, and reports generated solely by automated scanners without a
                demonstrated impact.
              </p>
            </Section>

            <Section title="Rules of engagement">
              <p>
                Test only against accounts you own or have explicit permission to use. Do not access, modify, exfiltrate,
                or retain another person's data, if you encounter it, stop, and say so in the report.
              </p>
              <p>
                No denial of service, no volumetric or brute-force traffic, no social engineering of staff or users, no
                physical attacks, and no spam or malware. Use a distinctive user agent so we can distinguish research
                from an incident.
              </p>
              <p>Give us reasonable time to remediate before any public write-up.</p>
            </Section>

            <Section title="Safe harbour">
              <p>
                Research conducted in good faith and within this policy is authorised. We will not pursue legal action
                or refer for prosecution against a researcher who follows these rules, and we will make that position
                known if a third party raises the matter.
              </p>
              <p>
                Authorisation does not extend to activity that violates the rules of engagement above, nor to systems
                outside the stated scope.
              </p>
            </Section>

            <Section title="Rewards">
              <p>
                Asherin does not currently operate a paid bounty programme. Valid reports receive public credit below on
                request, and material findings may receive a discretionary account credit.
              </p>
            </Section>

            <Section title="Known and accepted characteristics">
              <p>
                Self-registration is open by design, and both email and Google sign-in are enabled. Backend API error
                messages may reveal that an object name does not exist; row access itself is denied by policy. These are
                product decisions, not defects, and reports limited to them will be closed as informative.
              </p>
            </Section>

            <section id="acknowledgments" className="mb-2 scroll-mt-32">
              <h2 className="mb-3 text-xl font-light tracking-wide text-foreground">Acknowledgments</h2>
              <p className="text-sm font-extralight leading-relaxed text-muted-foreground">
                Researchers who have reported valid issues and asked for credit are listed here. No entries yet.
              </p>
            </section>
          </div>
        </div>
      </div>
    </LandingBackground>
  );
};

export default SecurityPolicy;
