# Draft Product Brief: November 2026 Preliminary Pilot

This brief frames a provisional first real-use pilot for the November 2026 preliminary event associated with Los más pesados. It is the product input for a later scope decision and planning reconciliation; it does not approve implementation scope or alter the existing OpenSpec plan.

## Document Control

| Field             | Value                                                                                                                                                                             |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Status            | **DRAFT**                                                                                                                                                                         |
| Prepared on       | 2026-08-11                                                                                                                                                                        |
| Candidate pilot   | November 2026, exact dates **UNKNOWN**                                                                                                                                            |
| Longer horizon    | Main Los más pesados edition, May 2027                                                                                                                                            |
| Purpose           | Define the evidence, opportunity, candidate pilot flow, decision questions, and safety boundaries needed to approve or reject a November scope.                                   |
| Decision boundary | This document may guide later reconciliation. It does not approve November capabilities, change release sequencing, define implementation, or commit any capability for May 2027. |

## Status Labels

| Label          | Meaning in this brief                                                                            |
| -------------- | ------------------------------------------------------------------------------------------------ |
| **CONFIRMED**  | Supported by direct event context, observation, or the current repository state.                 |
| **HYPOTHESIS** | A plausible product direction that requires validation before it becomes scope or a requirement. |
| **UNKNOWN**    | Information needed for a decision but not yet established.                                       |
| **DEFERRED**   | Intentionally outside the candidate November scope unless separately selected and approved.      |

## Executive Summary

**CONFIRMED:** Los más pesados is an international, multi-day breaking and popping event in Guadalajara, Jalisco, Mexico, jointly organized by the Los más pesados studio and the Boogaleando popping community. Attendees primarily come from Latin America, with additional international participation. The next main edition is planned for May 2027.

**CONFIRMED:** A preliminary event in November 2026 is the first opportunity to use, or at least attempt to use, an initial product under a real operating flow. The strongest observed problems are manual participant handling, chaotic check-in, unclear schedules and venues, and difficult coordination of simultaneous activities. The prior edition also had more than 300 bboys and a demanding showcase qualifier process.

**HYPOTHESIS:** A narrow November pilot centered on registration, check-in, competition group operation, evaluation evidence, and organizer-reviewed qualification could demonstrate operational value sooner than the currently emphasized accreditation-only sequence. That direction remains provisional until the event's categories, stages, staffing, connectivity, and actual qualification rules are known.

**Decision sought:** Determine whether November should pilot one coherent, safety-bounded end-to-end flow, and identify exactly which category and stage provide the best controlled test. Pricing and a commercial model are not part of this decision.

## Business Context and Partnership Model

| Topic                       | Current position                                                                                                                                                |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Event                       | **CONFIRMED:** Los más pesados, including breaking and popping activities across multiple days and potentially multiple venues.                                 |
| Organizers                  | **CONFIRMED:** Los más pesados studio and Boogaleando popping community.                                                                                        |
| Design-partner relationship | **CONFIRMED:** The organizers are design partners and pilot beneficiaries. Product discovery and validation should be conducted with them, not imposed on them. |
| Initial buyer               | **CONFIRMED:** There is no initial commercial buyer commitment. The design partners are not being treated as an initial paying customer.                        |
| Business model              | **DEFERRED:** Pricing, packaging, and the long-term commercial model should be considered only after operational value is demonstrated.                         |
| November role               | **CONFIRMED:** First real-use opportunity for a limited version, or a controlled attempt under a real flow.                                                     |
| May role                    | **CONFIRMED:** Longer product horizon for the main event, not a promise to deliver every identified module.                                                     |

## Evidence and Observed Problems

### Evidence Sources

| Perspective                  | Source                                                                                                                                                        | What it supports                                                                                               | Limitation                                                                      |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Participant                  | **CONFIRMED:** The product owner attended the prior event as a workshop-only participant.                                                                     | Workshop check-in, delays, and schedule/venue clarity problems.                                                | Does not establish staff procedures or competition rules.                       |
| Staff                        | **CONFIRMED:** The product owner's brother served as event staff.                                                                                             | Paper-based participant management and the difficulty of coordinating simultaneous activities and itineraries. | Detailed procedures still require an asynchronous interview.                    |
| Event context                | **CONFIRMED:** More than 300 bboys competed in the prior edition.                                                                                             | The scale and operational pressure of competition filters.                                                     | Exact roster and timing measurements are **UNKNOWN**.                           |
| Qualifier observation/report | **CONFIRMED:** Three groups ran simultaneously, one judge per group; bboys performed individually, judges took notes, and organizers later selected a top 32. | A real showcase/exhibition qualifier shape that is not a battle bracket.                                       | How notes were combined into the top 32 is **UNKNOWN** and under investigation. |

