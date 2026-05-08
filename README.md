# Internet/System Health HUD

A simple static dashboard that shows internet and endpoint health in a fullscreen heads-up display. It is designed for always-on wall tablets, older iPads, and kiosk-style monitoring screens.

## Features

- Fullscreen, no-scroll layout with large, room-readable typography
- Dark monitoring-style interface
- Overall status states: `ONLINE`, `DEGRADED`, `OFFLINE`, and `CHECKING...`
- Periodic checks against up to 10 lightweight endpoints
- Per-endpoint status, latency, and last checked time
- Hidden controls modal that appears on tap and auto-hides after 10 seconds of inactivity
- Configurable auto-refresh interval: `15s`, `30s`, or `60s`
- Editable default endpoints and support for adding or removing endpoints
- Scrollable endpoint-status list and scrollable endpoint editor list
- Simple stability counter that shows how long the system has remained fully healthy
- No frameworks, no build step, no dependencies

## Files

- `index.html` - App structure and controls
- `styles.css` - Fullscreen kiosk styling
- `app.js` - Status logic, endpoint checks, timers, and UI updates

## How It Works

The app runs entirely in the browser using plain JavaScript.

1. On startup it shows `CHECKING...`
2. It performs network checks against a configurable list of up to 10 endpoints
3. By default, the first two endpoints are:
   - `https://www.google.com/generate_204`
   - `https://cloudflare.com/cdn-cgi/trace`
4. You can edit those defaults, add more endpoints, disable endpoints, or remove endpoints from the controls modal
5. Each check records:
   - Reachability (`OK` or `FAIL`)
   - Approximate latency in milliseconds
   - The time of the last completed check
6. The overall status is calculated as:
   - `ONLINE` when all active endpoints are reachable
   - `DEGRADED` when some succeed and some fail
   - `OFFLINE` when all active endpoints fail

The page never reloads. It updates the DOM in place and reuses the same UI nodes to keep memory use low.
The overall page does not scroll. If the endpoint list grows, only the endpoint-status panel scrolls. When controls are open, the modal stays fixed and only the endpoint editor list inside the modal scrolls.

## Running Locally

No install is required.

1. Download or clone the files
2. Open `index.html` directly in Safari or any modern browser

Because this is a static app, it can run from the local filesystem without a server.

## Deploying to GitHub Pages

1. Push these files to a GitHub repository
2. In GitHub, open `Settings`
3. Open `Pages`
4. Set the source to your main branch (or the branch you want to publish)
5. Save the settings
6. Wait for GitHub Pages to publish the site

After publishing, open the GitHub Pages URL on the wall-mounted tablet.

## Safari 12.1 Compatibility Notes

This project was written to stay compatible with Safari 12.1:

- Plain HTML, CSS, and vanilla JavaScript only
- No React, Vue, Angular, npm, bundlers, or build tools
- No ES modules
- No TypeScript
- No optional chaining
- No nullish coalescing
- No `async` / `await`
- Conservative JavaScript style with `var`, classic functions, and basic DOM APIs

The endpoint checks use `fetch()` with Promises and a manual timeout wrapper. That keeps the code small while remaining compatible with Safari 12.1.

## Endpoint and Browser Notes

For cross-origin URLs, browsers often limit access to response details. This app treats a successful `fetch()` resolution as "reachable" and a rejected or timed-out request as "failed".

That means:

- Latency is measured from the browser side
- Reachability is reliable for simple monitoring
- Full HTTP response inspection is not guaranteed for third-party endpoints

If you want stricter health semantics for a custom endpoint, use a lightweight URL you control and keep it simple and fast.

## Customizing Endpoints

Open the controls modal and use the `Endpoints` section to manage the list.

You can:

- Edit the label and URL for any endpoint, including the two default endpoints
- Enable or disable endpoints without deleting them
- Add more endpoints until you reach the 10-endpoint limit
- Remove endpoints you no longer want to check

All endpoint settings are saved in `localStorage`, so they persist on the device.

## Suggested Kiosk Usage

- Add the page to the iPad home screen
- Enable Guided Access or kiosk mode if needed
- Keep auto-refresh on
- Use the default details view for diagnostics, or hide details for a cleaner distant-view display
