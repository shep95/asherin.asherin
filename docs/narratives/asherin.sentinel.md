```
room: asherin.sentinel   view id: asherin-sentinel   files: src/components/dashboard/sentinel/SentinelView.tsx
narrative version: 2   reviewed: 2026-10-25   confirmed: desktop ✓ phone ✓ (seen 2026-10-26 on a production build at 1440×900 and 390×844; see "vision confirmation" at the end)
```

version 1 was written against the code as found; its review produced the defects in
the log at the end. this is the replaced narrative, written against the corrected
code. every claim names a file and a line. the screenshot pass (method step 5) has
not run in this round because the browsers were owned by another process; the
status block says so instead of claiming it.

## purpose & promise

asherin.sentinel is an ambient microphone watch held on this device. while this tab
is open it captures from one or more audio inputs (each a "channel"), closes speech
into turns with an energy detector and an on-device speech model, tags sharp
sounds by their measured acoustic shape, recognises returning voices by an
acoustic signature, takes words for the lane on the system default input from the
browser's own speech recogniser, and writes every turn into a timeline stored in
this browser's own tables with the sensitive columns sealed. the timeline can be
searched, filtered by voice and lane, and a recording session can be downloaded
as a zip of transcript, json and whatever audio clips are still retained. an
environment tab reads bluetooth advertisements and location fixes into the same
timeline.

the interface promises exactly that and no more: the header's truth boundary
(`SentinelView.tsx:398`) says a running channel survives tab switching, other
apps and a locked desktop screen, and does not survive the tab closing, the
browser quitting, a phone sleeping the browser or the device powering off; that
the missing stretch is written as a visible gap; that there is no server behind
the room and nothing is uploaded; and that words come from this browser's own
speech recogniser, which may run on this device or at the browser maker, with the
room saying which. the dashboard's own one-line description of the room
(`src/pages/Dashboard.tsx:1903-1908`) makes the same promise.

## entry & navigation

- sidebar group "watch", entry `asherin.sentinel` (`src/lib/navIntents.ts:64-71`,
  keywords sentinel/ambient/listen/audio/microphone/transcribe/speaker/voice/
  diarization/watch).
- dashboard view id `asherin-sentinel`; aliases `sentinel` and `asherin.sentinel`
  resolve to it (`src/pages/Dashboard.tsx:211-212`); the lazy component is wired
  at `src/pages/Dashboard.tsx:1903` through `gatedView`.
- title and subtitle: "asherin.sentinel — an ambient watch, honest about its
  reach." (`src/lib/dashboard/v2Titles.ts:29`).
- what loads first: `SentinelView` mounts (`SentinelView.tsx:60`), calls
  `bootChannels()` (`channels.ts:271`) which reads the channel roster from
  localStorage (`channels.ts:138`), creates a default "this machine" channel on
  first run (`channels.ts:280`), opens gaps for channels that were listening when
  the page last died (`channels.ts:286-296`), reads stored watch preferences into
  the detector and recogniser (`channels.ts:300-306`), probes the speech
  recogniser's availability (`channels.ts:307-310`), enumerates inputs and
  listens for `devicechange` (`channels.ts:311`), and starts the 10 s liveness
  stamp (`channels.ts:313`). the view then runs `reload()` (`SentinelView.tsx:128`)
  which reads the timeline, alerts and settings from the local tables and shows
  "reading the timeline on this device" until it returns
  (`SentinelView.tsx:455`). no network request is made on load.
- the live tab is the default tab; eight tabs are listed at
  `SentinelView.tsx:355-364`.

## workflow

happy path:

1. press "start every channel" (`SentinelView.tsx:198`, `toggle`) or a channel
   card's "start" (`SentinelView.tsx:1031-1048`). `startChannel`
   (`channels.ts:543`) writes the lane's language hint to its device row, then
   `SentinelEngine.start()` (`captureEngine.ts:229`) registers the lane row
   locally (`captureEngine.ts:235`), asks for the microphone with the browser's
   noise suppression and auto-gain off and echo cancellation on
   (`captureEngine.ts:256-263`), attaches `ended`/`mute` listeners to the track
   (`captureEngine.ts:282-283`), builds the ear chain (`captureEngine.ts:305`),
   attaches a ScriptProcessor (`captureEngine.ts:317`), primes the on-device
   speech model (`captureEngine.ts:329`), opens a history session
   (`captureEngine.ts:333`), takes a screen wake lock (`captureEngine.ts:335`),
   and starts the 6 s timeline-write timer and the 60 s lane heartbeat
   (`captureEngine.ts:346-347`).
2. once the engine reports `listening`, `syncTranscriber()` (`channels.ts:412`)
   binds one `LiveTranscriber` (`transcripts.ts:227`) to the one listening lane on
   the system default input (`channels.ts:368`), with the lane's spoken-language
   hint (`transcripts.ts:181`), if words are enabled.
3. speech is closed into turns by the adaptive detector (`vad.ts:87-154`), judged
   by silero on device (`captureEngine.ts:512`, `neuralVad.ts:103`), given a
   voiceprint (`captureEngine.ts:521`), encrypted into the local buffer
   (`localBuffer.ts:122`) and written into the timeline on the next drain
   (`captureEngine.ts:545` → `sync.ts:324`). sharp sounds are classified on a
   rolling window (`captureEngine.ts:471`, `soundEvents.ts:55`).
