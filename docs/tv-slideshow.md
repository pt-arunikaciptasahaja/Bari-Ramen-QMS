# TV slideshow from Google Drive

Source folder: https://drive.google.com/drive/folders/1wWndTHaR5FNv4FRu5SC-QvRoJ9GkpGJk

## Use

Upload JPG/JPEG, PNG, WebP or AVIF directly into this folder. The files and folder must stay viewable through the public sharing link; the TV never signs into a Google account. Only direct child images are shown, not videos, PDFs, SVGs, shortcuts or subfolders. Name files `01-...`, `02-...` to set the order. Removing a file or moving it out of the folder removes it from the next refreshed list. A newly uploaded file appears automatically. No deployment is needed for media changes.

The screen advances every 10 seconds and requests a fresh list every 60 seconds, also checking when the network reconnects or the screen becomes visible. Server metadata cache lasts 30 seconds per warm instance; expired metadata is refreshed synchronously, without stale-while-revalidate. Updates normally appear in about 1–2 minutes, subject to Google availability/cache. Photos fill the entire card with centered cover sizing, as requested for the TV design. Images with a different aspect ratio are cropped at the edges; keep important poster text near the center. There is no colored letterboxing. Media stays separate from queue calls/audio/scheduling.

## Runtime access and fallback

`/tv` still requires staff sign-in. In Production, both `/api/tv/slides` and `/api/tv/slides/image` verify the staff session/role before accessing Drive. The image endpoint accepts only validated IDs that occur in the current fixed folder listing; it is not an open proxy. Tokens never enter image URLs. Demo/Preview, which already uses local demo queues without production credentials, may read these public marketing files without a Supabase session.

No Google credential was supplied or created. The active implementation therefore uses a **best-effort public-folder HTML adapter**, verified against the supplied folder's 12 images on 26 October 2026. This is not an official Google API contract and can break if Google changes its public page layout, blocks requests or introduces pagination. Unknown/login/partial layouts fail closed. The public adapter refuses lists of 50 or more rows to avoid treating a potentially truncated page as complete. Keep this public folder small; use the supported API option for larger folders or a more stable metadata integration.

Optionally set a server-only `GOOGLE_DRIVE_API_KEY` restricted to the Google Drive API. The implementation then uses the official Drive v3 files.list API, follows pagination and tracks file revisions. It accepts up to 200 supported images. Never use a NEXT_PUBLIC variable for this key. No API key or OAuth credential is extracted from Google's public page or bundled into the TV.

Unavailable images are skipped as the slideshow rotates. Previously loaded media is retained only briefly when metadata refresh fails; the client rejects metadata older than 2 minutes, and the screen falls back to the existing Bari Ramen brand image. Deleted IDs disappear immediately after a successful list refresh. Empty folders also show the brand fallback. An outage does not stop or change queue processing.

## Image pipeline

Only Google thumbnail redirects on allowlisted HTTPS Google media hosts are followed. HTML/SVG/non-image responses are rejected. Fetches have timeouts, streamed bodies are size-limited (4 MB listings / 12 MB images), and decoding is capped at 25 million pixels. A local server-side sharp pipeline preserves proportions, honors orientation, limits images to 1200px and produces WebP. The initial 2.88 MB public sample became 86 KB in verification. Metadata/images use bounded cache lifetimes; no queue/ticket/session response is stored in these media caches.

## Verification

Tests cover public additions/deletions, natural order, unsupported files, parser failures, pagination and revisions, credential exclusion, oversized streams, hostile redirects and unauthorized Production route access. Live read-only verification lists the 12 source images and retrieves/optimizes an actual image. No files in the user's Drive were added, deleted or edited by these checks. Preview browser verification uses demo queue data; Production anonymous API requests must return 401.
