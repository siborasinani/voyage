# Voyage

A full-stack, collaborative trip-planning app: discover real places, build a day-by-day itinerary, track a budget, and plan a trip together with friends — all backed by a real accounts system with database-enforced permissions.

[Live Demo](https://voyage-puce-pi.vercel.app)

## Overview

Planning a trip usually means juggling a search engine, a spreadsheet, a maps app, and a group chat. Voyage puts that in one place: search real destinations and places, save the ones you like, turn them into a scheduled itinerary, track what things cost, and share the whole trip with the people you're traveling with — each with their own Owner, Editor, or Viewer role.

It's built and run as a real product, not a static mockup: real accounts, a real Postgres database with row-level access control, and real third-party data for places and photos.

## Features

- **Explore** — search any city and browse real places (attractions, restaurants, cafes, and more) via live place data, with photos where available.
- **Trip creation & itinerary** — a day-by-day schedule generated from a trip's own start/end dates, with timed activities, categories, and overlap warnings.
- **Saved places & map** — save a place to a trip before committing it to a day, and see everything with real coordinates plotted on an interactive map.
- **Packing lists** — a simple, trip-level checklist.
- **Personal budgets** — a private budget per collaborator.
- **Group/shared expenses** — shared costs with equal-split balances between collaborators.
- **Friends & trip collaboration** — send and accept friend requests, then invite a friend to a trip.
- **Owner/Editor/Viewer permissions** — each collaborator's access is enforced by role, down to the database level.
- **Trip invitations & notifications** — invite collaborators and see a live feed of trip activity.
- **Calendar export** — download a trip's itinerary as a real `.ics` file for any calendar app.
- **Printable itineraries** — a print-friendly itinerary view via the browser's own print dialog.
- **Authentication & account management** — sign up/in/out, password recovery and change, editable display name and profile photo, and account deletion.
- **Responsive design** — a consistent experience from desktop down to mobile.

## Tech Stack

- **React 19** + **Vite** — plain JavaScript, no TypeScript, no UI framework.
- **Supabase** — Postgres database, Authentication, and Row Level Security.
- **Geoapify** — geocoding, city autocomplete, and place search; the source of truth for place data.
- **Pexels** — place photography.
- **Leaflet** — the interactive trip map.
- **CSS** — one hand-written stylesheet, no CSS framework.
- **Vercel** — hosting and deployment.

No router library and no state-management library: navigation is synced to the URL by hand via the native History API, and application state lives in `App.jsx`.

## Architecture / Technical Highlights

- **Supabase as the source of truth.** Every trip, activity, saved place, expense, and friendship lives in Postgres, read and written through a thin `src/services/` layer — components never talk to Supabase directly.
- **Database-enforced permissions, not just UI gating.** Hiding an Edit/Delete button from a Viewer is a UX convenience; the real boundary is Row Level Security. Every trip-scoped table's access rules are enforced by two reusable Postgres helper functions — `is_trip_member(trip_id)` and `trip_role(trip_id)` — applied consistently across the schema rather than a bespoke policy per feature, so a request that shouldn't be allowed is rejected by the database itself regardless of what the client sends.
- **Owner/Editor/Viewer collaboration**, invitations, and notifications, all backed by that same RLS model.
- **Two external APIs used deliberately, not interchangeably.** Geoapify is the sole source of place/city data; Pexels is optional photography layered on top — the app works correctly with no Pexels key at all.
- **A request-conscious image strategy.** Explore photos are fetched as shared city/category pools (one request can serve many places) rather than one request per place, with the results cached client-side so repeat visits and Trip Cards reuse what's already been fetched instead of re-requesting it. The four fixed "Popular Destinations" on the homepage ship as bundled local images instead, since they never change and don't need a live API call to render reliably.
- **URL-synced routing with no router dependency.** `src/utils/routing.js` maps the app's own page state to and from a real URL (`/explore`, `/trips/:id`, and so on), so refresh, Back, and Forward all behave like a normal multi-page site.
- **`.ics` calendar export and print-friendly itineraries**, both generated client-side from a trip's existing data — no separate export service.

## Authentication & Permissions

Accounts are handled by Supabase Auth: sign up, sign in/out, password recovery by email, and changing your password from Settings. Display name, username, and profile photo are editable from the Profile page; deleting an account permanently removes it along with the trips it owns.

Each trip has one **Owner** and any number of invited collaborators:

- **Owner** — full control over the trip, including inviting and removing people.
- **Editor** — can add, edit, and delete itinerary items, saved places, packing items, and expenses.
- **Viewer** — can see everything on the trip, but can't add, edit, or delete anything.

These roles are enforced by Row Level Security in Postgres, not by frontend checks alone — the database itself rejects a disallowed request no matter what the client sends.

## Getting Started

### Prerequisites

- Node.js
- A free [Supabase](https://supabase.com/) project
- A free [Geoapify](https://www.geoapify.com/) API key
- Optionally, a free [Pexels](https://www.pexels.com/api/) API key (place photos are skipped gracefully without one)

### Setup

1. Clone the repository and install dependencies:

   ```bash
   git clone https://github.com/siborasinani/voyage.git
   cd voyage
   npm install
   ```

2. Create a `.env` file in the project root with the following variables:

   ```bash
   VITE_GEOAPIFY_API_KEY=your_geoapify_api_key
   VITE_PEXELS_API_KEY=your_pexels_api_key
   VITE_SUPABASE_URL=your_supabase_project_url
   VITE_SUPABASE_ANON_KEY=your_supabase_anon_public_key
   ```

   - `VITE_GEOAPIFY_API_KEY` — place search, city autocomplete, and geocoding. Get a key from your [Geoapify dashboard](https://www.geoapify.com/).
   - `VITE_PEXELS_API_KEY` — optional place photos; the app runs fine without it. Get a key from the [Pexels API](https://www.pexels.com/api/).
   - `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` — from your Supabase project's Settings → API. The anon key is Supabase's public client key, safe to ship to the browser — access control is enforced by Row Level Security, not by keeping it secret. Never use the `service_role` key here.

3. Set up the database: in your Supabase project's SQL Editor, run every file in `supabase/migrations/` in numeric order, once. This creates the tables, functions, and Row Level Security policies the app relies on.

4. Start the development server:

   ```bash
   npm run dev
   ```

Other commands:

```bash
npm run build     # production build
npm run lint      # ESLint
npm run preview   # preview a production build locally
```

## Project Structure

```
src/
  components/    UI components (one file per component)
  services/      The only layer that talks to Supabase
  utils/         Pure helper functions (dates, itinerary math, budget math, routing, ...)
  App.jsx        Top-level state and page routing
  App.css        All styling
supabase/
  migrations/    Numbered, hand-run SQL migrations, each documenting its own reasoning
```

## Deployment

Voyage is deployed on [Vercel](https://vercel.com/) as a static single-page app, backed by a hosted Supabase project.

[Live Demo](https://voyage-puce-pi.vercel.app)

## What I Built

Voyage started as an exercise in building a real product end to end rather than a single UI or a CRUD demo: a real permission model enforced where it actually matters (the database), real integrations with third-party APIs designed around their rate limits rather than around ignoring them, and a deliberately small dependency footprint — no router, no state-management library, no CSS framework — in favor of understanding and owning what the app actually does. It's an actively developed personal project, not a finished commercial product, but every feature listed above is implemented and working end to end.