4. `ingest` (`sync.ts:324`) matches the voiceprint against stored voices, takes
   words the recogniser already produced for that turn, binds a self-stated name
   and raises alerts (`ingest.ts:155`); words that arrive after the turn was
   stored are attached by `attachPhrase` (`sync.ts:349`, called from
   `channels.ts:433`).
5. the live tab shows each row as it lands (`SentinelView.tsx:107`), the header
   meter follows the loudest lane (`SentinelView.tsx:186-192`).
6. "stop" (`channels.ts:558`) flushes the open tail, releases the microphone,
   closes the session, releases the wake lock and stops the recogniser
   (`captureEngine.ts:354-394`, `channels.ts:561`).

secondary paths:

- add a channel: channels tab → "add a channel" → pick an input
  (`SentinelView.tsx:966-1012`). input names are hidden by browsers until the
  microphone was allowed once; the room says so and offers "show my inputs"
  (`SentinelView.tsx:973-981`, `channels.ts:354`). an input already bound to a
  channel is not offered twice (`channels.ts:515`).
- rename a channel: tap its name (`SentinelView.tsx:1008-1030`,
  `channels.ts:517`). set its spoken language (`SentinelView.tsx:1085-1096`,
  `channels.ts:530`); a running recogniser restarts on the new hint
  (`channels.ts:538-541`).
- remove a channel: trash icon, only when more than one exists
  (`SentinelView.tsx:1130-1142`, `channels.ts:565`); its rows stay in the timeline.
- search and filter the timeline: text query, voice, lane, refresh
  (`SentinelView.tsx:494-540`; `sync.ts:455`).
- rename a voice (`SentinelView.tsx:576-595`, `sync.ts:274`).
- read the turn behind an alert and acknowledge it (`SentinelView.tsx:243`,
  `601-657`; `sync.ts:478`, `sync.ts:500`).
- download a session as a zip of `transcript.txt`, `timeline.json` and
  `audio/*.wav` (`SentinelView.tsx:276-343`); delete a history entry
  (`SentinelView.tsx:694-699`, `localBuffer.ts:247`).
- settings: words on/off, new-voice alerts, pickup sensitivity, clip retention
  (`SentinelView.tsx:709-747`); wipe the audio buffer, delete the timeline,
  forget learned voices (`SentinelView.tsx:757-797`).
- environment tab: scan the room, fix location now, follow location, name this
  place (openstreetmap), estimate from ip (ipapi.co)
  (`EnvironmentPanel.tsx:306-318`, `389-394`, `407-412`).
- retry: the only retry control is "read again" on a local read failure
  (`SentinelView.tsx:446-451`). the timeline write retries by itself: a buffered
  row is re-attempted on the next drain up to six times (`localBuffer.ts:153`,
  `captureEngine.ts:571`).

## state & data

| state | where | shape | lifetime | leaves the device? |
| --- | --- | --- | --- | --- |
| channel roster | localStorage `asherin.sentinel.channels.v1` (`channels.ts:47`) | `ChannelConfig[]` (`channels.ts:55-77`): id, lane key, label, input id and label, sourceLang, liveness stamp, open-gap marker | until removed; private mode keeps it in memory for the session (`channels.ts:131-136`) | no |
| legacy lane key | localStorage `asherin.sentinel.ambient.deviceKey` (`channels.ts:48`, `captureEngine.ts:38`) | uuid | permanent | no |
| capture runtime | module scope `runtimes` (`channels.ts:117`) | engine, status, notes per channel | tab lifetime | no |
| recogniser | module scope (`channels.ts:131-136`) | one `LiveTranscriber`, bound channel id, state | while a default-input lane is listening | audio goes to the browser's recogniser, which may be on device or the browser maker's service (`transcripts.ts:189-214`); nothing goes anywhere asherin controls |
| phrase/turn pairing queues | module scope per lane key (`phraseRegistry.ts`) | pending phrases and turns, 20 s ttl (`transcripts.ts:46-50`) | seconds | no |
| audio clips | IndexedDB `asherin-sentinel-ambient` (`localBuffer.ts:17`), store `segments` | AES-256-GCM ciphertext under a non-extractable device key (`localBuffer.ts:107-137`); plaintext is a `SegmentPayload` with base64 wav, embedding, tag, evidence (`localBuffer.ts:54-69`) | rolling window, default 72 h, chosen in settings (`localBuffer.ts:170-176`); synced rows older than an hour are also purged | no |
| recording sessions | same database, store `sessions` | `RecordingSession` (`localBuffer.ts:32-40`) | until deleted | no |
| timeline rows | local table `sentinel_events` (`sync.ts:33`) via `src/lib/local/db.ts` | `EventRow` (`sync.ts:72-84`): plain id/device/speaker/kind/tag/confidence/time, sealed `transcript_enc` and `meta_enc` encrypted with the device data-encryption key through `src/lib/encryption.ts` | until deleted; capped at 20,000 rows, oldest dropped on write (`sync.ts:40`, `sync.ts:291`) | no |
| learned voices | local table `sentinel_speakers` | `SpeakerRow` (`sync.ts:86-96`): label, sealed `name_enc`, name source, sample count, confidence, centroid | until forgotten | no |
| lanes | local table `sentinel_devices` | `AmbientDevice` (`ingest.ts:21-29`) | until the store is wiped | no |
| alerts | local table `sentinel_alerts` | `AmbientAlert` (`ingest.ts:60-67`), capped at 500 (`sync.ts:41`) | until the timeline is deleted | no |
| watch settings | local table `sentinel_settings`, one row (`sync.ts:245`) | prefs {transcribe, pushNewSpeaker, sensitivity, pushTags} + retention hours | permanent | no |
| opened-cell cache | module scope `openCache` (`sync.ts:54`) | ciphertext → plaintext, cleared past 50,000 entries or on delete | tab lifetime | no |
| view state | react (`SentinelView.tsx:62-93`) | tab, filters, loaded rows, notes, renaming, exporting | component lifetime | no |
| environment ledger | refs in `EnvironmentPanel.tsx:62-70` | radio records, sightings, pending timeline writes, current fix, place name | tab lifetime; pending writes flushed every 30 s and on unmount (`EnvironmentPanel.tsx:170-176`) | only via the two labelled controls (see integrations) |