### Observed Participant Problems

| Problem                                   | Status        | Consequence observed                                                                                          |
| ----------------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------- |
| Workshop check-in was chaotic and manual. | **CONFIRMED** | Participants and staff spent time resolving entry manually.                                                   |
| Workshops became delayed.                 | **CONFIRMED** | The planned flow did not start or proceed on time. The exact delay baseline is **UNKNOWN**.                   |
| Venues and schedules were unclear.        | **CONFIRMED** | Participants had difficulty knowing where and when to attend. The volume of support questions is **UNKNOWN**. |

### Observed Staff Problems

| Problem                                                    | Status        | Consequence observed                                                                                                         |
| ---------------------------------------------------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Participant management used literal paper sheets.          | **CONFIRMED** | Maintaining and checking participant state was extremely difficult.                                                          |
| Multiple activities occurred simultaneously across venues. | **CONFIRMED** | Staff had difficulty tracking schedules, assignments, and itineraries.                                                       |
| Competition filters operated at substantial scale.         | **CONFIRMED** | More than 300 bboys made filter operation and later selection difficult.                                                     |
| Judge notes had to support a later top-32 decision.        | **CONFIRMED** | Organizers needed to reconcile evidence after simultaneous showcase groups. The actual reconciliation method is **UNKNOWN**. |

## Product Opportunity

Help organizers and event staff maintain one understandable operational picture from participant entry through reviewed competition qualification, while giving participants clearer access, venue, and schedule information.

The opportunity is not to digitize every event activity at once. It is to replace a fragile segment of paper- and memory-driven coordination with a narrow flow that organizers can review, correct, export, and fall back from without allowing the software to become the single point of failure for the event.

## Actors and Jobs to Be Done

| Actor                          | Job to be done                                                                                                                               | November relevance                                                                |
| ------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------- |
| Organizer or event lead        | Decide the approved event configuration, roster, stage outcomes, and what may be communicated as final.                                      | **CORE candidate**                                                                |
| Registration or check-in staff | Find the correct participant quickly, confirm the applicable entry, and record arrival without creating duplicate or ambiguous roster state. | **CORE candidate**                                                                |
| Competition coordinator        | Confirm category entries, assign groups or heats, monitor progress, and prepare reviewed qualifier decisions.                                | **CORE candidate** if competition is selected                                     |
| Judge                          | See the correct group and participant order and capture the evidence or notes required for that specific category and stage.                 | **CORE candidate** if digital judge capture is selected                           |
| Participant or competitor      | Understand registration status, check-in expectations, category entry, schedule, and venue.                                                  | **CORE candidate**, with the exact self-service surface **UNKNOWN**               |
| Workshop attendee              | Confirm workshop enrollment, schedule, venue, and attendance expectations.                                                                   | **DEFERRED** unless a workshop flow is separately selected                        |
| Hosts                          | Direct and animate the event using approved schedules and competition state.                                                                 | **CONDITIONAL** information consumer; not a competition decision-maker by default |
| Operations/support staff       | Resolve discrepancies and keep the event moving using approved corrections and contingencies.                                                | **CORE candidate**                                                                |

## Two Horizons

| Horizon                   | Product intent                                                                                                   | Boundary                                                                                                                                          |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| November 2026 preliminary | Attempt one controlled, end-to-end real flow; collect operational evidence; expose rule and staffing gaps early. | **HYPOTHESIS:** Prefer depth in one selected category/stage over shallow coverage of the whole event. Exact categories and scope are **UNKNOWN**. |
| May 2027 main event       | Use November evidence to decide what to retain, revise, expand, or reject for the main edition.                  | **DEFERRED:** No promise is made that all organizer modules, categories, workshops, or commercial functions will be available by May.             |

November is a learning and continuity milestone, not a reduced claim that all May needs are already understood.

