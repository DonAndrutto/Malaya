# Preview-only image check

`/api/image-check` is a standalone diagnostic for the unresolved physical-iOS
preview report. It is allowed only for Vercel preview deployments or local
development. Production requests return 404 before any catalogue/settings
read; nothing was deployed to production to add it there.

The page bypasses the store layout, Firebase client SDK, Vercel Analytics and
Speed Insights. Its restrictive CSP permits only its fixed hashed script,
same-origin control image and public Firebase Storage image requests. Frames
and third-party scripts, including the preview toolbar, are not permitted.
The original store page remains unchanged.

It uses at most three existing public URLs: hero background, a catalogue
pendant and product p009. Each sample gets a plain eager image, a no-referrer
image, a CSS-background tile set after normal image decoding, and a read-only
HTTP/CORS status probe. A static same-site SVG provides a control. Eight-second
timeouts bound each of the three sequential phases to about 25 seconds total.
No image proxy, bucket/rule change or arbitrary-URL parameter is exposed.

Results contain fixed sample labels, load/decode/error/timeout state, intrinsic
pixel dimensions, coarse elapsed seconds and HTTP/content type when the
browser exposes them. An image error alone does not reveal its HTTP status;
CORS or content blocking can prevent status access. Background tiles remain
visually inspectable; their paint state is not claimed from HTTP alone.

The script does not read or collect user agent, device, account, IP, DNS,
location, cookies or storage identifiers. No diagnostic report is transmitted
or stored. Hosting and Storage services receive ordinary resource requests.
The visible report is limited to 2,500 characters. Copy results is an explicit
user action; no automatic clipboard, upload, analytics or third-party reporting
is used. The user may choose to share the text or a screenshot.

Validation covers production exclusion, fixed control/no database access,
allowed public-asset selection, output escaping, script CSP integrity, privacy
constraints, and local-browser success/failure states with mocked transport.
Those fixtures are not evidence of physical-iPhone transport. The final
preview also needs the real iPhone to open this diagnostic; the iOS failure
remains unresolved until that evidence is available.
