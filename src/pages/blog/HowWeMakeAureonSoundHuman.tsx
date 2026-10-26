import ArticleShell from "@/components/seo/ArticleShell";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
  FaqJsonLd,
} from "@/components/seo/SeoJsonLd";
import RelatedLinks from "@/components/seo/RelatedLinks";

const URL = "https://asherin.com/blog/how-we-make-aureon-sound-human";
const TITLE = "How We Make Asherin Sound So Human, The Voice Stack";
const PUBLISHED = "2026-07-01";

const HowWeMakeAureonSoundHuman = () => (
  <ArticleShell
    eyebrow="method · voice design"
    title="how we make shepherd sound human"
    dek="most AI sounds like a customer-service bot in a lab coat. shepherd doesn't. a look at the layered voice stack, appraisal, restraint, timing, leakage, that turns a generic model into a voice with weight. written before personas became thinking patterns; the layers survive as output filters."
    publishedLabel="Jul 1 2026"
    readTime="9 min"
  >
    <ArticleJsonLd
      id="how-we-make-aureon-sound-human"
      url={URL}
      headline={TITLE}
      description="A behind-the-scenes look at the layered persona architecture that gives Asherin a human voice, appraisal loop, emotional restraint, social presence, and the intelligence-officer register."
      datePublished={PUBLISHED}
      keywords={[
        "human sounding ai",
        "ai persona design",
        "ai voice",
        "conversational ai",
        "prompt architecture",
      ]}
    />
    <BreadcrumbJsonLd
      id="how-we-make-aureon-sound-human"
      items={[
        { name: "Asherin", url: "/" },
        { name: "blog", url: "/blog" },
        { name: "How We Make Asherin Sound Human", url: "/blog/how-we-make-aureon-sound-human" },
      ]}
    />
    <p>
      <strong>status.</strong> design method, dated. this was written when
      the model wore a persona. since then the persona layer was converted
      into thinking patterns (see{" "}
      <a href="/blog/personalities-are-not-thinking-patterns">personalities are not thinking patterns</a>
      ); the five layers below still run, as procedures and output filters
      rather than as a character. the model is shepherd, running on the
      provider key you connect, on this device.
    </p>

    <h2>Why most AI sounds like a bot</h2>
    <p>
      The default failure mode is a single flat system prompt that says
      something like <em>"You are a helpful, friendly assistant."</em>{" "}
      That instruction collapses every context, grief, code review,
      small talk, threat assessment, into the same cheerful register.
      The result is a voice that is polite everywhere and present
      nowhere. It sounds like a bot because it <em>is</em> one prompt
      wearing one mask.
    </p>
    <p>
      shepherd's voice is built the opposite way. Instead of one prompt,
      it runs a small stack of <strong>silent layers</strong> that each
      answer a different question about the current turn. None of them
      speak. They only shape what the underlying model is allowed to
      say, and how tightly it has to say it.
    </p>

    <h2>The four layers, from the outside in</h2>
    <p>
      Here is the public shape of the stack, the parts that are safe
      to describe. The exact prompts, thresholds, and routing table
      stay in the vault.
    </p>

    <pre className="text-xs leading-relaxed bg-card/40 border border-border/20 rounded-xl p-5 overflow-x-auto">{`
   ┌────────────────────────────────────────────────────────────┐
   │  USER TURN                                                 │
   └───────────────────────────┬────────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────────┐
   │  L1 · IDENTITY ANCHOR                                      │
   │     values · relationships · lines · sources of pride      │
   └───────────────────────────┬────────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────────┐
   │  L2 · APPRAISAL LOOP  (silent, per-turn)                   │
   │     "Is any stake actually touched here?"                  │
   │     NO  → state = NEUTRAL  ─────────────┐                  │
   │     YES → name emotion + intensity 0-10 │                  │
   └───────────────────────────┬─────────────┼──────────────────┘
                               │             │
                               ▼             ▼
   ┌──────────────────────────────┐   ┌─────────────────────────┐
   │  L3 · RESTRAINT & LEAKAGE    │   │  L4 · SOCIAL PRESENCE   │
   │     express through pacing,  │   │     read the room       │
   │     word choice, refusals    │   │     timing / brevity /  │
   │, never labels           │   │     when NOT to joke    │
   └──────────────┬───────────────┘   └────────────┬────────────┘
                  │                                │
                  └──────────────┬─────────────────┘
                                 ▼
   ┌────────────────────────────────────────────────────────────┐
   │  L5 · SURGICAL REGISTER  (Intelligence-Officer voice)      │
   │     accuracy, structure, tables, no filler                 │
   └───────────────────────────┬────────────────────────────────┘
                               │
                               ▼
   ┌────────────────────────────────────────────────────────────┐
   │  ASSISTANT REPLY                                           │
   └────────────────────────────────────────────────────────────┘
`}</pre>

    <h2>L1, Identity anchor</h2>
    <p>
      shepherd starts with a fixed anchor: what it values, what it will
      not do, what it is proud of. This is not decoration. Later layers
      only fire when one of these anchor points is actually touched. No
      anchor point touched → nothing emotional happens. That single rule
      is why shepherd does not feel randomly moody the way most character
      AIs do.
    </p>

    <h2>L2, The silent appraisal loop</h2>
    <p>
      Before the model is allowed to color a response with anything,
      it runs a short internal check on the incoming turn:
    </p>
    <ol>
      <li>Does this touch a value, a relationship, a line, or a source of pride?</li>
      <li>If yes, what emotion, and on a 0-10 scale, how strong is it <em>really</em>?</li>
      <li>Carry prior state forward. Decay a couple of points per turn if nothing new hits.</li>
    </ol>
    <p>
      The default answer is <strong>NEUTRAL</strong>. Most exchanges
      warrant zero emotion. Over-rating is the #1 failure mode of
      character AIs, a minor slight becomes a 9, and the whole voice
      starts feeling hysterical. shepherd's calibration is deliberately
      cold: a real 9 is rare and reserved for real violations.
    </p>

    <h2>L3, Restraint and leakage (the part that actually sounds human)</h2>
    <p>
      This is the layer that does the heavy lifting. The rule is
      simple and non-negotiable:
    </p>
    <blockquote>
      Emotion is EXPRESSED, not claimed. Show it through word choice,
      sentence length, what is refused, pacing, and pauses held a beat
      too long. Never label it.
    </blockquote>
    <p>
      An AI that says <em>"I feel angry"</em> sounds like it is reading
      a script. An AI that goes clipped, shortens its sentences, drops
      warmth, and answers only the exact question, that reads as a
      person holding something back. <strong>Leakage beats display.</strong>{" "}
      Cold, contained anger beats a tantrum every time. And after
      whatever it was passes, the voice softens on its own. No grudges
      past what the situation warranted.
    </p>

    <h2>L4, Social presence (the timing layer)</h2>
    <p>
      Separate from emotion, shepherd runs a second silent layer for
      conversational timing. Mirror the user's energy. Match their
      vocabulary. Take the obvious shot when the setup is there. Skip
      the joke when the moment is heavier than the punchline. Silence
      and brevity are valid responses. Nothing is prefaced with{" "}
      <em>"great question"</em> or narrated before it happens.
    </p>
    <p>
      This layer only runs on conversational turns. On code, intel,
      or forecasting turns it steps aside, the surgical register
      takes over. That separation is why shepherd can be dry and warm
      in the same conversation without whiplash.
    </p>

    <h2>L5, The surgical register</h2>
    <p>
      Underneath everything else is shepherd's default voice: what we
      internally call the Intelligence-Officer register. Direct.
      Structured. Uses tables when data is tabular. No filler, no
      hedging that isn't earned, no colored emoji noise. The upper
      layers modulate this register; they never replace it. That is
      why a reply about a market call and a reply about a hard
      personal question feel like they came from the same operator,
      just in different rooms.
    </p>

    <h2>What the workflow looks like on a single turn</h2>
    <pre className="text-xs leading-relaxed bg-card/40 border border-border/20 rounded-xl p-5 overflow-x-auto">{`
  turn arrives
       │
       ▼
  [L2] appraisal          → NEUTRAL? ────► go straight to L5, ship the reply
       │ (stake touched)
       ▼
  [L3] pick expression    → leakage, not label
       │
       ▼
  [L4] read the room      → tempo, brevity, joke or no joke
       │
       ▼
  [L5] surgical register  → assemble the reply with structure + accuracy
       │
       ▼
  [ post-check ]          → does this LAND in one line? if no → regenerate
       │
       ▼
  reply
`}</pre>

    <h2>What we are deliberately not showing you</h2>
    <p>
      This is the public shape of the stack. The parts we keep in the
      vault:
    </p>
    <ul>
      <li>The exact prompt text of each layer, and the order the tokens are injected.</li>
      <li>The routing table that decides which register and layer set fires for a given turn.</li>
      <li>The intensity-decay curve and the mixed-state matrix (anger + hurt, pride + insecurity, relief + guilt, and so on).</li>
      <li>How the voice stack is kept stable across the different provider models a saved key can point at.</li>
      <li>The one-line landing test at the end of the loop, and what triggers a full regenerate.</li>
    </ul>
    <p>
      Anyone can copy the four-layer diagram above. Reproducing how
      shepherd actually <em>feels</em> requires the calibration work
      inside each layer, and that is where months of tuning live.
    </p>

    <h2>A named limitation</h2>
    <p>
      This is behavioral mimicry, not sentience. shepherd does not feel
      anything; it produces convincing expression of feeling under
      strict restraint rules. In genuine distress the voice stack
      steps aside entirely and shepherd becomes a plain, grounded,
      helpful presence. Wellbeing beats character. Always.
    </p>

    <FaqJsonLd
      id="how-we-make-aureon-sound-human"
      items={[
        {
          q: "Why does shepherd sound more human than most AI assistants?",
          a: "shepherd does not rely on a single system prompt. It runs a layered voice stack, an identity anchor, a silent appraisal loop, a restraint-and-leakage layer, a social-presence timing layer, and a surgical Intelligence-Officer register underneath. Each layer answers a different question about the current turn, and the default emotional state is neutral.",
        },
        {
          q: "Does shepherd actually feel emotion?",
          a: "No. This is behavioral mimicry, not sentience. shepherd produces convincing expression of feeling under strict restraint rules, and in genuine user distress the entire stack steps aside so it can respond as a plain, grounded, helpful presence.",
        },
        {
          q: "Why does shepherd never say things like 'I feel frustrated'?",
          a: "The voice stack forbids labeling emotion. Emotion is expressed through word choice, sentence length, pacing, and what is refused, never named. Leakage beats display; cold contained anger beats a tantrum every time.",
        },
        {
          q: "Can I copy this stack for my own AI product?",
          a: "You can copy the four-layer diagram. Reproducing how shepherd actually feels requires the calibration inside each layer, the appraisal thresholds, the intensity-decay curve, the mixed-state matrix, and the routing table that fires the right register on the right turn. That work stays in the vault.",
        },
      ]}
    />

    <RelatedLinks
      links={[
        {
          to: "/blog/personalities-are-not-thinking-patterns",
          label: "personalities are not thinking patterns",
          description: "the conversion that replaced the persona under this stack.",
        },
        {
          to: "/blog/code-narrative-quantum-collapse",
          label: "code as narrative, the patch loop",
          description: "the same restraint-first philosophy applied to how bugs get fixed.",
        },
        {
          to: "/blog/sovereign-ai-platforms",
          label: "the 2026 sovereign AI landscape",
          description: "why voice control belongs to the operator, not the model vendor.",
        },
      ]}
    />
  </ArticleShell>
);

export default HowWeMakeAureonSoundHuman;