## Candidate November Outcome

**HYPOTHESIS, pending scope approval:** For one or more explicitly selected categories and stages, authorized staff can prepare an event roster, check in participants, assign eligible participant entries to groups or heats, capture stage-appropriate judge evidence, review a proposed top-N result, approve the result, and preserve printable/exportable operating records. Participants and staff can identify the applicable schedule and venue.

The pilot should be considered successful only if it helps the real event flow without requiring organizers to trust an unexplained automated result or continue using broken software when event continuity requires a manual contingency.

### Provisional End-to-End Flow

1. An organizer confirms the pilot event, venues, schedules, selected categories, selected stages, roles, and operating owners.
2. Staff prepare or import participant identities and the relevant event participation and category entries.
3. Staff review roster discrepancies, golden-ticket status where applicable, and eligibility evidence before event operation.
4. At arrival, staff find the participant and check in the correct event, category, or selected activity entry.
5. The competition coordinator reviews checked-in entries and assigns them to the approved groups or heats for that category and stage.
6. Each judge receives only the relevant group, sequence, participants, and evidence-capture method for that stage.
7. Participants perform; judges capture notes, marks, or other evidence according to the confirmed rules for that category and stage.
8. The system presents evidence and a candidate top-N view only when the confirmed rule supports it. It does not silently invent a cross-judge calculation.
9. Authorized organizers review discrepancies, ties, absences, disqualifications, and corrections under the confirmed stage rules.
10. An organizer approves the qualifiers before publication or downstream use.
11. Staff export or print the approved roster, assignments, evidence, and results needed for operating continuity.
12. After the pilot, organizers compare candidate metrics and document corrections, workarounds, and unanswered questions before May planning.

Steps 4 through 10 are **HYPOTHESIS** until the exact November categories, stages, rules, and staffing are confirmed.

## Flexible Competition-Stage Concept

The product must describe real competition structures without assuming every category uses the same sequence or decision rule.

| Conceptual progression | Product meaning                                                                                                   |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Competition            | The broader competitive program within an event.                                                                  |
| Category               | A specific entry context such as individual, kids, pairs/duos, crew vs crew, or another confirmed event category. |
| Stage                  | One step within a category, with its own format and advancement rule.                                             |
| Group or heat          | A stage-specific operating division used to sequence or parallelize participant entries.                          |
| Participant entry      | The competitor, pair, or crew entered in that category and stage.                                                 |
| Performance            | The stage occurrence for which evidence may be captured.                                                          |
| Evaluation             | Stage-specific notes, marks, rubric evidence, or decisions captured by an assigned judge or judges.               |
| Reviewed qualifiers    | The organizer-approved entries that advance after the applicable evidence and exceptions are reviewed.            |

### Distinct Formats

**CONFIRMED:** The observed filter was a showcase/exhibition qualifier. Bboys performed individually in three simultaneous groups with one judge per group. Judges took notes, and organizers later selected a top 32.

**CONFIRMED:** A showcase qualifier is distinct from a battle bracket. A qualifier evaluates performances to determine advancement; a battle bracket structures direct versus matchups and advancement through battles.

**UNKNOWN:** The process used to combine the three judges' notes into the top 32.

**Product boundary:** Support the selected November stage shapes explicitly. Do not design a universal workflow engine, and do not assume showcase ranking, bracket advancement, rubrics, ties, or judge aggregation work the same way across breaking, popping, kids, pairs/duos, crew vs crew, cyphers, or later stages.

## Candidate November Capabilities

These rankings are recommendations for scope discussion, not approved requirements.

### Core Candidates