the whole-device export (`src/lib/local/exportData.ts`) carries the sentinel
tables with their sealed columns still sealed, so an exported bundle does not
reveal transcripts, names or coordinates. the room's own session download is the
readable export.

## logic

- **ear chain** (`earChain.ts:219`): two cascaded 80 hz high-pass stages, a
  warmth shelf, a 3.5 khz presence peak, an 8 khz air shelf, a lowpass ceiling
  clamped under nyquist, a 4:1 compressor at -24 db with +6 db makeup, then a
  gate worklet with hysteresis, 200 ms hold and a 10 ms raised-cosine fade
  (`earChain.ts:108-169`). the worklet is served from
  `/sentinel/gate-worklet.js` with an inline blob fallback (`earChain.ts:176-199`);
  with no worklet the chain degrades to filters plus compressor and says so
  (`earChain.ts:316`). gate thresholds per pickup distance: -38/-45/-52 db
  (`earChain.ts:93`).
- **frame features** (`dsp.ts:323`): 512-sample frames, iterative radix-2 fft,
  rms, zero-crossing, centroid, flatness, four band energies, autocorrelation
  pitch over 70-400 hz.
- **voice activity** (`vad.ts:87`): floor seeded from the first 12 frames, falls
  fast and rises slowly, never learns from a frame called speech; a turn opens
  after `minOpenFrames` active frames, closes after `hangoverFrames` quiet frames,
  is force-closed at 900 frames. three presets (`vad.ts:50-54`).
- **speech model** (`neuralVad.ts:103`): silero over the same 16 khz buffer that
  is stored; a turn under 250 ms is not judged; a turn the model finds no speech
  in is discarded and counted on the card (`captureEngine.ts:514-518`); a model
  that cannot load is reported once and the energy detector stands alone
  (`neuralVad.ts:109-114`).
- **sound tags** (`soundEvents.ts:55`): a transient is rms ≥ 0.02 and ≥ 3.2× the
  trailing average; its decay length and band shape decide between "elevated
  vocal stress", "impact — glass", "door event", "vehicle — exterior" and
  "unclassified impact"; three or more evenly spaced taps become "movement
  detected" (`soundEvents.ts:137-157`). every tag carries the measured evidence.
- **voiceprint** (`voiceprint.ts:44`): a 14-dimension statistic vector from
  voiced frames, none under 700 ms of voiced audio (`voiceprint.ts:28`). match
  requires cosine ≥ 0.955 and a 0.012 margin over the runner-up; otherwise "new"
  or "unsure" (`voiceprint.ts:102-116`). centroids merge with a decaying weight
  (`voiceprint.ts:119`); confidence is a capped function of sample count and
  last similarity (`voiceprint.ts:126`).
- **ingest** (`ingest.ts:155`): per segment — sound rows get their tag and raise an
  alert when the tag is in the alert list (`ingest.ts:184`); speech rows are
  matched (`ingest.ts:197-226`), a new voice is labelled "voice one/two/…"
  (`ingest.ts:107`), an unsure match is stored unattributed with
  `ambiguousVoice: true`, a turn with no print is stored unattributed. a phrase
  held for the turn is applied (`ingest.ts:129`); a name binds only from "my name
  is …" or "call me …" and never from "i am …" or "this is …" (`ingest.ts:119-126`).
  a new voice raises a "new voice" alert when the preference is on
  (`ingest.ts:263-271`).
- **phrase ↔ turn pairing** (`transcripts.ts:65`): two queues; a turn or a
  phrase pairs with the candidate it overlaps most, touching within 1.5 s counts;
  anything waiting more than 20 s is dropped rather than pinned to the wrong
  turn. `recognitionLang` maps "auto" to the browser's language because the api
  has no detection mode (`transcripts.ts:181`).
