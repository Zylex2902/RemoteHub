# Trademarks: how this project refers to other brands

Hub Remote works with hardware made by the LEGO Group, and has no relationship with it. The rules
below keep that clear. They follow referential (nominative) use: naming another company's product
to say what ours works with, honestly and no more than needed. Comparable projects, such as
Pybricks, describe their compatibility the same way. This is a working checklist, not legal advice.

## Rules

1. **Our own identity carries no LEGO marks.** No "LEGO", "SPIKE" or other LEGO trademarks in the
   app name, repository name, package identifiers, icon, logo, domain or URL path.
2. **Describing compatibility is fine, also prominently.** "LEGO®" and the product names
   ("SPIKE™ Prime", "SPIKE™ Essential") may appear in headings, marketing text on the website,
   help texts and in the app where they name the hardware, e.g. "Drive your LEGO® Education
   SPIKE™ Prime hub" or "Recognised as SPIKE™ Prime hub". Always as a description of the hardware,
   never as part of our name or a slogan that suggests a partnership.
3. **Symbols:** use ® for LEGO and ™ for SPIKE at least at the first mention on a page or screen.
4. **Disclaimer:** every page or screen set that uses a LEGO trademark carries it (on the website
   in the footer, in the app in Settings → About):
   "LEGO® and SPIKE™ are trademarks of the LEGO Group, which does not sponsor, authorize or
   endorse this project."
5. **No suggestion of endorsement:** no "official", "certified", "by LEGO", and no co-branding.
6. **No LEGO imagery:** no LEGO logo, minifigure, brick or stud imagery, product photos from
   LEGO, screenshots of LEGO apps, or LEGO's red-and-yellow look. Screenshots of our own app are
   fine. **One exception, decided by the owner:** inside the app, the building-guide viewer may
   draw 3D bricks from LDraw files (the user's own models and our own example), using the LDraw
   parts library as fan tools do. Such 3D drawings stay out of the website, the landing-page
   screenshots and any store listing or store screenshots, and the viewer never shows LEGO's own
   instructions or set models.
7. **App stores are stricter than the law:** the store name, subtitle, short description and
   keywords carry no third-party marks (Apple guideline 2.3.7, Google Play impersonation policy).
   Compatibility goes in the long description, with symbols and the disclaimer.
8. **Other brands:** no Apple or Google store badges until there is a published store app (their
   badge rules only allow them for live apps); "Scratch" and its cat are MIT trademarks and are not
   used. Plain words like "App Store", "Google Play", "iPhone", "Android" may describe availability.
9. **Building instructions are LEGO Education's.** We link to their instruction pages (a plain link
   that opens their site) and may name the models to say which one a profile fits, but we never copy,
   host, embed or redraw their instructions, pictures or PDFs. Our wiring diagram is our own
   schematic of a hub with its port letters, not a picture of the product.
10. **LDraw:** credit "The LDraw Parts Library" (CC BY) wherever its parts are used, with the
   licence terms one tap away (the building guide shows both, with a link to www.ldraw.org).
   "LDraw" may describe the file format, with ™ and the notice that it is a trademark of the Estate
   of James Jessiman, but never appears in our app name, titles or URLs (that is why the files live
   under `/app/bricks/`), and nothing suggests that LDraw.org endorses us
   (https://www.ldraw.org/legal-info, https://www.ldraw.org/article/239.html).
11. Keep `THIRD-PARTY-NOTICES.md`, `licenses/` and the comment at the top of `src/base.html` when
   redistributing.
12. A disclaimer does not make an otherwise misleading use acceptable.

## Why

- Trademark law (EU: art. 14 of the EU Trade Mark Regulation; US: nominative fair use) allows
  naming another company's product to indicate what yours is for, as long as it is honest and does
  not suggest a connection. Charging money does not by itself change that; implying endorsement
  or copying the look does.
- The LEGO Group's Fair Play page is its policy for fan use, not the legal limit; it does watch
  commercial use, so the rules above stay on the safe side of referential use.
- Apple and Google reject apps with third-party brand names in store titles, even with an
  "unofficial" label.

## Money

- A free app with an optional donation is fine in principle. Keep the donation tied to the
  developer ("Support the developer of Hub Remote"), never to a LEGO trademark.
- Paid features or licences (as Pybricks does for block coding) do not change the rules above,
  but make the project more visible: have a trademark lawyer look at it before charging.
- Put a donation link on the website. Apple requires in-app purchase for tips inside an app,
  and Google Play has removed apps for external donation links.

## Technical caveat (not a trademark issue)

The upload and start protocol is publicly documented by the LEGO Group under Apache-2.0. The live
channel on the hub (`hub.config['module_tunnel']`) is not documented and may change.
