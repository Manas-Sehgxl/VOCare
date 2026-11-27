# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Patients at a government hospital OPD in India.** Many have travelled in from villages since early morning. Primary users are rural patients, older adults and people who cannot comfortably read or write. They speak Hindi, English or mixed Hindi-English, often with Bhojpuri- or Awadhi-influenced pronunciation. Most have never used a kiosk. Their job: get registered and receive an OPD token without typing and without depending on a relative or stranger.
- **Registration staff.** Clerks at the registration counter (desktop) and helpers on the floor (tablet). Their job: pick up patients who asked for help, correct details, confirm the department, print slips.
- **Hackathon judges (current audience for the prototype).** They open the app in a laptop browser and watch a 3-minute demo video. Design must read well there first.

## Product Purpose

A voice-first OPD registration kiosk. The patient speaks name, age, village and complaint, hears it read back, corrects anything misheard, and receives a sequential token (OPD-001…). Staff see registrations and help requests live. Success (planned pilot targets, not measured): 30% lower median registration time, 80%+ of voice attempts completed without staff typing, under 2% of confirmed records needing later correction.

## Positioning

Registration as a short conversation with a patient hospital worker, not a form. The patient's own words are preserved (unfamiliar names and village names are never replaced; the complaint is kept verbatim beside any translation), and nothing is submitted without spoken readback and explicit confirmation.

## Operating Context

- Noisy hospital registration hall; patients may stand close to the screen or a little away; staff may be busy.
- Conversation: language choice → consent → name → age → village (district only if ambiguous) → complaint → review and correction → token and slip.
- Repeat, Correct and Get Help are always available by touch and by voice.
- Failure handling: background noise, accents, mixed language, misheard input, silence (10 s), two failures → staff assistance with answers kept.
- Staff statuses: Needs Assistance, Awaiting Department Review, Registered.
- Kiosk clears itself after completion, cancellation or inactivity.

## Capabilities and Constraints

- Static front end (`dist/`, plain HTML/CSS/ES modules, no build step) served by a Go standard-library server (`server/`) with a JSON API and Server-Sent Events. Started with `docker compose up`; must run without API keys.
- Speech via the browser Web Speech API (hi-IN / en-IN) and speechSynthesis; demo mode simulates speech through the same parser.
- Demo departments only: General OPD, Dental, ENT. Routing is mock and administrative; no diagnosis, treatment advice or waiting times.
- No smartphone, email or Aadhaar required. No raw audio retained.
- Form factor: undecided hardware; design for a laptop browser first (judging and demo video), must also work on a touch kiosk/tablet and a phone. Staff dashboard: desktop first, usable on a tablet.

## Brand Commitments

- Name: **VOCare** (voice + care; renamed from Bol OPD on 2026-11-27).
- Calm white UI with one teal accent (chosen by the user 2026-11-27, replacing the Material 3 and slip looks).
- Bilingual copy, Hindi in Devanagari for display and speech.

## Evidence on Hand

- Working prototype with tested conversation logic (`dist/parse.js`, `test/parse.test.mjs`, `server/store_test.go`).
- Fictional demo data only (Savitri Devi, Ramnagar). No real patients, hospital partners, testimonials, pilot results or photographs exist; do not fabricate any.

## Product Principles

1. The patient never has to read or type to finish; every screen works by voice and by one obvious touch.
2. Never silently change what the patient said; show it, read it back, let them fix it.
3. Help is always one step away, and asking for it never loses progress.
4. Honest about being a prototype: simulated speech, mock routing and planning estimates are labelled as such.

## Accessibility & Inclusion

Low literacy, older eyes and hands, unfamiliar with touchscreens. Very large targets and type, high contrast, minimal text, spoken instructions for everything shown, state of the microphone always visible, no time pressure without warning.