- **recogniser** (`transcripts.ts:227`): continuous, interim results on, one
  alternative; `processLocally` is set when the browser reports on-device
  availability (`transcripts.ts:194-203`, `281-285`); a phrase's start is the
  arrival of its first interim result and its end the final; the browser ending
  the session is answered with a backoff restart capped at 15 s
  (`transcripts.ts:333-345`); `not-allowed` and `language-not-supported` end the
  session and are reported as such (`transcripts.ts:316-327`).
- **gaps** (`channels.ts:234-268`): opened at the last liveness stamp, not at the
  moment noticed; floor of 4 s; closed on the next successful start with its
  duration (`sync.ts:390`).
- **timeline read** (`sync.ts:455`): newest first; structural filters first, then
  the sealed columns are opened only for rows that pass; a text query matches
  the opened transcript or the tag; limit 1-2000, default 200.
- **session export** (`SentinelView.tsx:276`): rows in the session's window plus
  clips still in the buffer; empty halves are named in the archive.
- **location** (`geo.ts`): movement is claimed only when displacement clears the
  combined accuracy of both fixes (`geo.ts:52`); a fix's source is inferred from
  accuracy (≤ 30 m is "gps") (`sources.ts:46`); a sighting inherits a fix only
  within 120 s (`trackers.ts:14`); "follows you" is two or more places and is
  explicitly not proof (`trackers.ts:66-71`).

## integrations & network

the room makes no call to any asherin server. `supabase.functions.invoke` is not
imported anywhere under `src/components/dashboard/sentinel/` or
`src/lib/sentinel/audio/`. what does reach the network:

| call | host | when | payload | timeout/abort | offline | key |
| --- | --- | --- | --- | --- | --- | --- |
| onnxruntime wasm | `cdn.jsdelivr.net/npm/onnxruntime-web@1.29.0/dist/` (`neuralVad.ts:35`) | once, lazily, on the first candidate turn after a start | a static file request; nothing about the operator | the library's own fetch; a failure is caught (`neuralVad.ts:80-82`) | the speech model is reported absent once and the energy detector stands alone (`neuralVad.ts:109-114`) | none |
| silero model | same origin `/sentinel/silero_vad_legacy.onnx` (`neuralVad.ts:31`) | with the above | static file | as above | as above | none |
| gate worklet | same origin `/sentinel/gate-worklet.js` (`earChain.ts:176`) | on each engine start | static file | inline blob fallback (`earChain.ts:191-198`) | degrades, said in the pipeline line | none |
| browser speech recogniser | the browser's own service: on device when the browser confirms it, otherwise the browser maker's speech service (`transcripts.ts:189-214`) | while a default-input lane is listening and words are on | live microphone audio, handled by the browser, not by asherin | the browser's; a `network` error is reported as a note and the session restarts with backoff (`transcripts.ts:328-345`) | words stop; turns are kept as audio and the card says so | none |
| ip estimate | `https://ipapi.co/json/` (`sources.ts:20`) | only when "estimate from ip" is pressed (`EnvironmentPanel.tsx:242-250`, `407-412`) | a GET; the request carries this device's ip and nothing else | 8 s abort (`sources.ts:88`) | the button reports the failure | none |
| reverse geocode | `https://nominatim.openstreetmap.org/reverse` (`sources.ts:162`) | only when "name this place" is pressed (`EnvironmentPanel.tsx:269-280`, `389-394`) | the current fix's latitude and longitude | 9 s abort, 1.1 s minimum spacing, 500-entry cache (`sources.ts:157-169`) | "no place name" toast | none |

both location calls are labelled on their controls with the host they reach. the
bluetooth scan is a local radio api (`scanSources.ts:45`, `64`); the location
watch is the platform's geolocation (`sources.ts:64`); neither is a network call.

retired in this edition and removed from the code: the edge-function sync client
(every `asherin-sentinel` action), the desktop companion pairing calls and the
loopback websocket probe to `ws://127.0.0.1:8769`, and the background worker
beacon to `sentinel-beacon`. `src/lib/sentinel/background.ts` now only
unregisters a worker an earlier build may have left behind
(`background.ts:24-47`) and drops every hand-over (`background.ts:50-62`).

the always-on daemon `src/lib/sentinel/alwaysOn.ts` is not part of this room's
surface (it serves the bluetooth sentinel under google/modules). it is off unless
the operator armed it (`alwaysOn.ts:116-126`) and, when armed, its calls to
`sentinel-ble` and `wifi-sentinel` (`alwaysOn.ts:177`, `413`, `449`, `517`, `552`)
resolve inside the local function shim to a structured "kernel offline" error
without any socket; see open gaps.

## security & privacy

threat model: the operator's own device, a browser tab with a microphone grant,
other scripts on the same origin, a stolen export, a hostile recogniser result,
and a hostile bluetooth packet.

- **microphone**: requested only on an explicit start, per channel, with
  `deviceId: { exact }` for a bound input so a missing headset never silently
  becomes the laptop mic (`captureEngine.ts:261`). the track's `ended` event is
  turned into a visible gap (`captureEngine.ts:282`, `channels.ts:261`). the
  recogniser reuses the same grant and opens the default input; the room prints
  where its audio goes (`channels.ts:370-410`, `SentinelView.tsx:408`).
- **audio at rest**: AES-256-GCM, 12-byte random iv per row, key generated on the
  device, non-extractable, stored in IndexedDB (`localBuffer.ts:107-116`). another
  script on the origin can ask the key to decrypt but cannot read the key
  material.