| Capability                           | Candidate outcome                                                                                               | Validation needed                                                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Registration and roster preparation  | Staff can identify people and their event/category participation without relying on a single paper master list. | Registration source, required fields, golden-ticket handling, duplicate resolution, and who may edit. |
| Check-in                             | Staff can find the correct participant entry and record arrival with visible status.                            | Check-in points, credentials, roles, exception path, and whether activity-level check-in is needed.   |
| Groups/heats                         | A coordinator can assign eligible entries to the selected stage's operating groups and sequence.                | Group count, assignment method, late arrivals, reassignments, and order.                              |
| Judge workspace and evidence capture | A judge can see the correct assigned group and capture only the evidence required by that stage.                | Device availability, evidence format, judge ownership, edits, and connectivity conditions.            |
| Reviewed top-N selection             | Organizers can inspect source evidence, resolve exceptions, and approve qualifiers before use or publication.   | Per-category/stage advancement rule, aggregation method, ties, no-shows, and disqualifications.       |
| Schedule and venue clarity           | Staff and participants can identify the applicable time and place for the selected pilot activities.            | Authoritative schedule owner, change communication, audience, and access method.                      |
| Export and print                     | Organizers can produce human-usable rosters, group assignments, evidence, and approved outcomes.                | Required formats, timing, printer availability, and data minimization.                                |
| Auditability                         | Authorized users can understand who made a material correction or approval, when, and why.                      | Roles, reason requirements, retention, and which actions are material.                                |
| Operational fallback                 | Organizers have a pre-generated export/print contingency and a clear point at which software use stops.         | Connectivity assessment, fallback owner, cutoff criteria, and reconciliation policy.                  |

### Conditional Candidates

| Capability                              | Include only if                                                                                            |
| --------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| QR-assisted access or lookup            | Credentials, issuance, device flow, security boundaries, and a non-QR exception path are approved in time. |
| Participant-facing schedule view        | Organizers can maintain an authoritative schedule and own update communication.                            |
| Golden-ticket registration handling     | Golden tickets apply to the selected November registration flow and their validity rules are confirmed.    |
| Optional evaluation rubric              | The selected category and stage actually uses a confirmed rubric.                                          |
| Workshop enrollment or attendance slice | A workshop is deliberately chosen as part of the November pilot with separate scope and ownership.         |
| Basic versus/bracket view               | A selected November stage uses a confirmed battle bracket after qualification.                             |

### Deferred for November

| Module or behavior                          | November position                                                                                                                                                                                           |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Broad hospitality operations                | **DEFERRED:** Hotels, travel and pickup itineraries, meals, free time, and translators are discovery context, not assumed pilot scope.                                                                      |
| Sponsors and broad guest operations         | **DEFERRED:** Sponsors, battle guest logistics, and broad staff/guest coordination are not part of the candidate core.                                                                                      |
| Merch and inventory                         | **DEFERRED:** Merchandise inventory and sales operations.                                                                                                                                                   |
| Full workshop operations                    | **DEFERRED:** End-to-end workshop administration unless separately selected and approved.                                                                                                                   |
| Complex payments and legal behavior         | **DEFERRED:** Bundle pricing, refunds, taxes, invoices, public-attendee payment, waivers, consent, minor-data rules, and other legal behavior require separate decisions. No compliance claim is made here. |
| Broad May 2027 modules                      | **DEFERRED:** The full organizer operation map is not a November commitment or a May delivery promise.                                                                                                      |
| Unconfirmed scoring and qualification rules | **DEFERRED:** No universal scoring, ranking, aggregation, tie, no-show, or disqualification behavior may be implemented as fact.                                                                            |
| Offline software or synchronization         | **DEFERRED:** This brief does not claim or propose an offline software mode, local queue, or replay capability.                                                                                             |

## Success Metric Candidates

Baselines and targets must be measured or agreed with the design partners. Where evidence is absent, both remain **TBD**.

| Candidate metric                 | Measurement intent                                                                                                                 | Baseline | Target  |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | -------- | ------- |
| Check-in time                    | Median and high-percentile time from participant lookup to confirmed check-in, including exception cases.                          | **TBD**  | **TBD** |
| Roster discrepancies             | Count and rate of duplicate, missing, wrong-category, or unresolved participant entries discovered during operation.               | **TBD**  | **TBD** |
| Assignment errors                | Count of entries assigned to the wrong group, heat, order, category, or stage.                                                     | **TBD**  | **TBD** |
| Time to reviewed top 32          | Elapsed time from the last relevant showcase performance to organizer approval of the top 32.                                      | **TBD**  | **TBD** |
| Manual corrections               | Count of material corrections after initial check-in, assignment, evaluation, or selection.                                        | **TBD**  | **TBD** |
| Schedule/venue support questions | Count of participant or staff questions caused by uncertainty about where or when an activity occurs.                              | **TBD**  | **TBD** |
| Operational continuity           | Duration and impact of any interruption in which the pilot cannot support the active flow, including whether fallback was invoked. | **TBD**  | **TBD** |

