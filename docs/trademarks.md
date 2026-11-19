# Trademarks: how this project refers to other brands

Hub Remote works with hardware made by the LEGO Group, and has no relationship with it. The rules
below keep that clear. They follow the LEGO Group's published Fair Play guidelines and the store
policies of Apple and Google. This is a working checklist, not legal advice.

## Rules

1. No "LEGO" or "SPIKE" in the app name, repository name, package identifiers, icon, logo, domain
   or URL path.
2. Compatibility is stated descriptively, in body text, with the trademark symbols:
   "works with the LEGO® Education SPIKE™ Prime hub".
3. Wherever a LEGO trademark appears, the disclaimer appears too:
   "LEGO® and SPIKE™ are trademarks of the LEGO Group, which does not sponsor, authorize or
   endorse this project."
4. No LEGO logo, minifigure, brick or stud imagery, product photos from LEGO, or screenshots of
   LEGO apps. No red-and-yellow brick look for the UI or icon.
5. Store metadata (name, subtitle, short description, keywords, screenshots) carries no
   third-party marks. Compatibility goes in the long description only.
6. Keep `THIRD-PARTY-NOTICES.md`, `licenses/` and the comment at the top of `src/base.html` when
   redistributing.
7. A disclaimer does not make an otherwise misleading use acceptable.

## Why

- Fair Play is written for non-commercial references to LEGO products; the LEGO Group says it
  watches commercial use of its trademarks closely. A free app is the lowest-risk form.
- Apple's review guideline 2.3.7 forbids packing metadata with trademarked terms; apps have been
  rejected for a third-party product name in the subtitle.
- Google Play treats prominent third-party brand names in a title as impersonation, and says an
  "unofficial" label does not fix that.

## Money

- A free app with an optional donation is fine in principle. Keep the donation tied to the
  developer ("Support the developer of Hub Remote"), never to a LEGO trademark, and do not put
  features behind it.
- Put the donation link on the website. Apple requires in-app purchase for tips inside an app,
  and Google Play has removed apps for external donation links.
- Before selling the app or bundling it with a paid product, have a trademark lawyer look at it.

## Technical caveat (not a trademark issue)

The upload and start protocol is publicly documented by the LEGO Group under Apache-2.0. The live
channel on the hub (`hub.config['module_tunnel']`) is not documented and may change.