- **words, names and places at rest**: `transcript`, `meta` (including radio
  metadata and location coordinates) and speaker `name` are sealed with the
  device data-encryption key (`sync.ts:50-52`, `98-111`, `132-144`) via
  `encryptText` (`src/lib/encryption.ts:130`). a cell that cannot be opened is
  returned blank with `meta.unreadable` set, not dropped and not guessed
  (`sync.ts:113-129`); the row renders that note (`SentinelView.tsx:902`).
- **injection**: a transcript is text from the recogniser; it is rendered as a
  react text node, never as markup. the one place a transcript drives behaviour
  is name binding, which accepts only `[\p{L}][\p{L}'’-]{1,30}` after "my name
  is" or "call me" and rejects a stoplist (`ingest.ts:113-126`); the bound name is
  shown with its source phrase (`SentinelView.tsx:909`).
- **bluetooth packets**: parsed into plain fields and rendered as text
  (`EnvironmentPanel.tsx:356-376`); nothing pairs or connects
  (`scanSources.ts:1-14`). a radio is never attributed to a person
  (`trackers.ts:66-71`).
- **location**: coordinates are sealed in the timeline (`sync.ts:421-442`) and
  leave the device only through the two labelled controls.
- **export**: the session zip is plaintext by design and is handed to the
  operator through a download anchor (`SentinelView.tsx:329-336`); the object url
  is revoked after 4 s. the clipboard is not used anywhere in the room.
- **background**: no service worker is registered; an old `sw-sentinel.js`
  registration and its stored token are removed (`background.ts:24-39`).
- **keys**: the room holds no provider key and never reads the key vault.

## failure modes

| failure | what the operator sees | where |
| --- | --- | --- |
| microphone refused | card state `denied`, "the microphone was refused. sentinel cannot listen without it, and it will not ask again until you press start." | `captureEngine.ts:265-275` |
| bound input missing | "that input is not connected right now. power the bluetooth device on, reconnect it, then start this channel again." plus an "input not connected" chip | `captureEngine.ts:266-274`, `SentinelView.tsx:1075` |
| no microphone at all | "no microphone is available on this device." | `captureEngine.ts:274` |
| input ends mid-watch | card state `error` with the reason, a gap opened from the last liveness stamp, "gap open" chip | `captureEngine.ts:398-404`, `channels.ts:261` |
| input muted by the os | note "this input went silent at the operating system level…" | `captureEngine.ts:283` |
| timeline tables cannot be opened on start | card state `error` with the store's message or "the timeline on this device could not be opened." | `captureEngine.ts:236-241` |
| timeline write fails after capture | note with the message; rows stay in the encrypted buffer and are retried up to six times | `captureEngine.ts:570-572`, `localBuffer.ts:153` |
| local storage refused for a clip | note "this browser refused local storage — the segment could not be buffered." | `captureEngine.ts:539`, `488` |
| timeline read fails on load | one line with the message and a "read again" control; no spinner | `SentinelView.tsx:446-451` |
| speech model cannot load | one note, energy detector only, card line says "energy detector only" | `neuralVad.ts:109-114`, `SentinelView.tsx:1113` |
| no audio worklet | pipeline line ends "gate unavailable in this browser — the floor is passed through" and a note | `earChain.ts:316`, `captureEngine.ts:310` |
| no speech recogniser | card line "this browser has no speech recogniser, so turns are kept as audio without words."; header chip "no words" | `transcripts.ts:192`, `channels.ts:383`, `SentinelView.tsx:408` |
| recogniser refused / language unknown / service unreachable | card line and a note; turns continue as audio | `transcripts.ts:316-331`, `channels.ts:388-394` |
| lane not on the default input | card line "no words on this lane: the browser's recogniser hears only the system default input." | `channels.ts:380` |
| wake lock unavailable | note "this browser would not hold a screen wake lock — a locked phone may suspend the watch." | `captureEngine.ts:414` |
| narrowband bluetooth link | note naming the negotiated khz and what was lost | `captureEngine.ts:206-215` |
| tab closed / reloaded while listening | on the next open a gap from the last stamp with the reason | `channels.ts:286-296` |
| alert's turn deleted | "that turn is no longer in the timeline on this device — it was deleted or aged out." | `SentinelView.tsx:266` |
| alert about the watch itself | "this alert was raised about the watch itself, not about a recorded turn." | `SentinelView.tsx:247` |
| sealed cell unreadable | the row shows the sealed note instead of words | `sync.ts:128`, `SentinelView.tsx:902`, `915` |
| export with nothing left | the archive's transcript says so; `audio/README.txt` explains the empty folder | `SentinelView.tsx:311`, `323` |
| no bluetooth receiver | scan control disabled; note "this browser cannot receive bluetooth advertisements…" | `scanSources.ts:40`, `EnvironmentPanel.tsx:306-308` |
| geolocation denied / unavailable | "no fix yet. location permission denied for this site" (or the platform reason), a location gap, and the labelled ip-estimate button | `sources.ts:80-85`, `EnvironmentPanel.tsx:405-412` |
| openstreetmap / ipapi fail | toast "no place name" / the error line under the fix | `EnvironmentPanel.tsx:274-278`, `246-248` |
| private mode (no IndexedDB) | the shared store falls back to memory for the session (`src/lib/local/db.ts:88-104`); the room cannot detect this today — see open gaps | — |