The November learning review should also record qualitative evidence: where staff returned to paper, where participants remained confused, which evidence judges trusted, and which software steps slowed the event.

## Operational Safety and Continuity

1. **Organizer review before publication:** A candidate qualifier list or corrected result is not final until an authorized organizer reviews and approves it.
2. **Manual correction with reason and audit:** Authorized staff must be able to correct material operational mistakes while recording who changed what, when, and why. This describes desired connected-product behavior, not a claim that it exists today.
3. **Export and print contingency:** Before live operation, organizers should hold current, human-usable exports or printed copies for the selected roster, schedule, assignments, and other approved contingency information.
4. **Event-continuity principle:** If the product is unavailable, ambiguous, or unsafe, staff follow an organizer-owned manual event procedure rather than stopping the event to protect the software flow. The brief does not define offline software, automatic synchronization, or replay of manual actions.
5. **Visible authority:** Staff must know which source and person can approve roster changes, group assignments, schedule changes, and qualifier publication.
6. **Bounded pilot:** Unselected categories and stages continue under organizer procedures; the product must not imply they are covered.

**UNKNOWN:** Connectivity quality, device availability, printing access, support ownership, and cutoff criteria for November. These are scope-gate facts, not implementation details to discover during the event.

## Product-Level Data and Domain Concepts

These concepts describe product meaning only. They do not prescribe tables, schemas, APIs, identifiers, or service boundaries.

| Product concept               | Product-level meaning                                                                                     | Important separation                                                                                          |
| ----------------------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| Identity                      | A person's basic identity, including the nickname used in the event context.                              | Identity is not the same as registration, attendance, or competition eligibility.                             |
| Event participation           | A person's relationship to one event as competitor, workshop attendee, public attendee, or a combination. | A person may have multiple participation roles in the same event.                                             |
| Discipline registration       | Participation in breaking, popping, or both.                                                              | Discipline does not by itself determine category, stage, price, or eligibility.                               |
| Category entry                | A competitor's registration in a specific category.                                                       | The entry may represent one person or relate multiple registered participants.                                |
| Pair/duo or crew relationship | The event-specific relationship among registered participants competing together.                         | The relationship should not collapse the individual identities of its members.                                |
| Workshop enrollment           | A participant's relationship to a specific workshop.                                                      | Workshop enrollment, venue, schedule, and attendance may differ from competition participation.               |
| Public attendance             | Attendance without competition or workshop participation.                                                 | Payment and access rules are **UNKNOWN**.                                                                     |
| Golden ticket                 | Evidence that may grant free event registration under organizer-defined rules.                            | It affects registration entitlement; it does not automatically define every category or workshop entitlement. |
| Venue and schedule assignment | The approved place and time for an event activity.                                                        | Workshops and competition may use different venues and schedules.                                             |
| Category and stage            | The rule context for an entry and one step of competition.                                                | Rules may differ for every category and stage.                                                                |
| Group/heat and performance    | The operating assignment and actual stage occurrence for a participant entry.                             | Grouping is not itself a score or qualification decision.                                                     |
| Evaluation evidence           | Notes, marks, rubric observations, or decisions captured for a performance.                               | Evidence is separate from organizer review and final advancement.                                             |
| Reviewed qualifier decision   | Organizer-approved advancement based on the applicable stage evidence and rules.                          | A candidate or calculated list is not automatically final.                                                    |

## Assumptions and Unknowns

