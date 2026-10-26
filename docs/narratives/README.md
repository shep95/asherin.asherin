# software narratives

every piece of software in asherin (each dashboard room) gets a narrative:
a deep, plain-language account of what the software is, written against a
fixed taxonomy, then reviewed against the code and the running interface,
corrected, and confirmed with screenshots. the narrative is the review
instrument: a claim the code cannot back is a defect, and a behaviour the
narrative cannot explain is a defect.

## doctrine

two datasets govern this work and live beside it in `docs/doctrine/`:

- `shepherd_software_architecture.txt` — the universal operating rule
  (discover → model → diagnose → trace → repair → verify → record), the five
  questions, the twelve repair domains, the four diagnostic levels, the
  relationship types, the repair modes, the evidence statuses and the
  acceptance conditions. every narrative is written and reviewed with it.
- `shepherd_aesthetic_psychology.txt` — 58 research records on perception,
  composition, cognition, interaction, colour, typography, emotion, ethics
  and systems, each with a design rule, a limit and a quality gate. the
  interface section of every narrative is judged against it, and the
  whole-app pass (landing, blog, chat, shell, relationships between rooms,
  motion) is run from it.

## method

the five questions are asked of every room, in order: what exists · what
should exist · what is broken · why is it broken · how is it repaired and
verified.

1. **write** the narrative from the code, section by section (taxonomy below).
   every claim names the file and function it rests on, and carries an
   evidence status: observed · inferred · hypothesized · contradicted ·
   unknown · verified. a machine narrative accompanies the human one where
   the room has a contract worth stating: actor, action, inputs,
   preconditions, effects, failure paths, invariants.
2. **review** the narrative: read it as a hostile reader. mark every flaw,
   contradiction (narrative vs code, code vs copy, desktop vs phone), missing
   failure path, unbounded network call, place a secret could leak, state that
   is written but never read, dead control, or promise the interface makes that
   the code cannot keep. classify each mark by repair domain (semantic,
   requirements, structural, dependency, behavioral, state, data, interface,
   security, execution, performance, verification) and by diagnostic level
   (domain → failure → cause → repair). causation needs evidence, not a
   dependency arrow.
3. **fix** the code for every mark that is a defect; fix the narrative for every
   mark that was a wrong claim. name the repair mode (local correction,
   contract repair, boundary repair, state consolidation, dependency
   restructuring, component replacement, architectural migration, requirement
   reconciliation) and prefer the smallest bounded change that removes the
   cause rather than the symptom.
4. **replace** the old narrative with the corrected one (the old text is not
   kept — git holds it).
5. **confirm** with vision: screenshots of the room at desktop (1440×900) and
   phone (390×844) widths after the fix, read by eye, with the findings
   closed out one by one. acceptance: the original failure does not
   reproduce; the cause is addressed, not hidden; required behaviour still
   holds; trust boundaries still hold; the intended and observed narratives
   agree on verified claims. anything unverifiable stays marked partial or
   unknown.

## taxonomy

| domain | what the section must answer |
| --- | --- |
| purpose & promise | what the room is for, in one paragraph, and what the interface promises the operator |
| entry & navigation | how it is reached (sidebar group, deep link, aliases, title), what loads first |
| workflow | the happy path step by step, and every secondary path (edit, delete, export, retry) |
| state & data | every piece of state: where it lives (react, localStorage, indexeddb, vault), its shape, its lifetime, and whether it ever leaves the device |
| logic | the algorithms and decisions: parsing, scoring, ranking, transforms, with their edge cases |
| integrations & network | every outbound call: host, method, payload, timeout, abort, retry, what happens offline, which key it carries and where that key comes from |
| security & privacy | threat model for the room: injection surfaces, key handling, what a hostile page/response/file could do, storage at rest, clipboard/export leakage |
| failure modes | every way it can fail and what the operator sees for each (never a blank, never a raw stack, never a spinner forever) |
| interface & accessibility | layout at desktop and phone, focus order, keyboard, contrast, motion, lowercase copy, empty and loading states — judged against the aesthetic records: figure-ground, grouping and alignment (processing fluency), one focal point per screen, visual weight that follows importance, type scale and measure, colour used only to carry meaning, motion that explains a state change and never decorates, no dark patterns |
| relationships | what this room pulls from and hands to (depends_on, calls, owns_state, reads_from, writes_to, trusts, verified_by): chat, the vault, the library, projects, the key vault, other rooms; and whether each edge is real in code |
| performance | mount cost, timers, intervals, large lists, media, workers; what is cleaned up on unmount |
| copy & voice | the words on screen: lowercase except proper names, no account-era language, "shepherd" for the model, no "kernel offline" where a device answer exists |
| tests & proof | unit tests that cover the logic, the end-to-end step that drives it, screenshots |
| open gaps | what still cannot be done on a device, said plainly |

## files

one file per room, `docs/narratives/<room>.md`, headed by a status block:

```
room: asherin.<name>   view id: <id>   files: <main component path>
narrative version: <n>   reviewed: <date>   confirmed: desktop ✓ phone ✓
```

followed by the taxonomy sections and a closing `review log` table:
`# | finding | domain | level | evidence | kind (defect / wrong claim) | repair mode | fix (commit or file:line) | confirmed by`.