no state in the room spins forever: the only spinners are the initial local read
(`SentinelView.tsx:453-456`), a channel's start/stop button while in flight
(`SentinelView.tsx:1051`), an alert's turn read (`SentinelView.tsx:636`), an
export in flight (`SentinelView.tsx:687`), and a location fix in flight
(`EnvironmentPanel.tsx:312`); each resolves to a row, a note or an error line.

## interface & accessibility

- **layout**: one scrolling column (`SentinelView.tsx:369`). the header card wraps
  its title block and controls (`flex-wrap`, `SentinelView.tsx:371`); the tab nav
  wraps (`SentinelView.tsx:426`); channel cards are one column under `lg` and
  two above (`SentinelView.tsx:1003`); timeline filters wrap
  (`SentinelView.tsx:496`); the environment tab is one column under `lg`
  (`EnvironmentPanel.tsx:323`). at 390 px the event row's fixed 86 px time column
  leaves the remaining width to the text (`SentinelView.tsx:883`). the trail map
  is a full-width svg (`EnvironmentPanel.tsx:535`).
- **focus and keyboard**: tabs are real buttons with `aria-pressed`
  (`SentinelView.tsx:432`); selects and inputs carry `aria-label`s where the
  visible label is a placeholder (`SentinelView.tsx:505`, `514`, `525`, `586`,
  `975`, `1015`); the switches carry `aria-label`s (`SentinelView.tsx:718`,
  `722`); icon-only buttons are labelled (`SentinelView.tsx:697`, `1134`). the
  alert's acknowledged tick has an `aria-label` (`SentinelView.tsx:620`).
- **contrast**: body copy is white at 50-80 % on the dashboard's dark surface;
  secondary at 35-45 %; the smallest text is 10-11 px. the 30-35 % tier is used
  only for provenance notes.
- **motion**: the level meters animate width over 150 ms
  (`SentinelView.tsx:415`); spinners are the only other motion.
- **copy case**: every string in the room is lowercase except proper names and
  the room's own name; language names in the select are lowercase
  (`languages.ts`).
- **empty states**: live "nothing captured yet…", timeline "no row matches that.",
  speakers "no voice has been heard yet.", alerts "nothing has met an alert
  threshold.", history "no session yet…", radios "nothing observed yet…", events
  "no arrivals or departures recorded yet." (`SentinelView.tsx:471`, `535`,
  `598`, `655`, `702`; `EnvironmentPanel.tsx:331`, `483`).
- **loading state**: one line with a spinner, "reading the timeline on this
  device" (`SentinelView.tsx:455`).

## performance

- mount: `bootChannels` reads localStorage, one IndexedDB read for settings, one
  `enumerateDevices`, and a recogniser availability probe; `reload` performs
  three table reads and opens up to 200 sealed rows (cached thereafter,
  `sync.ts:54-66`).
- timers while mounted: buffer stats every 4 s (`SentinelView.tsx:173`); a
  debounced timeline re-read 1.5 s after any table write
  (`SentinelView.tsx:162-170`); environment tab: a 1 s ledger sweep
  (`EnvironmentPanel.tsx:106`) and a 30 s flush (`EnvironmentPanel.tsx:171`). all
  are cleared on unmount.
- timers while a channel listens (module scope, deliberately surviving the view):
  a 6 s drain (`captureEngine.ts:346`), a 60 s lane heartbeat
  (`captureEngine.ts:347`), the 10 s liveness stamp (`channels.ts:313`), the
  recogniser's restart backoff (`transcripts.ts:340`). all are cleared on stop
  (`captureEngine.ts:355-358`, `channels.ts:330-334`).
- audio: a ScriptProcessor with 2048-sample blocks on the main thread
  (`captureEngine.ts:317`); feature extraction on 512-sample frames with reused
  scratch buffers (`dsp.ts:248-249`); the gate runs in an AudioWorklet. the
  silero model (1.8 mb) and onnxruntime wasm load once per page, lazily
  (`neuralVad.ts:55-58`).
- large lists: the live tab shows 40 rows, the timeline 200, the alerts list is
  capped at 100 in view and 500 in store; events held in view are capped at 400
  (`SentinelView.tsx:57`). the timeline table is capped at 20,000 rows; a text
  query over a full table opens every row once, then hits the cache.
- unmount of the view does not stop capture by design (`SentinelView.tsx:178-181`).

## copy & voice

- lowercase throughout except "asherin.sentinel" and proper names; the only
  model-facing word would be "shepherd" and the room does not call the model.
- no account-era claim remains in the room's files. "companion", "pair a machine",
  "sync to" and "kernel offline" do not appear in `src/components/dashboard/sentinel/`
  or `src/lib/sentinel/audio/`; "upload" appears only in the denials "nothing is
  uploaded" (`SentinelView.tsx:398`, `463`) and in the `pendingUploads` field name
  kept for the fabric bridge; "account" appears only in the historical note at the
  head of `ingest.ts:1-6`.
