room: chat with shepherd   view id: chat   files: src/pages/Dashboard.tsx (conversation state, send pipeline) · src/components/dashboard/ChatView.tsx · AdaptiveInputBar.tsx · ThinkingPanel.tsx · MessageQueuePanel.tsx · ConversationBranches.tsx · PromptEnhancerPanel.tsx · src/lib/ai.ts · src/lib/local/llm.ts · src/lib/local/prompts.ts · src/lib/local/prompt/shepherdBrain.ts · src/lib/messageQueue.ts · src/lib/intelligence/orchestrator.ts · src/lib/memory/vault.ts · src/lib/workspace/* · src/lib/chatCards/parseChatCards.ts · src/components/chatCards/*
narrative version: 1   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)

line anchors below were taken against `Dashboard.tsx` at 2 515 lines (another session was editing the file while this was written: the vault brief at ~l.1289–1296 and the distill call at ~l.1536–1541 appeared between two reads). where a line has drifted, the quoted text beside it is the anchor.

## purpose & promise

chat is the surface the rest of asherin sits behind: one conversation at a
time with shepherd, the model persona assembled on the device from
`shepherd.txt`, answered by whichever provider the operator connected,
called straight from the browser with a key that never leaves the vault.
the interface promises four things in its own words: "encrypted on this
device" (empty state and composer), "nothing leaves the browser unless you
send it to the model you connected" (`ChatView.tsx` l.743–747), a stop that
stops, and a queue that holds a message when the device is offline or
shepherd is still answering. the promise the copy does not make but the code
tries to keep: a turn also retrieves the operator's own memory and procedures
before the model sees anything, and learns from the answer afterwards
without blocking the reply.

## entry & navigation

- `/dashboard` is chat; every unknown or retired view collapses to it
  (`Dashboard.tsx` `resolveView` ~l.218, effect ~l.232). the `default` arm of
  `renderView` (~l.2149) renders `ChatView` when an active conversation
  exists, else the "welcome" card (~l.2186–2225). observed.
- the active conversation id is remembered in `localStorage
  aureon_active_conv_id` (~l.149, ~l.857) and the first run bootstraps one
  conversation titled "New conversation" (~l.715–748). observed.
- deep links into a message: `aureon:jump-to-message` (ChatView l.595)
  highlights and scrolls, retrying 20 × 120 ms while messages hydrate.
  observed.
- the landing page's ask box (`src/pages/Index.tsx` l.117–150, form l.237)
  does **not** hand a question into chat: it calls `streamChat` itself in
  research mode and renders the answer on the landing page. there is no
  handoff key, no prefill. the only path into the workspace from it is the
  error copy "open the dashboard and connect a model key". observed;
  contradicts the brief for this narrative, not the product copy.
- split panes: dragging a conversation from the sidebar onto `<main>` while
  chat is active opens two panes (~l.2362–2380, `SplitPaneManager`); up to
  four (`addSplitPane` ~l.382). observed.
- keyboard: ⌘/ctrl+1…4 set mode chat/code/research/truth (~l.605–625); there
  is no on-screen mode or depth control in chat (see review log #4).

## workflow

### happy path (one send)

1. the operator types in `AdaptiveInputBar` and presses enter (desktop) or
   the send button. `handleSend` (l.159–195) clears the draft, classifies the
   text (`classifyMessage`), may prefix a routing hint or wrap it as a legal
   directive, registers that hidden override keyed by the visible text
   (`setModelPromptOverride`, l.190), and calls `onSendMessage(raw,
   attachments)`.
2. `Dashboard.sendMessage` (~l.1687–1726): on the first user message of a
   conversation it infers mode/depth from the text (`inferChatConfig`,
   l.1699–1703); it parks attachments in `attachmentMapRef` keyed by content;
   if a stream is running it appends an optimistic message with status
   `queued` and a toast; otherwise pushes `${convId}||${content}` onto
   `pendingQueue` and calls `processQueue`.
3. `processQueue` (~l.1639–1666) drains the queue one entry at a time,
   calling `sendMessageCore` and then polling `isStreamingRef` every 100 ms
   until the stream ends.
4. `sendMessageCore` (~l.1141–1636) is the turn. see the machine narrative.
5. `ChatView` renders the user bubble immediately, an empty assistant bubble
   with a blinking caret while nothing has arrived (l.810–812), the
   `ThinkingPanel` with the provider row "direct from this device"
   (`ai.ts` l.215) and any reasoning tokens, then the answer as markdown and
   chat cards, link previews, inline maps, a workspace panel when the
   planner chose a lane, tool traces, and an action bar (copy · edit / send
   to board · regenerate).
6. after the answer: a notification ("Asherin responded") with a tone, a
   follow-up-suggestion model call whose result nothing renders, the
   learning half of the intelligence turn, and a vault distillation call.

### secondary paths

- **stop**: the stop square replaces send while `isStreaming`
  (`AdaptiveInputBar` l.563–569). `stopStreaming` (~l.1132–1137) aborts the
  controller and clears the lock; the turn's catch saves the partial answer
  and toasts "Stopped". observed.
- **regenerate** (ChatView l.993–1009): remembers the previous answer and
  re-sends the preceding user text; when the new answer differs a `DiffView`
  is shown inline. observed. the old answer row stays in the thread (a new
  pair is appended), so regenerate grows the conversation. observed.
- **edit and resend** (l.980–990, 846–896): the last user turn only;
  enter sends, escape cancels. the edited text is sent as a new turn, the
  original stays. observed.
- **queue**: while streaming, further sends are parked and shown as "N
  messages queued" (l.1074–1078). there is no visible remove, clear, pause
  or "send now" — `MessageQueuePanel` exists but `ChatView` never renders it
  (review log #4). observed.
- **offline**: `navigator.onLine === false` at send time marks the message
  queued in the `aureon_queue_db` IndexedDB store and registers background
  sync; the `online` event and the service worker's `PROCESS_QUEUE` message
  drain it through `processMessageQueue` (~l.453–610). see review log #1 for
  why this path locks the chat.
- **export**: overflow menu → "Download conversation" (markdown blob,
  l.618–633) or "download creamy pdf" (`downloadCreamPdf`). plaintext leaves
  the encrypted envelope by the operator's hand; expected.
- **send to board** (l.91–125): queues a board drop in memory and then
  does `window.location.assign("/dashboard?view=whiteboard")` — review log #7.
- **archive / delete / rename / pin**: sidebar actions; archive has an undo
  toast (~l.1815–1842), delete does not (~l.1802–1813).
- **directive profile ("brain")**: `BrainsManager` in the top bar picks a
  stored system prompt + library files; the composer shows "directions in
  force: name" with "turn off" (l.1081–1101). observed.
- **calibration feedback, consensus, branches**: code paths exist in
  `Dashboard.tsx` but no control in `ChatView` reaches them (review log #4).

## machine narrative

### the send turn — `sendMessageCore(content, convId, attachments)`

- **actor**: the operator, through `sendMessage` → `processQueue`; also
  `handleSplitSendMessage` (~l.408) and the intel-card confirm
  (`INTEL_SELECT_EVENT`, ChatView l.608–616) which sends a model-authored
  prompt.
- **inputs**: visible text; optional attachments (base64 in memory); the
  hidden prompt override for that exact text; the active branch (always
  "main" in practice); `mode`, `depth`, `userProfile`, `consensus*`,
  `activeBrainId` from the closure of the render that created `processQueue`.
- **preconditions**: `user` (device identity, always present —
  `AuthContext`); `isStreamingRef.current === false`, else the toast
  "Already responding" and return (~l.1143–1147).
- **effects, in order**:
  1. claim the lock and the abort controller before any await (~l.1150–1152).
  2. append the optimistic user message; on the first message set the title
     to the first 50 chars and persist it (~l.1158–1168).
  3. `enqueueMessage` into the plaintext IndexedDB queue (~l.1172).
  4. offline → status `queued`, toast, **return without releasing the lock**
     (~l.1175–1180). review log #1.
  5. encrypt and insert the user row; re-key the optimistic message to the
     row id and retarget its branch tag (~l.1182–1203). failure → status
     `queued`, toast "Network issue", lock released (~l.1211–1221).
  6. `trackUsage(mode)`, `setIsStreaming(true)`, append an empty assistant
     row so the thinking panel has a home (~l.1223–1246).
  7. build history from the branch's messages plus this one, swapping the
     hidden override into the last user turn (~l.1254–1261).
  8. `prepareTurn` (intelligence: settings, conversation state, user memory,
     patterns, discovery) → `intelligenceContext`; failures are logged and
     skipped (~l.1262–1288). `projectId` is not passed (review log #9).
  9. `composeVaultContext(user.id, content)` appends a brief from
     `organism_vault` rows that are not sensitive and not disabled
     (~l.1289–1296; `vault.ts` l.528–560).
  10. brain context: `brains` row + every text file in `file_ids`, 80 000
      chars each (~l.1300–1336).
  11. consensus branch if enabled (never, review log #4) else `streamChat`.
  12. `streamChat` (`ai.ts` l.133–327): resolve provider/model/key
      (`resolveActiveModel`, l.59–96: active prefs → `aureon_byok_active`
      hint → BYOK dialog); build the system prompt (`buildSystemPrompt`);
      emit the provider row; optional thinking pass when depth is deep
      (`shouldRunThinkingPass`, `aureonThinking.ts` l.50–60); the answer
      pass with up to `MAX_STREAM_CONTINUATIONS` continuation calls when the
      output looks cut; each pass retries 3× on 429/5xx with backoff
      (l.232–270).
  13. `onDone` (~l.1462–1550): if no words came back, substitute the
      thinking text, else "no words came back from the model."; upsert the
      assistant row (`ignoreDuplicates: true`, idempotent); `fetchSuggestions`
      (a model call, result unused); `completeTurn` (learning); `distillTurn`
      (a model call that writes `organism_vault`); notification + tone.
- **failure paths**:
  - abort → partial saved with `insert`, toast "Stopped" (~l.1567–1582).
  - network death / provider error → partial saved if any; the bubble is
    replaced with "the connection dropped before the answer finished." or
    the raw provider message or "no words came back from the model."
    (~l.1584–1633). no retry control (review log #5).
  - thrown before the stream (no key, vault locked, key rejected) →
    `raiseByok` opens the BYOK dialog and throws; the catch above shows the
    reason inside the assistant bubble.
- **invariants the code tries to hold**: one stream per device at a time
  (`isStreamingRef`); the visible user text equals the stored user text
  (override only in the model payload); assistant rows are never empty
  (filtered at hydrate, ~l.838); the stored assistant row id equals the
  in-memory id (`assistantId` reused in upsert).
- **invariants that do not hold**: the lock is released on every exit
  (broken by step 4); mode/depth used for a turn are the ones the operator
  last saw (stale closure, review log #6); a stopped turn cannot overlap a
  new one (review log #29).

### streaming / abort

- transport: `streamLlm` (`llm.ts` l.347–360) picks anthropic, gemini or an
  openai-compatible base by provider; `readSse` (l.112–135) parses
  `data:` lines and throws an `AbortError` when the signal flips between
  reads. no timeout anywhere (review log #14). non-SSE replies are read as
  one json body (l.185–192).
- errors are classified by status into `AUTH | RATE_LIMIT | UPSTREAM_BUSY |
  BAD_REQUEST | NETWORK | UNSUPPORTED | UNKNOWN` with the provider's message
  cut to 400 chars (l.95–110).
- deltas are appended to `assistantContent` and pushed into the
  conversation by id on every chunk (`onDelta` ~l.1435–1451); `onReplace`
  handles a continuation that restarted the answer.
- the thinking store (`useAureonThinking.ts`) is a module-level map keyed by
  assistant id, bounded to 20 000 chars and 24 step rows; `finish` closes
  running rows. it is never cleared on conversation switch (memory grows by
  one small entry per turn for the page session).

### retry

- provider retries live in `runPass` (3 attempts, only when nothing has been
  received yet) and in `completeLlm` (3 attempts). the operator-facing retry
  is regenerate or edit-and-resend; the `ChatErrorBanner` retry never
  renders (review log #5).
- the persisted-assistant upsert retries once (~l.1511–1521).

### queue

- in-session queue: `pendingQueue` (ref of strings), `queueItems` (state for
  display), `queuePaused` (never togglable from the ui). entries are keyed
  by content, as is the attachment map — two identical queued texts collide
  (review log #17).
- offline queue: `aureon_queue_db.queued_messages` with `retryCount`,
  `maxRetries 5`, exponential delays 1–30 s (`messageQueue.ts`). the service
  worker's `sync` handler only posts `PROCESS_QUEUE` back to a client
  (`public/sw.js` l.78–120); the page does the work. `processMessageQueue`
  re-inserts the user row, then streams an answer **without** the abort
  signal and without taking `isStreamingRef` (~l.519–600), so stop cannot
  reach it and a fresh send can overlap it (review log #25).

## state & data

| state | where | shape · lifetime | leaves the device |
| --- | --- | --- | --- |
| conversations (title, mode, pinned, archived, project_id, branches) | encrypted-at-rest local table `conversations` (`postgrest.ts` over `db.ts`) | until deleted / wiped | no |
| messages (content, attachments_enc, role, sources, truth_score) | local table `messages`; `content` AES-GCM under the device DEK (`encryption.ts`) | until deleted; **only the newest 500 per conversation are ever read** (~l.812, ~l.954) | the plaintext of the branch history, attachments inlined (text ≤120 000 chars, images base64), the system prompt, and the operator's memory brief go to the connected provider on every turn |
| optimistic message statuses | react `messageStatuses` keyed by **temp id** | page session, never pruned | no |
| in-session queue | `pendingQueue` ref + `queueItems` state | page session | no |
| offline queue + drafts | IndexedDB `aureon_queue_db` — **plaintext** message content and drafts | until sent / cleared | no, but outside the encrypted envelope |
| branch map, active branch | localStorage `aureon_msg_branch_map` (≤5 000 ids), `aureon_active_branch`, `aureon_conv_branches` | until cleared | no |
| notifications | localStorage `aureon_notifications` — title + **first 80 chars of every answer in plaintext**, 100 entries (`NotificationInbox.tsx` l.17–25) | until cleared | no, but outside the encrypted envelope |
| thinking text per turn | module map in `useAureonThinking.ts` | page session | no |
| hidden prompt override | module map `promptOverrideMap.ts` keyed by visible text | until consumed | the override text goes to the provider |
| active brain id, active conv id, send-button shape, enhancer width/open | localStorage | until cleared | no |
| per-conversation provider toggles, numbered-format off | localStorage `aureon_conv_api_toggles`, `aureon_numbered_format_off` — **read by `ai.ts` l.76, l.186; written by nothing** | — | no |
| memory, patterns, learning events | local tables `ai_user_memory`, `ai_project_memory`, `ai_memory_candidate`, `ai_pattern*`, `ai_learning_event`, `ai_conversation_state` (`intelligence/store.ts`) | until forgotten | the composed brief goes to the provider |
| vault facets | local tables `organism_vault`, `organism_patterns`, `organism_growth` (`memory/vault.ts` l.29–31) | until forgotten | non-sensitive rows, ranked, go to the provider as a brief |
| usage counters | `usage_stats`, `calibration_feedback` | — | no |
| provider keys | WebCrypto vault (`local/keys.ts`); read once per turn by `resolveActiveModel` | until wiped | only to the provider, in the request header |

## logic

- **system prompt** (`prompts.ts` l.142–176): identity → doctrine core
  (`shepherdCore`, the fixed sections of `shepherd.txt`) → asherin identity →
  time context → operating notes → product notes → doctrine retrieved by
  term overlap within a 14 000-char budget and at most 8 sections
  (`shepherdBrain.ts` l.162–186; the two reference datasets share the same
  ranking) → asherin procedure cards → image note → mode → depth → operator
  brain → operator memory & procedures → skill injection → swarm → numbered
  override → speaker boundary → voice → face → anchor → greeting contract. a
  greeting (`isTrivialTurn`, l.109–115: every word in a 40-word list, ≤8
  words) skips retrieval and gets the short contract.
- **history**: branch-scoped (always main), assistant rows that are empty or
  a "hold costume" filtered (~l.1226–1259).
- **auto-config**: `inferChatConfig` on the first user message sets mode and
  depth — for the *next* render (review log #6).
- **continuations**: `looksIncomplete` (`ai.ts` l.224–230) — an odd number of
  code fences, a `GENERATION_INCOMPLETE` marker, or an unterminated `files`
  json — triggers another pass with an "exact continuation" prompt and
  stitches the result.
- **consensus** (`fetchConsensus`, l.407–478): parallel non-streamed calls,
  jaccard similarity over word sets, a "verdict" by claim validation rate.
  unreachable from the ui.
- **suggestions** (l.480–499): three follow-ups as json, max 300 tokens.
  unrendered.
- **chat cards**: `parseChatCards` splits the answer into text and fenced
  card segments; unknown card types still render as a card. an address or a
  geo intent in any message is geocoded against nominatim and shown as a
  `PropertyMapCard` (ChatView l.532–571).
- **workspace lanes** (`useChatWorkspace`): after streaming ends the last
  user question is framed, routed and planned; a `sensor`, `research`,
  `spatial` or `artifact` lane adds surfaces under the answer. research
  capability is hard-wired off (`hasResearchProvider: false`, ChatView
  l.583), so a research-worded question shows cards/graph/timeline as
  "unavailable" with the reason — honest, but every "who owns…" question
  grows a panel of three greyed rows. observed.
- **vault distillation** (`vault.ts` l.392–): after each answer with ≥ the
  minimum user-text length, a model call extracts durable facts and
  patterns; `memoryEnabled` is the gate. observed.
- **timestamps**: today → time; yesterday → "Yesterday time"; else short
  date (l.959–970).

## integrations & network

| call | where | host · method · payload | timeout / abort | key | offline |
| --- | --- | --- | --- | --- | --- |
| answer stream | `llm.ts` `streamOpenAiCompat` / `streamAnthropic` / `streamGemini` | provider base from `OPENAI_COMPAT_BASE`, `api.anthropic.com`, `generativelanguage.googleapis.com`; POST json with the whole system prompt + history + images | **none**; operator abort only | bearer / `x-api-key` / `x-goog-api-key` from the vault | fetch throws → `NETWORK` LlmError → "could not reach …" |
| thinking pass | same, deep depth only | a second full call | same | same | same |
| continuations | same | up to `MAX_STREAM_CONTINUATIONS` more calls | same | same | same |
| follow-up suggestions | `ai.ts` l.480 → `completeLlm` | the answer (≤4 000 chars) sent again | none | same | silently `[]` |
| vault distillation | `vault.ts` `distillTurn` | user text + answer sent again | none | same | "model failed" skipped |
| prompt enhancer (desktop only) | `PromptEnhancerPanel.tsx` l.188–215 | two more calls per non-trivial user message: rewrite (with an osint/bug-bounty rewriter persona, l.27) then a second answer | abort on new turn / conversation switch | same | error row |
| landing ask | `Index.tsx` l.129 | one research-mode call | abort on resend | same | error copy |
| geocode | `propertyIntent.ts` l.42–58 | `nominatim.openstreetmap.org/search` GET with the address text from any message | 5 s abort | none | skipped |
| link preview | `LinkPreview.tsx` l.95, l.101 | `www.google.com/s2/favicons?domain=…` and `img.youtube.com` for every url in any message | browser image load | none | broken image |
| markdown images | ChatView l.425–447 | any `https:` image the model names (`img-src https:` in the csp) | — | none | — |
| pulls / traces | `emitPull` → local table; `TurnTraces` reads it | local only | — | — | — |

nothing in the chat path calls an asherin server; there is none. the csp
(`vercel.json`) allows `connect-src https:` and local runtimes, which is what
makes direct provider calls and ollama/lm studio work.

## security & privacy

- **keys**: read by `getProviderKey` inside `resolveActiveModel`, held in a
  local variable for the turn, placed in the request header only. `raiseByok`
  messages carry the provider name, never the key. the vault's typed errors
  fire before any request is built. observed.
- **prompt injection surfaces**: the model's own output becomes (a) markdown
  with arbitrary image urls (a tracking pixel to any host the model names;
  csp permits it), (b) chat cards whose payload drives ui, (c) an intel card
  whose confirm sends a model-authored prompt as the next turn (bounded to
  2 000 chars, click required), (d) link previews that leak every mentioned
  domain to google's favicon service. attachments are inlined into the user
  turn as fenced text — an attached file can carry instructions; that is
  the operator's own choice. internal links are allow-listed to seven paths
  (ChatView l.246–266); external links open with `noopener noreferrer`.
- **memory leaving the device**: the vault brief (non-sensitive rows only)
  and the intelligence brief go to the provider on every non-trivial turn;
  the "encrypted on this device" copy does not say so. the empty-state
  sentence "nothing leaves the browser unless you send it to the model you
  connected" is true only if the operator understands that their memory is
  sent with every message.
- **plaintext at rest outside the envelope**: the offline queue and drafts
  (`aureon_queue_db`), the first 80 chars of every answer in
  `aureon_notifications`, the hidden prompt override map (memory only).
- **third parties besides the provider**: nominatim receives any address an
  operator types or the model writes; google receives every domain
  mentioned. neither is disclosed.
- **non-disclosure**: the system prompt instructs the model never to echo
  the operating notes or any key (`prompts.ts` l.33–37).
- **clipboard / export**: copy and download are plaintext by design.

## failure modes

| failure | what the operator sees | honest? |
| --- | --- | --- |
| no key / vault locked / key rejected | the BYOK dialog, plus the same sentence inside an assistant bubble ("connect a model key in settings → ai keys…") | yes, twice |
| provider 4xx other than auth | the provider's message (≤400 chars) as shepherd's words, no error styling, no retry | no — reads as the model speaking (review log #5) |
| provider 429 / 5xx | up to three silent retries, then "the model provider is busy right now. send it again in a moment." in the bubble | yes |
| network drop mid-stream | partial saved; bubble becomes "the connection dropped before the answer finished." | yes; the partial text is replaced in memory but kept on disk, so a reload shows the partial and not the sentence |
| provider stalls (no bytes, no close) | caret forever; only stop ends it | no timeout (review log #14) |
| offline at send | toast "Message queued"; **every later send says "Already responding"; reconnect does not drain** | no (review log #1) |
| user-row insert fails (storage) | toast "Network issue. Will retry automatically." — nothing retries until an `online` event | partial (review log #32) |
| empty answer | "no words came back from the model." or the thinking text promoted to the answer | yes |
| stop | "Stopped — Generation stopped. Partial response saved." | yes |
| message from an older key | an italic bracketed sentence in the bubble | yes, title-case |
| > 500 messages | older ones vanish silently | no (review log #12) |
| geocode / link preview failures | nothing | fine |
| suggestions / distill / learning failures | console only | fine (non-critical) |

## interface & accessibility

judged against the aesthetic records (interaction 033–038, colour 039–041,
typography 042–044, emotion 045–048).

- **focal point & hierarchy** (012, 013, 043): the empty state has one
  headline, one emerald lock line and one sentence — one focal point. a
  live thread has the composer as the anchor; message bubbles are
  `text-[13px] sm:text-sm font-light`, metadata `text-[9px]`/`text-[10px]`
  at 40–50 % alpha. four type roles exist (headline, body, action label,
  caption) but the caption sizes sit below the legibility floor on a dark
  surface (042, 040): 9 px at 0.4 alpha is decoration, not information.
- **signifiers** (034): what looks clickable and is: bubbles' action labels
  (icon + word), the thinking panel header (chevron, aria-expanded), the
  overflow "More". what is clickable and does not look it: the empty-state
  headline "How can I help?" is a `<Link to="/dashboard/settings">`
  (ChatView l.729–738) — a heading that navigates away. what looks
  interactive and is not: the `GripVertical` handle in `MessageQueuePanel`
  (not rendered anyway); the "On board" state after send-to-board claims a
  result that did not happen (review log #7).
- **feedback** (035): pending is honest — the optimistic user bubble, the
  empty assistant bubble with a caret, the provider row in the thinking
  panel. success has no in-thread mark beyond the text stopping and the
  action bar fading in; the system adds a notification *and a tone* for
  every answer (`NotificationInbox.tsx` l.95) — arousal the task does not
  call for (047). error is the weakest state: a provider error arrives as a
  normal bubble (see failure modes), the "sending" status is never visible
  because statuses are keyed by the temp id (review log #11).
- **response time** (036): optimistic user message (reversible: the row is
  removed from the thread only if the queue entry is removed; a failed
  insert leaves it marked queued). progress is real tokens; cancel is one
  tap away on desktop and phone (44 px). the pre-token wait has no stage
  labels — "memory", "learning" steps appear only when retrieval found
  something.
- **motion** (037): message rows `animate-slide-up` with an index-staggered
  delay (l.774–775) — on first open it explains arrival; on every
  conversation switch all rows slide in again, which explains nothing.
  caret and thinking dots pulse; the action bar and lightbox fade; the
  quick-action pills `hover:scale-[1.02]` (`AdaptiveInputBar` l.441) and the
  jump-to-latest pill scale on hover — ornament. reduced motion: every
  chat animation carries `motion-reduce:animate-none` and `index.css`
  l.48–55 collapses all animation globally under the media query. good.
- **accent economy** (041): the composer alone carries accent (send border
  and icon), emerald (lock), amber (offline border and status), destructive
  (stop), and `text-accent` on code spans and links in every answer;
  `directions in force` is an accent pill. the one bright thing that should
  win — stop while streaming — competes with the inline code colour of the
  answer above it.
- **colour as meaning** (039): status colours are paired with words
  (Sending…, Queued, Failed) — good; the quality badges in the enhancer
  (emerald/amber/sky) are paired with words too.
- **lowercase copy** (044, product voice): the composer line and empty
  state are lowercase; nearly every toast, title, menu item and status
  string is title-case (copy & voice below).
- **empty and loading states**: empty thread — headline + lock + sentence;
  no conversation — "Welcome to your workspace." / "start with a question."
  (v2) with a "+ Start a conversation" button; lazy chunk — a pulsing
  "Loading…" (shell). the enhancer rail's `WorkspacePanel` surfaces say why
  they are unavailable (good).
- **phone (390×844)**: composer wraps — textarea on its own row
  (`order-[-1] w-full`, l.549), four 44 px controls below; the top bar
  leaves `pl-16` for the floating nav button; bubbles `max-w-[95%]`; the
  long-paste modal is a fixed `w-[420px]` (l.595) and overflows a 390 px
  viewport; enter inserts a newline on "mobile" (ua sniff or < 768 px) with
  no hint. the enhancer rail is hidden below `lg`.
- **keyboard & focus**: textarea has no accessible name beyond the
  placeholder; stop/send/attach/mic are buttons with `title` only (no
  `aria-label`); the overflow menu is a div with a backdrop, not a menu
  role; thinking panel and edit textarea show focus rings.
- **error prevention / reversibility** (038): archive has undo; delete is
  immediate and permanent from a hover icon (review log #13); regenerate and
  edit never destroy the previous answer (good).
- **trust cues** (045): "encrypted on this device" is true for storage;
  "shepherd may make mistakes" is present; provenance of a tool row is the
  provider name only. the claim that nothing leaves the browser except what
  you send omits the memory brief, nominatim and google (security above).

## relationships

| edge | type | real in code? | evidence |
| --- | --- | --- | --- |
| chat → provider (openai-compat / anthropic / gemini / local runtimes) | calls | yes | `llm.ts` l.160–345 |
| chat → key vault | reads_from, trusts | yes | `ai.ts` l.59–96, `keys.ts` |
| chat → library | reads_from | partly: only through a directive profile's `file_ids` (`brains` → `library_files` → `storage.from("library")`, ~l.1300–1336). the library room itself is not consulted for a turn; no "cite your files automatically" | observed |
| chat → projects | reads_from | claimed, not real: conversations are bound to a project (`project_id`, ~l.1766–1777) but the turn never passes `projectId` to `prepareTurn` and never reads project `instructions` or `mode` | contradicted (`orchestrator.ts` l.108; `scope.ts` header) |
| chat → vault memory (`organism_*`) | reads_from, writes_to | yes: `composeVaultContext` before the model, `distillTurn` after (~l.1289–1296, ~l.1536–1541); the vault room re-reads on `onVaultChange` | observed |
| chat → intelligence memory (`ai_*`) | reads_from, writes_to | yes: `prepareTurn` / `completeTurn`; the memory room (`OrganismVaultView`) reads `organism_*`, not these tables, so the learning half is invisible in any room except through the thinking-panel "memory" step | observed; the room's comment "chat writes to the same tables" is true only for the vault half |
| chat → knowledge vault (`aureon_vault_sources`) | reads_from | claimed in the room's own blurb ("Asherin will cite them automatically in every chat", ~l.2042) and in `PRODUCT_NOTES` ("asherin.knowledge"); nothing in `ai.ts`, `prompts.ts`, `intelligence/*` or the send path reads it | contradicted |
| chat → health | reads_from | no code; only named in `PRODUCT_NOTES` | contradicted as an edge; fine as a room name |
| chat → pages | hands_off | partly: "download creamy pdf" and `IntelReportCard` produce files in place; there is no handoff into the pages studio | observed |
| chat → design (zali) | hands_off | none | observed |
| chat → agents (zahten) | hands_off | none; `PRODUCT_NOTES` names "agents, team" (team removed) | contradicted copy |
| chat → search (ghost-engine) | hands_off | dead: `onHands` is never called by `streamChat` (`ai.ts` l.147), so `openHands` (`hands.ts`) never runs; its map also targets the retired `ide` | contradicted |
| chat → whiteboard | hands_off | broken: in-memory drop + full-page navigation to a query-param url the router ignores | contradicted (review log #7) |
| chat → connect (pulls) | writes_to, reads_from | writes: geocode, legal-arm pulls. reads: `TurnTraces` by `meta.turn_id`, which no writer sets | half-real |
| chat → notifications / inbox | writes_to | yes, plaintext snippets | observed |
| chat → maps (nominatim) | calls | yes, unannounced | observed |
| landing ask box → chat | hands_off | none; the landing answers itself | observed |
| sidebar → chat (select, drag to split, jump to message) | calls | yes | observed |
| shell ⌘1–4, palette → chat mode | calls | yes; the only mode control | observed |
| verified_by | — | `localShim`, `keyVault`, `byokProviderCoverage`, `shepherdBrain`, `shepherdDatasets`, `intelligenceArchitecture` tests; **no test touches `sendMessageCore`, the queue, abort, or `ChatView`** | observed |

## performance

- **model calls per message** (desktop, standard depth, memory on): answer
  (1) + continuations (0–n) + suggestions (1, discarded) + distillation (1)
  + enhancer rewrite (1) + enhancer answer (1) = **5 provider round-trips
  for one visible answer**, three of them re-sending the operator's text.
  deep depth adds the thinking pass. the enhancer fires whether or not its
  rail is open (`PromptEnhancerPanel.tsx` l.140–158 has no `open` gate).
- **mount cost**: a conversation open hydrates ≤500 rows, decrypting each
  (`Promise.all`), then every other conversation in the background
  sequentially (~l.863–880) — on a device with many threads this keeps the
  main thread decrypting for seconds after first paint. each assistant
  bubble mounts `TurnTraces` (two full-table loads of
  `asherin_connect_pulls`, immediate and delayed), `renderLinkPreviews`,
  a geocode attempt, and `parseChatCards` on every render of the message
  (not memoized; it re-runs for every streamed token of the last message
  and for every re-render of every earlier message).
- **timers & listeners**: the queue poller (100 ms while streaming); the
  jump-to-message retry (≤20 × 120 ms); the draft saver (500 ms debounce);
  the visibility drift probe (after 45 s hidden); the recording timer; all
  cleaned up on unmount except module-level maps (thinking store, override
  map, link-preview caches) which live for the page session.
- **lists**: no virtualisation; a 500-message thread renders 500 bubbles
  with markdown, which is the cap's only merit.
- **memory**: `messageStatuses` grows by one key per send and is never
  pruned; `attachmentMapRef` entries are deleted on dequeue.

## copy & voice

the composer and empty state speak the product voice ("encrypted on this
device", "shepherd may make mistakes", "conversations are stored encrypted
at rest…"). almost everything else is title-case or account-era:

- toasts: "Back online", "You're offline", "Message queued", "Already
  responding", "Calibrated — Asherin adjusted to your preference.",
  "Consensus Error", "Stopped", "Conversation deleted permanently",
  "Conversation archived", "Failed to create conversation".
- notifications: "Asherin responded", "Queued response ready", "View".
- chat view: "How can I help?", "Download conversation", "Copy / Copied",
  "Edit", "Regenerate", "Send to board / On board", "Cancel / Send",
  "Yesterday", "Expanded view", speaker label "You" in the export.
- composer: "Message shepherd…", "Offline — messages will queue…",
  "Restored from 10:42:03 AM", "Draft saved", "Large Clipboard Content",
  "Attach as file", "Paste inline", "Photos / Videos / Documents / All
  Files", "Up to 20MB per file · 10 files max", "Debug / Explain / Optimize
  / Add Tests / Summarize / Fact Check / Extract Data".
- scroll pill: "Aureon is still writing — Jump to latest" (the pre-rename
  product name) and "Jump to present".
- statuses: "Sending…", "Queued — will send next", "Retrying", "Failed".
- the dead error banner: "Your session may have expired. Try refreshing the
  page.", "Could not reach the server", "Switch to faster model".
- decrypt failure: "_[This message was saved with an older device-only key.
  Open it on the device that wrote it and re-save this conversation.]_".
- welcome card: "Welcome to your workspace.", "Spin up your first
  conversation, or pick a module from the sidebar.", "+ Start a
  conversation".
- head: title "Dashboard — Asherin Workspace", description mentions "BYOK
  controls"; sr-only h1 "Asherin Dashboard — Your Intelligence Workspace".
- the model's own brief (`PRODUCT_NOTES`, `prompts.ts` l.19–20) lists
  "agents, team" among the rooms and tells shepherd to "say kernel offline"
  for a tool that did not run — the phrase the voice rule retires wherever a
  device answer exists; the device answer here is "that tool is not wired in
  this build".
- the enhancer's rewriter persona (l.27–48) frames every conversation as
  "offensive-security / osint / bug-bounty" work — a voice the operator
  never chose.

## tests & proof

- ran: `npx vitest run src/test/localShim.test.ts src/test/shepherdBrain.test.ts
  src/test/shepherdArchitecturePrompt.test.ts src/test/keyVault.test.ts
  src/test/byokProviderCoverage.test.ts src/test/intelligenceArchitecture.test.ts
  src/test/shepherdDatasets.test.ts` → 43 passed, **1 failed**:
  `shepherdArchitecturePrompt.test.ts` l.33 — for "review this contract clause
  and tell me the bargaining consequence of the termination fee" the prompt
  contains the retrieval header but no negotiation section. cause (inferred):
  commit b64637b put the two reference datasets into the same index, ranking
  and 14 000-char budget as the doctrine (`shepherdBrain.ts` l.148–153), and
  dataset sections now outrank the doctrine's negotiation section for that
  query. the test is the only guard on retrieval quality and it is red.
- proven by unit tests: the local shim's query semantics, the key vault,
  provider coverage, doctrine parsing/core/retrieval budget, the intelligence
  orchestrator's gates.
- not proven anywhere: the send turn, lock release, abort, the queue paths,
  continuation stitching against a real stream, `ChatView` rendering,
  phone layout. no playwright run and no screenshots exist for this room yet
  (the shell narrative's `usetest.mjs` / `roomstest.mjs` are not in
  `scripts/`).
- confirmation status: desktop ✗ phone ✗ — to be taken after the fixes.

## open gaps

- a device cannot cite the knowledge vault, a project's corpus or the
  library in a turn today; the copy says it can.
- no request timeout exists on the model stream; a stalled provider is
  indistinguishable from a slow one until the operator stops it.
- the memory brief and two third-party services (nominatim, google
  favicons) receive data the "nothing leaves the browser" sentence does not
  mention.
- branches, consensus, calibration and the queue controls are code without a
  door; either they get one or they go.

## review log

| # | finding | domain | level | evidence | kind | repair mode | fix (file:line to change) | confirmed by |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | sending while offline returns from `sendMessageCore` with `isStreamingRef.current === true` and no stop button; every later send toasts "Already responding", `processMessageQueue` skips because the ref is set, so reconnecting never drains the queue — only a reload recovers | state | cause | observed (`Dashboard.tsx` ~l.1175–1180 vs the release at ~l.1218–1219 and the guard at ~l.458) | defect | local correction | `Dashboard.tsx` ~l.1176: release `isStreamingRef.current = false; abortRef.current = null;` before `return`, as the catch below does | — |
| 2 | `fetchSuggestions` sends the answer back to the provider after every turn and the result is never rendered (`ChatView` does not destructure `suggestions`; `FollowUpSuggestions` is unused here) | performance · security (data re-sent) | cause | observed (`Dashboard.tsx` ~l.1522–1525, ~l.1386–1387; `ChatView.tsx` l.450–460) | defect | local correction | delete the two calls and the `suggestions` state, or render `FollowUpSuggestions` under the last answer | — |
| 3 | the prompt enhancer runs two extra model calls for every non-trivial user message on desktop whether or not its rail is open, under an "offensive-security / osint / bug-bounty" rewriter persona; with suggestions and distillation a message costs up to five provider round-trips | performance · requirements · security | cause | observed (`PromptEnhancerPanel.tsx` l.140–158 no `open` gate, l.188–215 two calls, l.27 persona) | defect | boundary repair | gate `launchEnhancement` on `open` and an explicit "enhance" action; retire the osint persona or make it a mode the operator picks | — |
| 4 | dead doors: `ChatView` ignores `mode/onModeChange/depth/onDepthChange/suggestions/onCalibrationFeedback/queue controls/consensus*/storedProviders` (props l.58–83, destructuring l.450–460), so there is no mode or depth control in chat, consensus (~l.1343–1407) and calibration (~l.1109–1128) are unreachable, `MessageQueuePanel` never renders, `ConversationBranches` is never mounted (branches always "main"), and `ChatErrorBanner` can never show because nothing sets `chatError` (l.486, l.753–762) | requirements · structural | failure | observed | defect | component replacement (remove) + contract repair (wire depth/mode) | `ChatView.tsx` l.450–460 and the top bar l.664–724: mount `DepthSelector`/mode control and `MessageQueuePanel`; delete consensus, calibration and branches from `Dashboard.tsx` and `ChatView` props | — |
| 5 | a provider or runtime error is written into the assistant bubble as shepherd's words (`keep = … errMsg …`), unstyled, with no retry; the banner that would have carried it is dead (#4) | interface · behavioral | cause | observed (`Dashboard.tsx` ~l.1600–1633; `llm.ts` l.95–110 passes the provider's text through) | defect | contract repair | surface non-abort errors through `ChatErrorBanner` (set `chatError` from the send path) with retry = regenerate; keep the bubble for model text and the two device sentences only | — |
| 6 | first-message auto-config calls `setMode/setDepth` then sends in the same tick; `sendMessageCore` reads `mode`/`depth` from the render closure, so the inferred values apply to the *next* message; `processQueue` is memoised on them and drains later messages with the values current when it was created | behavioral | cause | inferred from closure structure (`Dashboard.tsx` ~l.1695–1703, ~l.1639–1666, `trackUsage(mode)` ~l.1223) | defect | state consolidation | keep `mode`/`depth` in refs (like `conversationsRef`) and read the refs in `sendMessageCore`, or pass them as arguments | test: send "write a function…" as the first message and assert the system prompt carries `MODE: CODE` |
| 7 | "Send to board" queues an in-memory drop then `window.location.assign("/dashboard?view=whiteboard")`: the reload empties the inbox (`boardInbox.ts` l.5–9) and the router reads the view from the path, so the operator lands on chat with nothing on the board, after the button said "On board" | behavioral · interface (VC-069) | cause | observed (`ChatView.tsx` l.91–125) | defect | local correction | `ChatView.tsx` l.112: `navigate("/dashboard/whiteboard")` (hook already in scope) and set "On board" only after the inbox confirms | — |
| 8 | the hands handoff never fires (`streamChat` ignores `onHands`, `ai.ts` l.147) and its map targets the retired `ide` (`hands.ts` l.15); `PRODUCT_NOTES` tells shepherd about rooms "agents, team" and to say "kernel offline" | semantic · requirements (VC-079) | failure | observed | defect | component replacement (remove hands) + requirement reconciliation (prompt copy) | delete `src/lib/chat/hands.ts` and the `onHands` option (`ai.ts` l.147, `Dashboard.tsx` ~l.1427–1432); `prompts.ts` l.19–20: drop "team", replace the kernel-offline sentence with "say the tool is not wired in this build" | — |
| 9 | project scope never reaches a turn: `prepareTurn` is called without `projectId` (~l.1271–1275) so `loadProjectMemory` never runs (`orchestrator.ts` l.108); project `instructions`/`mode` are not read in the send path; `scope.ts` and the knowledge-vault blurb (~l.2042) promise grounding the code does not do | requirements · behavioral | cause | observed | defect | contract repair | `Dashboard.tsx` ~l.1272: pass `projectId: conv?.projectId ?? getActiveScope()?.projectId ?? null`; load the project's `instructions` into `brainContext`; fix the knowledge-vault blurb or wire `aureon_vault_sources` into retrieval | — |
| 10 | `TurnTraces` loads the whole `asherin_connect_pulls` table twice per assistant bubble to filter on `meta->>turn_id`, which no writer sets | performance · verification | cause | observed (`TurnTraces.tsx` l.50–58; grep for `turn_id` finds no writer) | defect | local correction | either pass `meta: { turn_id: assistantId }` through chat-path `emitPull` calls, or remove `TurnTraces` from `ChatView.tsx` l.1054 | — |
| 11 | message statuses are keyed by the temp id while the message is re-keyed to the row id, so `messageStatuses[msg.id]` misses and "Sending…" is never shown; the map is never pruned | state | failure | observed (`Dashboard.tsx` ~l.1183–1205; `ChatView.tsx` l.977) | defect | state consolidation | re-key the status when the id changes (~l.1200) and delete it on `sent`; or store status on the message object | — |
| 12 | only the newest 500 messages of a conversation are ever read, with no notice | data | failure | observed (`Dashboard.tsx` ~l.812, ~l.954) | defect | local correction | page older rows on scroll-to-top, or show "older messages not loaded" when `rows.length === 500` | — |
| 13 | delete is immediate and permanent from a hover icon; archive has undo, delete has none | interface (038) | failure | observed (`SwipeableConversationItem.tsx` l.169; `Dashboard.tsx` ~l.1802–1813) | defect | local correction | soft-delete with an undo toast like `archiveConversation`, or a confirm step | — |
| 14 | no timeout on the model stream or the fetch; a silent provider leaves the caret forever | execution (VC-058) | failure | observed (`llm.ts` `readSse` l.112–135, no timer) | defect | contract repair | `llm.ts`: an idle timer (e.g. 60 s without a byte) that aborts with a `NETWORK` error the catch already renders | — |
| 15 | brain context loads every file in `file_ids` (80 000 chars each, no count cap); the prompt can exceed the context window and the failure comes back as #5 | performance (VC-051) | failure | observed (`Dashboard.tsx` ~l.1316–1328; `ai.ts` l.194) | defect | local correction | cap total brain text (e.g. 120 000 chars) and say which files were cut in the thinking panel | — |
| 16 | the offline replay in `processMessageQueue` streams without the abort signal and without taking `isStreamingRef`, so stop cannot reach it and a fresh send can run concurrently with it | state (VC-034) | cause | observed (`Dashboard.tsx` ~l.519–600) | defect | state consolidation | route replayed messages through `sendMessageCore` instead of a second copy of the stream | — |
| 17 | queue entries and the attachment map are keyed by content; two identical queued texts collide and the 100 ms poller busy-waits | state · performance | failure | observed (~l.1646–1662, ~l.1710, ~l.1719) | defect | local correction | queue objects `{id, convId, content, attachments}`; resolve a promise from the turn instead of polling | — |
| 18 | a stopped turn releases the lock immediately while its catch runs later; a send in that window starts a second turn, then the first turn's catch flips `isStreaming` false and hides the stop button for the second | state (VC-034) | cause | inferred (`stopStreaming` ~l.1132–1137; catch ~l.1552–1560) | defect | state consolidation | tag the lock with the turn id and only let the owning turn release it | — |
| 19 | the first 80 chars of every answer are written in plaintext to `localStorage aureon_notifications` (100 entries) and a tone plays per answer | security · interface (047) | failure | observed (`NotificationInbox.tsx` l.17–25, l.95; `Dashboard.tsx` ~l.1542–1548) | defect | boundary repair | stop pushing answer snippets; keep the inbox for cross-room events, sound off by default | — |
| 20 | every url in any message is sent to google's favicon service and youtube; every address-like string to nominatim; any `https:` image the model names is loaded (csp `img-src https:`) | security | failure | observed (`LinkPreview.tsx` l.95, l.101; `ChatView.tsx` l.549; l.425–447; `vercel.json`) | defect | boundary repair | drop the favicon fetch (render the domain letter), geocode only on an explicit "map it" action, and proxy nothing — render model images only from `data:`/`blob:` or behind a click | — |
| 21 | offline queue and drafts hold message text in plaintext IndexedDB outside the encrypted tables | security · data | failure | observed (`messageQueue.ts`; `Dashboard.tsx` ~l.1172) | defect | boundary repair | encrypt queue/draft content with the same DEK (`encryptText`) or drop the plaintext queue in favour of the encrypted `messages` row with a `pending` flag | — |
| 22 | `shepherdArchitecturePrompt.test.ts` l.33 fails: datasets share the doctrine's retrieval ranking and budget and push the negotiation section out | dependency · verification | cause | verified (test run) · cause inferred (`shepherdBrain.ts` l.148–153, commit b64637b) | defect | dependency restructuring | give the datasets a separate, smaller budget after doctrine sections, or weight doctrine sections above dataset sections | re-run the test |
| 23 | the empty-state headline "How can I help?" is a link to settings; a heading that navigates | interface (034) | failure | observed (`ChatView.tsx` l.729–738) | defect | local correction | plain `<h1>`; a separate lowercase "settings" link if one is wanted | — |
| 24 | the long-paste modal is `w-[420px]` on a 390 px phone; captions are 9–10 px at 40–50 % alpha | interface (065, 042, 040) | failure | observed (`AdaptiveInputBar.tsx` l.595; `ChatView.tsx` l.957, action bar l.975–1010) | defect | local correction | `w-[min(420px,calc(100vw-2rem))]`; raise captions to 11 px / 0.55 alpha | screenshot at 390×844 |
| 25 | the composer, mic, paperclip, lock, offline border, stop and inline code all carry colour; quick-action pills and the jump pill scale on hover; rows re-animate on every conversation switch | interface (041, 037, 067) | failure | observed (`AdaptiveInputBar.tsx` l.441, l.472–588; `ChatView.tsx` l.774–775; `ScrollIntelligence.tsx` l.57) | defect | local correction | keep accent for stop/send only; remove `hover:scale`; animate rows only on append (key the animation to "new since mount") | screenshot |
| 26 | title-case and account-era copy across toasts, menus, statuses, head and prompt (see copy & voice); "Aureon is still writing" names the old product | semantic · copy | domain | observed (strings listed above with lines) | defect | requirement reconciliation | lowercase every string listed in copy & voice; `ScrollIntelligence.tsx` l.60 → "shepherd is still writing — jump to latest"; `ChatErrorBanner.tsx` l.54, l.63 device-worded | read |
| 27 | the landing ask box answers on the landing page; the brief for this room assumed it hands into chat | semantic | domain | observed (`Index.tsx` l.117–150) | wrong claim (in the brief) | — | narrative states the real behaviour; if a handoff is wanted it is a new requirement | read |
| 28 | the memory brief, nominatim and google receive data the sentence "nothing leaves the browser unless you send it to the model you connected" does not mention | requirements · security | failure | observed (`ChatView.tsx` l.745–747 vs #20 and ~l.1289–1296) | defect | requirement reconciliation | after #20 the sentence becomes true for third parties; add "shepherd's notes about you ride along" or make the brief opt-in per conversation | read |
| 29 | `aureon_conv_api_toggles` and `aureon_numbered_format_off` are read on every turn and written by nothing | structural (VC-026) | domain | observed (`ai.ts` l.76, l.186; grep) | defect | component replacement (remove) | delete both reads or add the settings they imply | — |
| 30 | no unit or end-to-end test covers the send turn, lock release, abort, queue, or `ChatView`; no screenshots exist for this room | verification (VC-071) | domain | observed (`src/test/*`, `scripts/`) | defect | — | add a vitest around `sendMessageCore` extracted from the component (offline lock #1, stale mode #6, status re-key #11) and a playwright step for send → stop → regenerate at both widths | — |

## fixes landed (narrative version 2, 2026-10-25)

the review log above was written read-only; this pass applied it. rows are
referenced by number.

| rows | what changed | where |
| --- | --- | --- |
| 1 | an offline send releases the streaming lock and the abort handle before it returns; later sends and the offline replay are no longer refused | `Dashboard.tsx` `sendMessageCore`, offline branch |
| 2 | the post-answer and consensus suggestion round-trips are gone (the result was never rendered) | `Dashboard.tsx`, import of `fetchSuggestions` removed |
| 3 | the prompt enhancer only runs while its rail is open | `PromptEnhancerPanel.tsx` watch effect |
| 5 | a provider or runtime error is shown by `ChatErrorBanner` with its code and a retry; the bubble reads "the model did not answer." or keeps the partial text; the banner clears on the next send | `Dashboard.tsx` catch path → `chatError` state → `ChatView` `error` / `onErrorDismiss` props |
| 6, 16, 17, 18 | queue entries are objects `{id, convId, content, attachments, mode, depth}`; the first-message auto-config rides with that message; the processor calls the send of the latest render through a ref, so no stale mode, depth or profile | `Dashboard.tsx` `QueuedSend`, `latestSendRef`, `sendMessage`, `processQueue` |
| 7 | send to board navigates in place; the board inbox survives | `ChatView.tsx` `SendToBoardButton` |
| 8 | the hands handoff and its map to the retired editor are deleted; the prompt no longer lists a team room or asks for "kernel offline" | `src/lib/chat/hands.ts` removed, `ai.ts`, `prompts.ts` |
| 9 | the conversation's project id reaches `prepareTurn`, so project memory loads | `Dashboard.tsx` prepare block |
| 10 | `TurnTraces` (two table scans per bubble for a field nothing wrote) is removed | `ChatView.tsx`, component deleted |
| 11 | a message's status follows it when its temp id becomes the row id | `Dashboard.tsx` after the insert |
| 12 | "older messages are not loaded — the latest 500 are shown." appears at the cap | `ChatView.tsx` |
| 13 | delete leaves the list at once and touches the store six seconds later unless undone | `Dashboard.tsx` `deleteConversation` |
| 14 | a stream silent for a minute is closed with a network error the banner renders | `llm.ts` `readSse` |
| 19 | the inbox gets "shepherd answered — a reply landed in chat.", never answer text; the tone is off by default | `Dashboard.tsx`, `NotificationInbox.tsx` |
| 20 | no favicon or thumbnail fetch per link; geocoding only for the operator's own typed address | `LinkPreview.tsx`, `ChatView.tsx` |
| 24 | the long-paste modal fits a phone | `AdaptiveInputBar.tsx` |
| 26 | "shepherd is still writing — jump to latest", lowercase queue and delete toasts | `ScrollIntelligence.tsx`, `Dashboard.tsx` |
| 29 | the two dead localstorage reads on every turn are gone | `ai.ts` |
| 4, 15, 21, 23, 25, 28, 30 | still open: the dead mode/depth/consensus/queue props, the brain-text cap, the plaintext offline queue, the heading that navigates, accent economy and row re-animation, the privacy sentence, and tests around the send turn belong to the whole-app chat pass that follows the room reviews |

## vision confirmation — 2026-10-26

screens: final3-d-chat.png and final3-m-chat.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: empty chat, composer, depth pills and the true privacy line render. defects seen and fixed in the sidebar beside it: title-case "Past Convos", "Chat" and "Search software…"; arvision, defender, knowledge and connect fell back to a file icon; four rooms repeated their own name as a subtitle; group hints were 8 px at 40 % opacity.
- fixed: lowercase copy, one icon per live room, real subtitles, 10 px hints at 60 %, aria-expanded and aria-current. re-checked on the rebuilt screen.
