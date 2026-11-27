---
version: 1
slug: "dist-index-html"
primary_target: "dist/index.html"
related_targets: ["dist/app.js","dist/style.css"]
---

# Kiosk and staff desk

Scope: all kiosk screens (welcome, consent, conversation, review, token, staff assistance) and the staff dashboard. Mode: Operate.
Audience and job: see PRODUCT.md. The patient finishes registration by voice; staff clear the help queue and confirm departments.
Constraints: Material 3 components (user's binding ask); judged in a laptop browser first; app logic in app.js is tested and keeps its data-act hooks.
Quality bar the user named: Wispr Flow's site (calm warm ground, serif display, pine green, outlined pill buttons, flowing-words art).

## Direction contract

THESIS: Registration is a conversation that writes itself onto the patient's parchi. Refuses the template kiosk of a form card with a mic button and the generic Google-sample Material look.
OWN-WORLD: warm butter ground (#fbf7e6), ink #191915, hospital pine green #0b4f45 for the slip and filled surfaces, marigold #ffd88a reserved for the step you are on, vermilion #d2462e only for Get help. Tiro Devanagari Hindi for questions and values, Mukta for everything else. M3 components: pill buttons, outlined and tonal, navigation-bar controls, filter chips, side sheet, switch.
STORY: the patient hears and sees one question, speaks, watches their words flow into the slip, fixes anything, and leaves with the token stamped on that same slip. Staff see the queue and act in one click.
FIRST VIEWPORT: conversation screen at 1440x900: wordmark with waveform mark on the left of the top bar, demo chip and हिन्दी/English toggle on its right; left two-thirds: large serif question (the step lives in the slip header, since a step label above the question is an eyebrow the craft floor bans), outlined waveform mic pill with "heard" line, white answer plaque with Change; right third: pine "आपकी पर्ची" slip with the four fields, current one marigold; a dark ribbon of the patient's own words flowing from the mic to the slip; bottom bar Repeat, Correct, Get help (vermilion), Cancel.
FORM: seed:09cb3f743cbce2e0 rolled; user took canon (Material 3 played straight), then steered it with mockups toward the Wispr Flow quality bar plus Bol OPD's own slip and words-ribbon (mockup d-bol).
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
