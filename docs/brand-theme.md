# Bari Ramen visual reference

The palette follows the two Instagram screenshots supplied by the owner on 22 October 2026. These are screenshot samples, not verified official brand specifications.

- Navy `#1D2848`: median RGB of dark blue pixels inside the profile avatar, excluding the story ring and white logo. Both screenshots produce the same sample.
- Cobalt `#2D3EE9`: median of solid blue headline pixels in the ramen post. Used for accents and TV feature type.
- Textured blue `#2652AA`: approximate median of a clear backdrop area in the gyoza post; reference only.
- White `#FFFFFF`: page and TV backgrounds.
- Japanese brand lettering: `バリラーメン`, transcribed from the supplied post. Keep operational instructions in Indonesian.

The original transparent logo remains unchanged. Its CSS frame provides the navy background.

## TV food image

`public/brand/bari-ramen-bowls-source.jpg` is the owner-supplied first screenshot, preserved without retouching. A fixed-aspect CSS frame displays only the ramen image region (source x=0..709, y=620..980). Instagram controls, personal status bar and historical offer copy are outside the visible frame. Do not display the old promotion as a current offer.

The feature uses a local Next.js Image asset, without an Instagram embed, external request or tracking. Cap its displayed width at the source width. The photo is secondary to queue information and is hidden on landscape screens at or below 740px height to preserve call details and waiting-list space. ResizeObserver continues to calculate waiting-list capacity from the remaining area.

A future original product photo can replace the screenshot source and remove the CSS frame. No queue, push, scheduler, privacy or database behavior is changed by this theme.

## Customer navigation and TV access

Customer-facing navigation does not link to `/staff` or `/tv`. The TV page requires the same staff-account check as the dashboard; queue subscriptions and audio mount only after that check passes. Guests who open `/tv` directly see staff sign-in. Staff can still open the TV screen from their dashboard and the TV device must sign in once with an authorized staff account. Customer registration, private tickets and public board data needed to calculate their waiting position remain available.

## App icon revision — 24 October 2026

Use the owner's new opaque JPEG (`public/brand/app-icon-source.jpg`) for app icons. Keep this source unchanged and separate from the existing page-header logo. `renderAppIcon` frames the original image proportionally around the artwork center (626, 642) in the 1254px source, correcting the source's slight vertical offset. A 730px square frame gives about 86% logo width with balanced margins. Do not pre-round the icon or introduce transparent corners; the OS supplies its own outer mask.

A dedicated `/apple-touch-icon.png` provides an opaque 180px iOS icon. The PWA uses 192px and 512px square icons plus a separate 512px maskable variant, whose wider 800px source frame keeps the mark inside the central 80% circle. Browser, Apple, manifest and notification icon URLs carry the `ios-fit-20261024` revision to avoid reusing the previous URL. Existing Home Screen installations may retain their old icon until re-added by the user.