| Topic                                                                  | Status                                                                                                                                                                                                                                        | Why it matters                                                                         |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| November will include a competition flow suitable for a digital pilot. | **HYPOTHESIS**                                                                                                                                                                                                                                | Determines whether groups, judging, and top-N review belong in scope.                  |
| One category/stage can provide a controlled end-to-end pilot.          | **HYPOTHESIS**                                                                                                                                                                                                                                | Supports a narrow scope but requires organizer agreement.                              |
| Exact November categories and stages                                   | **UNKNOWN**                                                                                                                                                                                                                                   | Scope cannot be approved without them.                                                 |
| Combined registration, workshop, or discipline bundle pricing          | **UNKNOWN / DEFERRED**                                                                                                                                                                                                                        | Must not be encoded as a requirement.                                                  |
| Popping beginner/pro structure                                         | **UNKNOWN**                                                                                                                                                                                                                                   | May affect categories, eligibility, and stage rules.                                   |
| Category-specific rules                                                | **UNKNOWN**                                                                                                                                                                                                                                   | Individual, kids, pairs/duos, crew vs crew, cyphers, breaking, and popping may differ. |
| Scoring, ranking, and judge-note aggregation                           | **UNKNOWN**                                                                                                                                                                                                                                   | The product cannot derive qualifiers safely without confirmed rules.                   |
| Tie, no-show, disqualification, late-arrival, and withdrawal handling  | **UNKNOWN**                                                                                                                                                                                                                                   | These exceptions affect check-in, groups, evidence, and advancement.                   |
| Public-attendee payment and access                                     | **UNKNOWN / DEFERRED**                                                                                                                                                                                                                        | Not required for the candidate competition pilot unless separately selected.           |
| Workshop and venue capacities                                          | **UNKNOWN**                                                                                                                                                                                                                                   | Relevant only to selected workshop or access flows.                                    |
| Connectivity, devices, printers, and support ownership                 | **UNKNOWN**                                                                                                                                                                                                                                   | Determines whether the pilot can operate safely.                                       |
| Current software readiness                                             | **CONFIRMED:** Event/venue/schedule persistence, read API/seed, an `/admin` view, and a partial lifecycle exist. Auth, sessions, accreditation, check-in, competition filters, audit/outbox, operations, and production readiness are absent. | The pilot is not currently operationally ready.                                        |

## Asynchronous Interview Checklist for the Brother

Answers should be recorded separately for each actual category and stage. Do not ask whether one rule applies to the entire event.

### Event and Pilot Selection

- Which breaking and popping categories are planned for November?
- For each category, which stages are planned, in order?
- Which single category and stage would be safest and most valuable for a first pilot?
- What are the expected registration counts for each category and stage?
- Which venues, dates, and schedule windows apply to each selected activity?

### Registration and Check-In, by Category or Activity

- Who creates the roster, from what source, and when is it considered authoritative?
- What information identifies a person, nickname, discipline, category, pair/duo, crew, and workshop enrollment?
- Where does check-in happen, what does staff verify, and what evidence or credential is presented?
- How are duplicate registrations, missing names, nickname differences, category changes, golden tickets, late arrivals, and walk-ins handled?
- Does check-in confirm general event access, a category entry, a workshop enrollment, or several distinct statuses?

### Showcase Qualifier or Filter, by Category and Stage

- Is this stage a showcase qualifier, cypher-based selection, battle bracket, or another format?
- How many groups or heats exist, how are entries assigned, and who can change an assignment?
- What is the performance order and how are absences, late arrivals, withdrawals, or reruns handled?
- How many judges evaluate each group, and may a judge evaluate more than one group?
- Exactly what does each judge record: free notes, marks, rankings, yes/no decisions, rubric criteria, or something else?
- For the observed three-group filter, how were the three judges' notes combined into one top 32?
- Who reviews the candidate qualifiers, what evidence do they see, and who gives final approval?
- How are ties, disagreements, disqualifications, and corrections resolved for this specific stage?

### Battle Stage, by Category and Stage

- Does the selected category proceed to a battle bracket after qualification?
- How are seeds and versus pairings established for that stage?
- What determines a battle winner, and how are ties, judge conflicts, no-shows, or bracket corrections handled?
- When and by whom may a result be published or announced to Hosts and participants?

### Pairs/Duos, Crews, Kids, and Cyphers

- For pairs/duos and crews, who registers the relationship and how are member substitutions handled?
- For kids categories, what operational and guardian decisions must be resolved outside product assumptions?
- When “cypher” is used, does it identify a category, a stage format, a group, or an informal activity?
- Which of these formats, if any, are actually part of November?

### Staff, Equipment, and Continuity

- Who owns registration, check-in, group assignment, judge support, final review, schedule changes, and technical escalation?
- What phones, tablets, laptops, connectivity, power, and printers will be available at each venue?
- What exports or printed records are needed before each stage begins?
- What condition should trigger stopping use of the product and moving to the organizer's manual event procedure?
- After fallback, which corrections or records must be preserved, and who decides whether later reconciliation is permitted?

### Timing and Evidence