- every boundary is stated where it applies: the header truth boundary
  (`SentinelView.tsx:398`), the channel card's words line (`channels.ts:370-410`),
  the environment tab's boundary statement (`EnvironmentPanel.tsx:295-302`), the
  settings tab's "what this browser can do" list (`SentinelView.tsx:804-827`), the
  speakers tab's statement that confidence is a similarity margin
  (`SentinelView.tsx:544-549`), the alerts tab's statement that nothing is pushed
  (`SentinelView.tsx:604-607`).

## tests & proof

unit tests, all passing (`npx vitest run src/lib/sentinel`: 4 files, 33 tests):

- `src/lib/sentinel/audio/__tests__/transcripts.test.ts` — phrase ↔ turn pairing
  in both arrival orders, slack tolerance, ttl expiry, overlap maths, language
  mapping.
- `src/lib/sentinel/audio/__tests__/ingest.test.ts` — new voice + alert, same
  voice matched without a second alert, second voice, short sample unattributed,
  sound-tag alert list, words applied at ingest with name binding, name binding
  rules, no rename of a named voice, speaker labels.
- `src/lib/sentinel/audio/__tests__/sync.test.ts` (fake-indexeddb) — sealed
  columns on disk and opened on read, search/filter/context, gap open/close with
  duration, sealed coordinates, rename/ack/settings round-trip, delete timeline
  keeps voices, forget voices.
- `src/lib/sentinel/radio/__tests__/environment.test.ts` — leak surface, ledger,
  location maths (pre-existing).

`npx tsc --noEmit -p tsconfig.app.json` reports no error in any sentinel file or
its consumers; `npx eslint` on the room and `src/lib/sentinel/audio`,
`background.ts`, `radio/scanSources.ts` is clean.

end-to-end and screenshots: not run in this round (the browsers were owned by
another process). the step that would drive it: open `/dashboard` →
asherin.sentinel, press "start every channel", allow the microphone, speak a
sentence, see the turn land in live with words (chrome/edge/safari) or without
(firefox, with the card saying why), stop, download the session from history,
open settings and read "what this browser can do"; then the same at 390×844.

## open gaps

- **words are the browser's, not asherin's.** chrome and safari may hand audio to
  the browser maker's speech service; the room prints which case it is in and
  offers the off switch (`channels.ts:370-410`, `SentinelView.tsx:709-719`). an
  asherin-shipped on-device speech model does not exist in this repository
  (`src/lib` has silero for voice activity, tfjs for vision, tesseract for text;
  no whisper or transformers), and adding one was out of scope for this pass.
- **one lane gets words.** the web speech api hears only the system default
  input and allows one session per page, so a headset lane records turns without
  words (`channels.ts:368`, `380`).
- **no translation.** the old "render as" language has been removed; a lane
  stores what was said in the language it was said. translating through
  shepherd would send transcripts to the operator's model provider and was not
  added.
- **phone background.** a phone that sleeps the browser ends the watch; there is
  no companion process in this edition, and the room says so instead of offering
  one (`SentinelView.tsx:398`, `823-824`).
- **private mode is invisible to the room.** `src/lib/local/db.ts:88-104` falls
  back to memory when IndexedDB fails and does not expose that; the room cannot
  warn that the timeline will vanish with the tab. proposed shared patch: export
  `storageIsMemoryOnly()` from `db.ts` and show one line in settings.
- **the always-on daemon** (`src/lib/sentinel/alwaysOn.ts`) still calls
  `sentinel-ble` and `wifi-sentinel`, which the local shim answers as "kernel
  offline" without a socket; it is opt-in and belongs to the bluetooth sentinel
  room. its radio ingest, area check and tradecraft legs have no device answer
  and its toasts are capitalised; left for that room's narrative.
- **shared-file copy** still says "account timeline" or mentions the desktop
  companion outside this room's files: `src/lib/fabric/bridges/sentinelFabric.ts:48,52,279`,
  `src/lib/fabric/query.ts:10,88,114,123-124`, `src/pages/Software.tsx:88`, and the
  capitalised blurb in `src/lib/navIntents.ts:68`. `public/sw-sentinel.js` is now
  unreferenced. exact patches are in the review report; not edited here.

## review log

