# Handoff: DNYV New Yorker ID Card (design 3a)

## Overview
This is the ID card issued to applicants the Department of New Yorker Verification site **verifies**. Each approved applicant gets one card, front and back. Denied applicants and those "Returned for Insufficient Suffering" get no card.

## About these files
`dnyv-id-template.html` is the **final production template**, not a loose reference. Its layout is fixed pixel-for-pixel, and every inline style is intentional. Your job is to **fill its double-brace tokens from submission data and render it**. Do not re-implement or restyle the card. If your stack needs a component (React etc.), port the markup verbatim and keep the inline styles.

## Fidelity
High-fidelity: final colors, type and positions.

## Files
- `dnyv-id-template.html`: the template. `#front` and `#back` are 1012×638px cards (CR80, 3.375×2.125in at 300dpi).
- `render.mjs`: the reference Node implementation. It exports `buildTokens(applicant)`, `fillTemplate(html, tokens)` and `renderApplicant(applicant, outDir)`. HTML output needs no dependencies; PNG/PDF output needs `puppeteer`.
- `applicant.schema.json`: the input contract.
- `sample-applicant.json`: the Maria Esposito example.
- `example-filled.html`: the sample already filled in. Open it in a browser to see the expected result.
- `screenshots/front.png`, `screenshots/back.png`: reference renders of the sample at 1012×638. Use them for visual regression checks against your output.

## Pipeline
1. When a submission is approved, build an applicant object matching `applicant.schema.json`.
2. `buildTokens(applicant)` produces the token map. All derivations below live here.
3. `fillTemplate(template, tokens)` produces the HTML. Every value is HTML-escaped, and a missing token throws.
4. Render in headless Chromium at 1012×638, deviceScaleFactor 1 (use 2 for retina web display). Add `body.render` to strip the preview padding. **Wait for `body[data-ready="1"]`**, which is set once webfonts have loaded and the long-text auto-fit has run.
5. Screenshot `#front` and `#back` with `omitBackground:true` so the rounded corners stay transparent. Alternatively, use `page.pdf` for a 2-page PDF; the print CSS squares the corners for die-cutting card printers.

## Tokens
- **id_display**: `NY{d0} · {d1-4} · {d5-8}`, e.g. NY7 · 0419 · 2261
- **id_compact**: `NY` + 9 digits, e.g. NY704192261
- **surname / given_names**: uppercased
- **signature_name**: as given; otherwise first given name + surname
- **dob, verified_date**: MM/DD/YYYY
- **expires**: Track 1 is `NEVER`; Track 2 is verified_date + 10 years
- **borough / borough_code**: manhattan→MANHATTAN/MAN · brooklyn→BROOKLYN/BKN · queens→QUEENS/QNS · bronx→THE BRONX/BRX · staten_island→STATEN IS./STI
- **basis**: Track 1 `ORIGIN`, Track 2 `EXPER.`
- **track_chip**: `Track 1` / `Track 2`
- **status**: `VERIFIED` / `PROVISIONAL`
- **permanence**: the back-of-card sentence, fixed per track (see render.mjs)
- **mrz1 / mrz2 / mrz3**: machine-readable zone (see below)
- **photo_src**: URL or data URI
- **hologram_display**: `flex` or `none`

## MRZ (ICAO 9303 TD1 style, 3 lines × 30 chars)
- **Line 1:** `NYV9` + borough code + 9 digits, padded with `<`.
- **Line 2:** DOB YYMMDD + check digit, `<`, expiry YYMMDD + check digit (Track 1: `<<<<<<<`), borough code, padded to 29, then a composite check digit.
- **Line 3:** `SURNAME<<GIVEN<NAMES`, with accents stripped, non-letters turned into `<`, and truncated to 30.
- Check digits use weights 7-3-1 (`checkDigit()`). The MRZ is decorative and nothing scans it, but it is internally consistent.

Sample:
```
NYV9QNS704192261<<<<<<<<<<<<<<
8703145<<<<<<<<QNS<<<<<<<<<<<2
ESPOSITO<<MARIA<ELENA<<<<<<<<<
```

## Text fitting
The surname (40px), given names (28px), signature (56px) and borough (20px) carry `data-fit`. The inline script steps them down 1px at a time until they fit, with a 10px floor. Surnames fit about 24 characters before shrinking. Always render in a real browser so this script runs.

## Photo
Use a portrait photo, ideally 4:5 and at least 512×640. It is displayed at 256×320 with `object-fit:cover`, focused 30% from the top. Correct the orientation (EXIF) server-side. Inline the photo as a data URI before rendering so Chromium never waits on a remote fetch.

## Fixed (not per-applicant)
These stay the same on every card: the header, seal, microprint strip (including "Art object · not a government document"), Class 9, the §3307 restriction, endorsements B/T/M/D, the Verifier General signature, the barcode art, and the back disclaimer "An independent art project. Not affiliated with the City of New York." **Never remove the two disclaimers.** They are the project's parody and legal cover.

## Design tokens
- Navy `#13306B`: header, rules, outlines
- Orange `#E8651C`: 5px accent line, ID number, field numerals, microprint strip, expiry
- Card `#F6F6F1` · Ink `#16181D` · MRZ panel `#E6E9EF` · Signature ink `#1b2a55`
- Type: Archivo Black (display), Archivo 800 (given names), IBM Plex Mono (labels, data, MRZ), Mrs Saint Delafield (signatures). All come from Google Fonts; self-host them in production for deterministic renders.
- Card: 1012×638, 36px radius

## Assets
There are no image files. The seal, hologram, guilloche and barcode are all CSS. The only external input is the applicant photo.
