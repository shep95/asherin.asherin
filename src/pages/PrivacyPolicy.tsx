import { useEffect } from "react";
import Header from "@/components/Header";
import LandingBackground from "@/components/LandingBackground";
import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { applySeoHead } from "@/lib/seoHead";

/**
 * Privacy, local edition.
 *
 * Every claim here is something the code does. asherin has no accounts and no
 * server of its own: the workspace runs in the browser, data lives in the
 * browser's own storage on this device, and the only things that leave are
 * the requests the operator starts — to the model provider they connected,
 * and to the public sources a room names when it is used.
 */
const PrivacyPolicy = () => {
  useEffect(() => {
    applySeoHead({
      title: "privacy, asherin",
      description:
        "asherin runs on your device. no account, no server of its own, nothing sold, nothing trained on. what stays here, what leaves, and when.",
      path: "/privacy",
    });
  }, []);

  const H = ({ children }: { children: React.ReactNode }) => (
    <h2 className="text-lg font-light tracking-wide lowercase text-foreground mb-3">{children}</h2>
  );
  const K = ({ children }: { children: React.ReactNode }) => <strong className="font-normal text-foreground/80">{children}</strong>;

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
            <h1 className="text-3xl sm:text-4xl font-extralight tracking-wide lowercase mb-2">privacy</h1>
            <p className="text-sm font-extralight text-muted-foreground mb-12">last updated: october 25, 2026 · local edition</p>

            <div className="space-y-10 text-sm font-extralight leading-relaxed text-muted-foreground">
              <section>
                <H>1. the shape of it</H>
                <p className="mb-3">
                  asherin is software that runs in your browser, on your device. there is no account to create, no sign-in, and no
                  asherin server that holds your data. the page is served as static files; what you do in it stays in your
                  browser's own storage unless you send it somewhere yourself.
                </p>
                <p>
                  because there is no server, there is no one at asherin who can read your conversations, your files or your
                  keys. we do not collect usage data, run analytics, or set tracking cookies.
                </p>
              </section>

              <section>
                <H>2. what is kept on this device</H>
                <ul className="space-y-2 ml-4">
                  <li>→ <K>conversations</K> with shepherd, the files you add to the library and to projects, notebooks, snippets, pages, boards, briefings, agents, health records, vedic charts, and the vault of what shepherd has learned about you.</li>
                  <li>→ <K>model keys</K> you connect, in a key vault sealed by webcrypto under a key that never leaves the device. you can put a passphrase in front of it, lock it, and change or remove the passphrase at any time.</li>
                  <li>→ <K>the device trail</K>: the actions you took inside asherin, kept for you, readable in asherin.activity and guardian vault.</li>
                  <li>→ <K>appearance and preferences</K>, in the browser's local storage.</li>
                </ul>
                <p className="mt-3">
                  conversation text, sealed vault items, saved boards, and sentinel transcripts are encrypted at rest with
                  aes-gcm under a device key. other rows (titles, timestamps, library metadata, settings) are stored as plain rows
                  in the browser's indexeddb. guardian vault shows you exactly which stores are sealed and which are not.
                </p>
              </section>

              <section>
                <H>3. what leaves the device, and when</H>
                <p className="mb-3">nothing leaves on its own. a request goes out only when you start the action that needs it:</p>
                <ul className="space-y-2 ml-4">
                  <li>→ <K>the model provider you connected</K> receives the message you send, the context shepherd assembles for it (your conversation, attached files, project directions, the vault brief), and your key. that traffic is governed by that provider's own terms, not ours.</li>
                  <li>→ <K>a local runtime</K> (ollama, lm studio) receives the same, on your own machine, and nothing crosses the network.</li>
                  <li>→ <K>public sources a room names</K>, when you use that room: map tiles, terrain and earthquake feeds in asherin.adam; an address you typed, to a geocoder; weather for a place you chose; public indexes in asherin.search; a range of a password hash (never the password) in guardian vault's exposure check. each room says what it reaches before it reaches it.</li>
                  <li>→ <K>engine files</K> some rooms load from a content network the first time they run (a code editor, an on-device vision model, the ocr engine). these are downloads of software, not uploads of your data.</li>
                </ul>
                <p className="mt-3">
                  we do not sell anything, we do not share anything with advertisers, and nothing you do is used to train
                  asherin or anyone else.
                </p>
              </section>

              <section>
                <H>4. your control</H>
                <ul className="space-y-2 ml-4">
                  <li>→ <K>export</K> everything as json from settings → privacy &amp; data.</li>
                  <li>→ <K>forget</K> single memories, conversations, files and records inside each room.</li>
                  <li>→ <K>wipe this device</K> from settings → privacy &amp; data: the local database, the key vault and local storage are deleted in one step. there is no copy anywhere else to delete.</li>
                  <li>→ <K>lock</K> the key vault with a passphrase so a saved key cannot be used until you unlock it.</li>
                </ul>
              </section>

              <section>
                <H>5. permissions the browser asks for</H>
                <p>
                  camera (asherin.arvision), microphone (asherin.sentinel), location (asherin.adam, sentinel's environment
                  panel), bluetooth where the browser offers it. each is requested when you start the room that needs it and can
                  be withdrawn in the browser at any time. the rooms say plainly what they can and cannot do with a permission.
                </p>
              </section>

              <section>
                <H>6. children</H>
                <p>asherin is not intended for people under 13. there is no account to delete; wiping the device removes everything.</p>
              </section>

              <section>
                <H>7. changes</H>
                <p>when this page changes, the date at the top changes with it. the code is the authority: if a claim here and the software ever disagree, the software is wrong and we will fix it.</p>
              </section>

              <section>
                <H>8. contact</H>
                <p>
                  for privacy questions, reach{" "}
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

export default PrivacyPolicy;