| # | finding | kind | fix | confirmed by |
| --- | --- | --- | --- | --- |
| 1 | on load the room called the `asherin-sentinel` edge function (timeline, alerts, settings) and showed "…needs a server-side organ… kernel offline" with a retry; nothing on load needs a server | defect | `sync.ts` rewritten as a local store over `src/lib/local/db.ts` (`sync.ts:165-535`); load reads local tables (`SentinelView.tsx:128-156`) | unit tests `sync.test.ts`; tsc; manual read of the load path |
| 2 | every engine start called `registerDevice` on the server and failed, so no channel could start ("the watch did not start") | defect | `registerDevice` is a local upsert (`sync.ts:165`); start path verified in code (`captureEngine.ts:235`) | tsc; `sync.test.ts` registers and reads a lane |
| 3 | copy said turns are "uploaded to your account" and "the account timeline is the authoritative record" | defect (copy ↔ code) | header, live, history, speakers, settings copy rewritten (`SentinelView.tsx:375-376`, `398`, `462-464`, `661-664`) | grep: no "account"/"upload" in the room's files |
| 4 | truth boundary offered "pair the desktop companion under devices"; `CompanionPanel.tsx` minted pairing codes against the server and said "open Asherin Sentinel on that machine" (capitalised, account-era) | defect | `CompanionPanel.tsx` deleted; boundary rewritten (`SentinelView.tsx:398`); devices tab replaced by settings | grep: no "companion" in the room's files |
| 5 | `background.ts` registered a service worker that beaconed to `${SUPABASE_URL}/functions/v1/sentinel-beacon` with a minted token in localStorage; the url is a dead host | defect (network, secret-shaped state) | module retired: unregisters the worker, removes the token, hand-overs are no-ops (`background.ts:24-66`); callers in `alwaysOn.ts` and `meshDevices.ts` unchanged | tsc; eslint |
| 6 | the environment tab probed `ws://127.0.0.1:8769` for a desktop companion on every mount | defect (unexplained connection) | companion source removed from `scanSources.ts`; `detectSupport` is synchronous (`scanSources.ts:33-43`) | tsc; eslint |
| 7 | the environment tab started a geolocation watch on mount (permission prompt on tab open), fell back to `ipapi.co` on any geolocation error, and reverse-geocoded every fix through `nominatim.openstreetmap.org` without saying so | defect (privacy, unexplained network) | location starts only on "fix location now" / "follow location"; ip estimate and place naming are explicit controls labelled with their host (`EnvironmentPanel.tsx:229-280`, `306-318`, `389-394`, `407-412`) | code read; narrative integrations table |
| 8 | radio and location rows (kinds `radio`, `location`) rendered through the speech branch as "unattributed voice · no transcript for this turn" | defect (code ↔ copy) | `EventRow` has a branch for both kinds (`SentinelView.tsx:893-905`) | code read |
| 9 | the ingest listener prepended events by position, so a later update to the same row would duplicate it | defect | `mergeEvents` upserts by id (`SentinelView.tsx:54-58`) | code read |
| 10 | the "render as" (translation) select promised a server-side translation that no longer exists | defect (dead control) | removed; `translateTo` kept in the stored shape for older rosters and never read (`channels.ts:64-65`, `150`) | tsc; grep |
| 11 | "transcribe speech turns" was a server preference with no device effect | defect (dead control) | switch drives the browser recogniser (`channels.ts:454`, `SentinelView.tsx:219-241`), with the recogniser's honest note under it (`SentinelView.tsx:713-716`) | code read |
| 12 | no words path existed on device at all; turns would have read "no transcript for this turn" forever | defect | `transcripts.ts` (web speech api, processing reported), `phraseRegistry.ts`, pairing at ingest and late attach (`sync.ts:324-369`, `channels.ts:412-452`) | `transcripts.test.ts`, `ingest.test.ts`, `sync.test.ts` |
| 13 | speaker matching, name binding and alert thresholds ran on the server; locally nothing would produce speakers or alerts | defect | `ingest.ts` runs them on device with the existing `voiceprint.ts` rules | `ingest.test.ts` |
| 14 | speaker copy said "across this account's own samples"; alerts implied pushes | wrong claim / copy | rewritten (`SentinelView.tsx:544-549`, `604-607`) | code read |
| 15 | "delete the account timeline" and "wipe this device's buffer" | copy | "delete the timeline on this device", "wipe the audio buffer", plus "forget learned voices" (`SentinelView.tsx:757-797`) | `sync.test.ts` covers purge/forget |
| 16 | `forgetSpeakers` returned a number where the view expected `{ deleted }` | defect (found by the new test) | wrapped (`sync.ts:525-528`) | `sync.test.ts` |
| 17 | devices tab listed server device rows with "offline" after five minutes — meaningless locally | defect (dead surface) | replaced by a settings tab with storage counts and a measured "what this browser can do" list (`SentinelView.tsx:707-827`) | code read |
| 18 | the room's settings (sensitivity, words) were applied only after the view's first read; a watch started from another path ignored them | defect | `bootChannels` reads them on boot (`channels.ts:300-306`) | code read |
| 19 | narrative v1 claimed "the recogniser runs on this device"; the web speech api does not guarantee that | wrong claim | narrative states the three cases; code reports them (`transcripts.ts:189-214`) | this document |
| 20 | `EnvironmentPanel` memoised the selected trail on a dependency eslint flagged as unnecessary; the trail could lag the tick | defect (minor) | computed per render (`EnvironmentPanel.tsx:282-285`) | eslint clean |
| 21 | comments in `captureEngine.ts`, `localBuffer.ts`, `wav.ts`, `neuralVad.ts`, `languages.ts` described uploads, an account timeline and a transcription server | wrong claim (code ↔ narrative) | headers rewritten to describe the device path | grep |
| 22 | screenshots at 1440×900 and 390×844 | pending | not run this round; status block says so | — |

## vision confirmation — 2026-10-26

screens: final3-d-asherin-sentinel.png and final3-m-asherin-sentinel.png (kept with the audit run, not in the repo) from the full sweep of a clean production build (76 targets, no error boundary, no page error, no sideways overflow, no shell shift).

- seen: the truth boundary, start every channel, idle state and the live feed render; long copy wraps at 390 px without overflow.
