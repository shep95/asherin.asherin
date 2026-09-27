import { useEffect } from "react";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { applySeoHead } from "@/lib/seoHead";

const PrivacyPolicy = () => {
  useEffect(() => {
    applySeoHead({
      title: "Privacy Policy, Asherin",
      description:
        "How Asherin collects, encrypts, and protects your data. Account-scoped encryption at rest, zero training on user content, and the operator-grade privacy stance.",
      path: "/privacy",
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
            <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide mb-2">Privacy Policy</h1>
            <p className="text-sm font-extralight text-muted-foreground mb-12">Last updated: February 14, 2026</p>

            <div className="space-y-10 text-sm font-extralight leading-relaxed text-muted-foreground">
              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">1. Data We Collect</h2>
                <p className="mb-3">We collect only what is necessary to operate the Service:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ <strong className="text-foreground/80">Account data:</strong> Email address and display name (provided at sign-up).</li>
                  <li>→ <strong className="text-foreground/80">Conversations:</strong> Prompts and AI-generated responses, stored encrypted at rest.</li>
                  <li>→ <strong className="text-foreground/80">Uploaded files:</strong> Documents you upload to your Library.</li>
                  <li>→ <strong className="text-foreground/80">Usage metadata:</strong> Prompt counts and session activity (no content).</li>
                  <li>→ <strong className="text-foreground/80">Memory entries:</strong> Facts you save for persistent context.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">2. Why We Collect It</h2>
                <ul className="space-y-2 ml-4">
                  <li>→ To provide, maintain, and improve the Service.</li>
                  <li>→ To persist your conversation history and memory across sessions.</li>
                  <li>→ We do <strong className="text-foreground/80">NOT</strong> use your data to train AI models.</li>
                  <li>→ We do <strong className="text-foreground/80">NOT</strong> sell your data to third parties.</li>
                  <li>→ We do <strong className="text-foreground/80">NOT</strong> share your data with advertisers.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">3. Data Retention</h2>
                <ul className="space-y-2 ml-4">
                  <li>→ <strong className="text-foreground/80">Active account:</strong> Data retained for the lifetime of your account.</li>
                  <li>→ <strong className="text-foreground/80">After deletion:</strong> All data permanently purged within 30 days.</li>
                  <li>→ <strong className="text-foreground/80">System logs:</strong> Retained for 90 days on a rolling basis, then deleted.</li>
                  <li>→ <strong className="text-foreground/80">Backups:</strong> Retained for 30 days, then purged.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">4. Third-Party Processors</h2>
                <p className="mb-3">We use the following third parties who may process your data under strict agreements:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ <strong className="text-foreground/80">Cloud infrastructure</strong>, Hosting and database (US-based servers).</li>
                </ul>
                <p className="mt-3">Each vendor operates under a Data Processing Agreement (DPA). No other third parties receive your data.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">5. Your Rights (GDPR & CCPA)</h2>
                <p className="mb-3">You have the following rights over your personal data:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ <strong className="text-foreground/80">Right of access:</strong> Download all your data in one click from Settings → Your Data Rights.</li>
                  <li>→ <strong className="text-foreground/80">Right to erasure:</strong> Delete your account and all associated data permanently from Settings.</li>
                  <li>→ <strong className="text-foreground/80">Right to rectification:</strong> Edit your profile, display name, and memory entries at any time.</li>
                  <li>→ <strong className="text-foreground/80">Right to portability:</strong> Data export is provided in machine-readable JSON format.</li>
                  <li>→ <strong className="text-foreground/80">Right to object:</strong> We do not process data for marketing. No marketing emails are sent without explicit consent.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">6. Encryption & Security</h2>
                <ul className="space-y-2 ml-4">
                  <li>→ All conversations are encrypted at rest using AES-256-GCM under a key scoped to your account. The wrapping secret stays server-side, so Asherin can decrypt on your behalf, this is not zero-knowledge end-to-end encryption, and we do not claim it is.</li>
                  <li>→ Keys are derived per-account via HKDF-SHA-256 and released only to sessions authenticated as the owner.</li>
                  <li>→ Data is encrypted in transit (TLS) and at rest.</li>
                  <li>→ All servers are hosted in the United States.</li>
                  <li>→ No Asherin employee can read your encrypted messages.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">7. Consent</h2>
                <ul className="space-y-2 ml-4">
                  <li>→ We do not send marketing emails.</li>
                  <li>→ Pre-ticked consent boxes are never used.</li>
                  <li>→ You may withdraw consent at any time by deleting your account.</li>
                </ul>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">8. Cookies</h2>
                <p>Asherin uses only essential session cookies required for authentication. We do not use tracking cookies, analytics cookies, or advertising cookies.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">9. Children's Privacy</h2>
                <p>The Service is not intended for users under the age of 13. We do not knowingly collect data from children. If we discover that a child has created an account, it will be deleted immediately.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">10. Changes to This Policy</h2>
                <p>We may update this Privacy Policy from time to time. Material changes will be communicated through the platform. Continued use after changes constitutes acceptance.</p>
              </section>

              <section>
                <h2 className="text-lg font-light tracking-wide text-foreground mb-3">11. Contact</h2>
                <p>
                  For privacy inquiries, data requests, or to exercise your rights, contact us via{" "}
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

export default PrivacyPolicy;
