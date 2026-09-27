import { useEffect } from "react";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { applySeoHead } from "@/lib/seoHead";

/**
 * Terms of Service.
 *
 * Written to match what the platform actually does today: AI processing that
 * necessarily runs server-side and through model providers, connected Google
 * accounts, always-on device/network sentinels, open-source research tooling,
 * account access. Claims are kept
 * to behaviour the product genuinely implements — no certification, audit, or
 * regulatory-compliance promises are made here.
 */
const TermsOfService = () => {
  const lastUpdated = "August 8, 2026";

  useEffect(() => {
    applySeoHead({
      title: "Terms of Service, Asherin",
      description:
        "Asherin Terms of Service: account access, acceptable use, research and sentinel tooling rules, data handling, and the contract between operators and the platform.",
      path: "/terms",
    });
  }, []);

  return (
    <LandingBackground>

      <Header />

      <div className="relative z-10 px-6 pt-32 pb-24">
        <div className="mx-auto max-w-3xl">
          <Link to="/" className="inline-flex items-center gap-2 text-sm font-extralight tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-12">
            <ArrowLeft className="h-4 w-4" />
            Back to Home
          </Link>

          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-8 sm:p-12">
            <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide mb-2">Terms of Service</h1>
            <p className="text-sm font-extralight text-muted-foreground mb-12">Last updated: {lastUpdated}</p>

            <div className="space-y-10 text-sm font-extralight leading-relaxed text-muted-foreground">
              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">1. Acceptance of Terms</h2>
                <p>By accessing or using Asherin ("the Service"), operated by Zorak Corp &amp; House Of Asher ("we", "us"), you agree to be bound by these Terms of Service. If you do not agree, do not use the Service. If you use Asherin on behalf of an organisation, you confirm you are authorised to bind that organisation to these Terms.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">2. Service Description</h2>
                <p className="mb-3">Asherin is an AI intelligence platform. Depending on your tier it provides uncensored chat, a coding engine and in-dashboard IDE, live web search (Zophiel), persistent memory, notebooks and generators, workspace collaboration, and the rooms behind the chat, which may include asherin.search, asherin.eye, asherin.arvision, asherin.defender, asherin.sentinel, asherin.health, asherin.data, asherin.cyber, asherin.google, agents, knowledge, briefings and guardian vault. Which rooms exist may change.</p>
                <p className="mb-3">Certain modules operate on data you connect or on sensors you permit, including Google Cloud Intelligence (linked Google accounts and the devices signed into them), Asherin Maps, the Bluetooth / Area / Network Sentinels, Rideshare Guardian trip telemetry, and message intelligence over channels you authorise. These modules are described in Sections 6 through 9.</p>
                <p>A free Vedic Astrology module is available on the landing page without an account. New accounts receive a limited free trial period; trial access is a courtesy and may be changed or withdrawn.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">3. How Your Data Is Processed</h2>
                <p className="mb-3">Asherin is an AI service, so content you submit must be processed to produce a result. We state plainly how that works rather than implying otherwise:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ Prompts, uploads and connected-account content you route through a feature are transmitted to and processed by the AI model provider serving that request, and by search or data providers where a feature calls them.</li>
                  <li>→ Bring Your Own Key (BYOK) is supported across major model providers. When you supply your own key, requests are made with your key under that provider's own terms, and we apply no markup to your provider tokens.</li>
                  <li>→ Data is transmitted over TLS and stored in our managed cloud infrastructure with row-level access controls scoped to your account. Selected stores, including Guardian Vault material, use AES-256-GCM at rest.</li>
                  <li>→ We do not sell your data, share it with advertisers, or use your conversations to train our own models.</li>
                  <li>→ Access to stored content by our personnel is limited to what is necessary for support you request, abuse investigation, security incidents, or legal obligation.</li>
                  <li>→ Deleting your account removes the associated records from our production stores. Backups and legally required records age out on their own schedule.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">4. Uncensored Output Policy</h2>
                <p>Asherin does not apply corporate-filtered RLHF to sanitise outputs. Model responses are generated without editorial filtering, may be wrong, and are not professional, legal, medical or financial advice. You accept full responsibility for how you act on them. Uncensored output is not permission to break the law, and we still refuse and may block use that violates Section 5.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">5. Acceptable Use</h2>
                <p className="mb-3">You are solely responsible for your use of the Service. You agree not to use Asherin to:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ Break any law that applies to you or to the person or property you are acting on.</li>
                  <li>→ Stalk, harass, intimidate, dox or surveil a person without a lawful basis to do so.</li>
                  <li>→ Access accounts, networks, devices or premises you are not authorised to access.</li>
                  <li>→ Circumvent access controls, tier gating, rate limits, or regional pricing eligibility.</li>
                  <li>→ Resell, scrape or redistribute the Service or its outputs as a competing intelligence product.</li>
                </ul>
                <p className="mt-3">We may suspend or terminate accounts that breach this section.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">6. Research, OSINT and Reports on Third Parties</h2>
                <p className="mb-3">Search, NOMAD, Zophiel, contact intelligence, rideshare dossiers and similar modules assemble information from publicly reachable sources and from records you supply. You agree that:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ You have a lawful purpose for every subject you research and you carry the legal responsibility for that research.</li>
                  <li>→ Reports are investigative leads, not verified fact. Matching, photo corroboration and confidence grades are estimates and can be wrong or incomplete.</li>
                  <li>→ Asherin is not a consumer reporting agency, and its output must not be used to decide employment, credit, housing, insurance or any other purpose regulated by consumer-reporting law.</li>
                  <li>→ Source availability varies by jurisdiction and provider, and coverage may change or disappear without notice.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">7. Connected Accounts</h2>
                <p>Linking a Google account authorises Asherin to read the scopes you approve, which may include mail, calendar, contacts, Drive and Meet artefacts, and to generate dossiers, briefings and alerts from them. Devices signed in under a linked account may join your device mesh so you can see their status in one roster. You may revoke access at any time from your Asherin settings or your provider's account controls; revoking stops future collection but does not retroactively unmake reports already generated.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">8. Sentinels, Location and Device Telemetry</h2>
                <p className="mb-3">Safety modules are designed to run continuously once armed, because a threat does not wait for you to press a button. Where you grant the underlying permission, Asherin may, on a recurring basis:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ Read device location to place you on the map, score destination-area risk, and locate your own devices.</li>
                  <li>→ Scan for nearby Bluetooth identifiers to detect repeat-follower patterns, and log sightings to your account.</li>
                  <li>→ Assess the network you are connected to and report operator, egress and integrity findings.</li>
                  <li>→ Record trip telemetry, speed, route, harsh events, during rideshare journeys.</li>
                  <li>→ Report battery, link quality and presence in the background, including while the tab is closed, and send email or push alerts.</li>
                </ul>
                <p className="mt-3">Every one of these depends on a permission your browser or device asks you for, and each can be withdrawn there or disarmed in Asherin. Sentinels are an assistive layer, not a guarantee of safety, and must never be treated as a substitute for emergency services.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">9. Message and Communications Intelligence</h2>
                <p>Where you connect a message channel, for example a Google Voice number or an Android SMS bridge, Asherin reads those threads to identify senders and summarise intent. You confirm you are a party to those communications or otherwise permitted to process them, and that doing so is lawful where you and your correspondents are located. Recording and interception law differs by jurisdiction; that compliance is yours.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">10. Accounts and Access</h2>
                <ul className="space-y-2 ml-4">
                  <li>→ One account opens the chat and every room behind it: asherin.search, asherin.eye, asherin.arvision, asherin.defender, asherin.sentinel, asherin.health, asherin.data, asherin.cyber, asherin.knowledge, agents, snippets, extract, briefings and pages, plus library, projects, memory, guardian vault, whiteboard and a team workspace. You can export or delete your data at any time.</li>
                  <li>→ Bring your own model key and you pay that vendor for inference under that vendor's terms. Keys are stored encrypted and are only used for requests you start.</li>
                  <li>→ Message limits and fair-use ceilings exist so one account cannot exhaust the service for everyone else. They may change, and material changes are announced in-platform.</li>
                  <li>→ Enterprise terms, SSO / SAML, org policy controls and audit logs are available on request.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">11. Intellectual Property</h2>
                <p>Content you generate through Asherin is yours. We claim no ownership over your prompts, outputs or code. The Asherin name, branding and platform technology are the property of Zorak Corp &amp; House Of Asher. Outputs are generated by statistical models and may resemble other work; clearing your use of them is your responsibility.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">12. Service Availability</h2>
                <p>We strive for continuous uptime but do not guarantee uninterrupted access. Features depend on third-party model, search, mapping and data providers, any of which may rate-limit, degrade or withdraw service. Modules may be changed, replaced or retired as the platform evolves. We are not liable for loss resulting from downtime or provider failure.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">13. Limitation of Liability</h2>
                <p>Asherin is provided "as is" and "as available", without warranties of any kind to the fullest extent permitted by law. Zorak Corp &amp; House Of Asher shall not be liable for indirect, incidental, special or consequential damages arising from your use of the Service, including decisions made on AI-generated content, research output or sentinel alerts. Where liability cannot be excluded, it is limited to the amount you paid in the twelve months before the claim.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">14. Indemnity</h2>
                <p>You agree to indemnify Zorak Corp &amp; House Of Asher against claims, damages and costs arising from your use of the Service in breach of these Terms, including research you conduct on third parties and data you connect without the right to do so.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">15. Modifications</h2>
                <p>We may update these Terms at any time. Continued use after changes constitutes acceptance of the revised Terms. Material changes will be communicated through the platform.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">16. Contact</h2>
                <p>
                  For questions regarding these Terms, see our{" "}
                  <Link to="/privacy" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">Privacy Policy</Link>{" "}
                  or reach out via{" "}
                  <a href="https://x.com/shep_newton" target="_blank" rel="noopener noreferrer" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
                    @shep_newton on X
                  </a>.
                </p>
              </section>
            </div>
          </div>
        </div>
      </div>
    </LandingBackground>
  );
};

export default TermsOfService;