- What were the approximate check-in duration, delays, roster discrepancy count, correction count, and time from last performance to top-32 approval at the prior event?
- Which participant questions about schedule and venue were most frequent?
- What minimum improvement would make the November attempt valuable to staff and organizers?

## Reconciliation Impact Preview

This is a preview of planning areas that will need review after November scope is approved. No change is declared here, and no existing planning artifact is modified by this brief.

| Existing planning area       | Later review needed                                                                                                                              |
| ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Release sequencing           | Compare the current Release 1 Accreditation emphasis with a registration/check-in/filter pilot and decide whether sequencing or slicing changes. |
| Event organization           | Confirm whether current event, venue, schedule, and lifecycle concepts are sufficient for the selected multi-venue pilot.                        |
| Participant accreditation    | Review identity, event participation, category entry, golden-ticket evidence, credential, and check-in boundaries.                               |
| Identity and access          | Define the minimum authorized organizer, check-in staff, coordinator, judge, and review roles and sessions.                                      |
| Competition                  | Reconcile category/stage/group/performance/evaluation/review concepts with the selected November formats, without introducing universal rules.   |
| Workshops                    | Decide explicitly whether any workshop enrollment or attendance slice is selected; otherwise preserve deferral.                                  |
| Communications and reporting | Review participant schedule/venue clarity and controlled publication of approved qualifier outcomes.                                             |
| Audit and outbox planning    | Determine the minimum durable record for corrections, approvals, and publication; current capability is absent.                                  |
| Operations and runbooks      | Add only the ownership, fallback, export/print, support, and connectivity procedures required for the approved pilot.                            |
| Tasks and apply progress     | Replan only after scope approval and reconciliation; do not infer completion from current event persistence or `/admin` visibility.              |
| Success evidence             | Establish baselines, target values, measurement ownership, and a post-pilot review record.                                                       |

## Scope Decision Gate

November scope should not be approved until the following facts are available and accepted by the organizers and product owner:

- [ ] Exact November date, venues, and authoritative schedule owner.
- [ ] Exact pilot category or categories and stage sequence.
- [ ] Expected roster size and the source of registration truth.
- [ ] Registration, golden-ticket, and check-in rules for the selected entries.
- [ ] Group/heat assignment and change rules for each selected stage.
- [ ] Judge evidence format and the exact qualifier decision method for each selected stage.
- [ ] Top-N size, organizer review authority, publication point, and exception handling.
- [ ] Staff roles, device availability, connectivity conditions, printer/export needs, and technical support owner.
- [ ] Organizer-owned manual fallback procedure and software cutoff criteria.
- [ ] Approved pilot success metrics, baselines where measurable, and target values.
- [ ] Explicit list of excluded categories, stages, workshops, payments, and broader modules.
- [ ] A feasibility review against current implementation gaps and the time remaining before November.

Passing the gate authorizes later planning reconciliation, not automatic implementation of every core candidate.

## Glossary

| Term                        | Meaning in this brief                                                                                                                                                        |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hosts                       | People who direct and animate the event. Use “Hosts,” not “MCs.”                                                                                                             |
| Battle guest                | An invited competitor or notable participant whose event logistics may require organizer coordination. This is not automatically a competition category or pilot capability. |
| Golden ticket               | Organizer-recognized entitlement that can grant free event registration under rules still to be confirmed.                                                                   |
| Showcase qualifier / filter | A stage in which competitors perform for evaluation and later selection rather than competing in direct versus battles.                                                      |
| Battle bracket              | A structure of direct versus matchups in which results determine advancement through bracket rounds.                                                                         |
| Category                    | A defined competition entry context with its own participants and potentially its own rules, such as individual, kids, pairs/duos, or crew vs crew.                          |
| Stage                       | One step within a category, such as a showcase qualifier or a bracket round, with a specific operating and advancement format.                                               |
| Group / heat                | A stage-specific division used to organize participant entries, order, judging, or simultaneous operation.                                                                   |
| Participant entry           | The person, pair/duo, or crew registered to participate in a specific category and stage context.                                                                            |

## Next Product Decision

Complete the category- and stage-specific brother interview, select the narrowest valuable November flow, establish operational constraints and metric baselines, and then reconcile the approved scope against the existing plan. Until that decision is made, every November capability in this brief remains provisional.
