import { useEffect } from "react";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { applySeoHead } from "@/lib/seoHead";

/**
 * Terms, local edition.
 *
 * Written to match what the software actually does: it runs in the browser
 * on the operator's device, calls the model provider the operator connected
 * with the operator's own key, and reaches public sources only when a room is
 * used. No accounts, no tiers, no server of ours, no certification claims.
 */
const TermsOfService = () => {
  const lastUpdated = "october 25, 2026";

  useEffect(() => {
    applySeoHead({
      title: "terms, asherin",
      description:
        "asherin terms: software that runs on your device, your own model key, acceptable use for research and sensor rooms, and no warranty beyond what the code does.",
      path: "/terms",
    });
  }, []);

  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-lg font-light tracking-wide lowercase text-foreground mb-3">{children}</h2>
  );

  return (
    <LandingBackground>
      <Header />

      <div className="relative z-10 px-6 pt-32 pb-24">
        <div className="mx-auto max-w-3xl">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-sm font-extralight tracking-wide text-muted-foreground hover:text-foreground transition-colors mb-12"
          >
            <ArrowLeft className="h-4 w-4" />
            back to home
          </Link>

          <div className="rounded-2xl border border-border/20 bg-card/30 backdrop-blur-md p-8 sm:p-12">
            <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide lowercase mb-2">terms</h1>
            <p className="text-sm font-extralight text-muted-foreground mb-12">last updated: {lastUpdated} · local edition</p>

            <div className="space-y-10 text-sm font-extralight leading-relaxed text-muted-foreground">
              <section>
                <H>1. what you are agreeing to</H>
                <p>
                  by using asherin ("the software"), published by Zorak Corp &amp; House Of Asher ("we", "us"), you agree to these
                  terms. if you do not agree, do not use it. if you use asherin for an organisation, you confirm you may bind it to
                  these terms.
                </p>
              </section>

              <section>
                <H>2. what asherin is</H>
                <p className="mb-3">
                  asherin is a workspace that runs in your browser on your device: a chat with shepherd, the ai inside it, and
                  the rooms behind the chat — asherin.search, asherin.adam, asherin.arvision, asherin.sentinel, asherin.defender,
                  asherin.cyber, asherin.google, asherin.extract, asherin.briefing, asherin.data, asherin.knowledge,
                  asherin.health, asherin.vedic, notebooks, pages, design, agents, whiteboard, snippets, library, projects, the
                  vault and guardian vault. which rooms exist may change.
                </p>
                <p>
                  there is no account, no subscription and no tier. asherin has no server of its own: it is served as static
                  files and keeps your data in the browser on your device. the free editor at noah.asherin.com and the data tool
                  at /asherin.acatalepsy are separate software under their own pages.
                </p>
              </section>

              <section>
                <H>3. your model key</H>
                <ul className="space-y-2 ml-4">
                  <li>→ shepherd answers through a model provider you connect with your own key, or through a local runtime on your machine. the request goes from your browser to that provider; we are not in the path.</li>
                  <li>→ you pay that provider under its terms. we add nothing and see nothing.</li>
                  <li>→ your key is stored sealed on this device and used only for requests you start. you can lock it behind a passphrase and remove it at any time.</li>
                </ul>
              </section>

              <section>
                <H>4. what the model says</H>
                <p>
                  shepherd generates text with a statistical model. it may be wrong, it may be incomplete, and it is not legal,
                  medical or financial advice. shepherd is built to show where something came from and to say when it does not
                  know; you still carry the responsibility for what you do with an answer.
                </p>
              </section>

              <section>
                <H>5. acceptable use</H>
                <p className="mb-3">you are responsible for your use of the software. you agree not to use asherin to:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ break a law that applies to you or to the person or property you are acting on.</li>
                  <li>→ stalk, harass, intimidate, dox or surveil a person without a lawful basis.</li>
                  <li>→ access accounts, networks, devices or premises you are not authorised to access.</li>
                  <li>→ record people where their consent is required and you do not have it.</li>
                  <li>→ redistribute the software or its outputs as a competing product under another name.</li>
                </ul>
              </section>

              <section>
                <H>6. research and reports on third parties</H>
                <p className="mb-3">
                  asherin.search, asherin.cyber, asherin.google and similar rooms assemble information from publicly reachable
                  sources and from records you supply. you agree that:
                </p>
                <ul className="space-y-2 ml-4">
                  <li>→ you have a lawful purpose for every subject you research and you carry the legal responsibility for it.</li>
                  <li>→ results are leads, not verified fact. every hit is stamped with its source; an unavailable source is reported as unavailable, never filled in.</li>
                  <li>→ asherin is not a consumer reporting agency and its output must not be used to decide employment, credit, housing, insurance or any other purpose regulated by consumer-reporting law.</li>
                  <li>→ source availability varies by place and provider and may change without notice.</li>
                </ul>
              </section>

              <section>
                <H>7. connected google account</H>
                <p>
                  if you connect a google account in asherin.google, the browser reads the scopes you approve directly from
                  google's apis and keeps what it reads on this device. the room says what it can and cannot reach. you can
                  revoke the connection in asherin or at google at any time.
                </p>
              </section>

              <section>
                <H>8. camera, microphone, location and sensors</H>
                <p className="mb-3">
                  asherin.arvision, asherin.sentinel, asherin.adam and asherin.defender use permissions your browser asks you
                  for. each works while its tab is open, on this device, and says plainly what a browser cannot do: a closed tab
                  records nothing, a browser cannot run in the background, and nothing is sent to an asherin server because there
                  is none.
                </p>
                <p>
                  these rooms are an assistive layer, not a guarantee of safety, and must never be treated as one.
                </p>
              </section>

              <section>
                <H>9. your content</H>
                <p>
                  what you write, upload and generate is yours. we claim no ownership of your prompts, outputs, files or code.
                  the asherin name, branding and software are the property of Zorak Corp &amp; House Of Asher.
                </p>
              </section>

              <section>
                <H>10. availability</H>
                <p>
                  the software depends on your browser, your device and the third-party model, map and data providers you reach
                  through it, any of which may change, rate-limit or withdraw service. rooms may be changed, replaced or removed.
                </p>
              </section>

              <section>
                <H>11. no warranty, limited liability</H>
                <p>
                  asherin is provided "as is" and "as available", without warranties of any kind to the fullest extent permitted
                  by law. Zorak Corp &amp; House Of Asher are not liable for indirect, incidental, special or consequential damages
                  arising from your use of the software, from a provider's output, or from research you conduct with it.
                </p>
              </section>

              <section>
                <H>12. indemnity</H>
                <p>
                  you agree to indemnify Zorak Corp &amp; House Of Asher against claims, damages and costs arising from your use
                  of the software in breach of these terms, including research you conduct on third parties and data you connect
                  without the right to do so.
                </p>
              </section>

              <section>
                <H>13. changes</H>
                <p>when these terms change, the date at the top changes with them. continued use after a change is acceptance of it.</p>
              </section>

              <section>
                <H>14. contact</H>
                <p>
                  see the{" "}
                  <Link to="/privacy" className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors">
                    privacy page
                  </Link>{" "}
                  or reach{" "}
                  <a
                    href="https://x.com/shep_newton"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline underline-offset-4 hover:text-foreground/80 transition-colors"
                  >
                    @shep_newton on X
                  </a>
                  .
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
