# Voyage

A collaborative trip-planning web app. Plan a trip with friends, discover real places, build a day-by-day itinerary, see saved places on a map, prep with a packing checklist, track a personal or shared budget, and export the result to a calendar or a printed page — all backed by a real accounts system with per-trip Owner/Editor/Viewer roles enforced at the database level.

## What it does

Voyage covers one trip end to end:

- **Explore** — search and browse real places (Geoapify), with photos where available (Pexels).
- **Saved Places** — save a place to a trip without committing it to a day yet.
- **Map** — saved places that came from Explore (and so already carry real coordinates) shown on a map.
- **Itinerary** — a day-by-day schedule built from the trip's own dates, with timed activities, categories, and overlap warnings.
- **Packing checklist** — a simple, trip-level list of things to bring.
- **Budget** — a personal budget per collaborator, plus shared/group expenses with equal-split settlements.
- **Friends & collaboration** — send/accept friend requests, invite a friend to a trip as an Editor or Viewer, and collaborate on the same trip in real time (on refresh).
- **Calendar export & printable itinerary** — download a real `.ics` file, or print/save the itinerary as a PDF via the browser's own print dialog.

## Tech stack

- **React 19** + **Vite**, plain JavaScript (no TypeScript, no CSS framework — one hand-written stylesheet).
- **Supabase** — Postgres database, Auth (email/password, password recovery), and Row Level Security.
- **Geoapify** — geocoding, city autocomplete, and place search (the one source of truth for place data).
- **Pexels** — optional place photos.
- **Leaflet** + **OpenStreetMap** tiles — the map.
- No router library and no state-management library: navigation is synced to the URL by hand via the native History API, and all state lives in `App.jsx`, passed down via props.

## Architecture

- **Frontend**: React components in `src/components/`, one `src/App.jsx` owning top-level state and routing, one `src/App.css` for all styling. A thin `src/services/` layer is the only place that talks to Supabase — components never call it directly.
- **Backend**: Supabase Postgres, with every table's access rules enforced by **Row Level Security**, not by frontend checks. Trip-scoped data (activities, saved places, packing items, expenses, invitations) is protected by two reusable SQL helper functions — `is_trip_member(trip_id)` and `trip_role(trip_id)` — applied consistently across every trip-child table rather than a bespoke policy per feature.
- **Migrations**: plain, numbered SQL files in `supabase/migrations/`, applied by hand in order (no migration CLI wired up) — each one documents its own reasoning inline.
- **Routing**: `src/utils/routing.js` maps the app's own page state to and from a real URL (`/explore`, `/trips/:id`, etc.), so refresh/Back/Forward all work like a normal multi-page site with no router dependency.

## Security

Frontend UI gating (hiding an Edit/Delete button from a Viewer, for example) is a UX convenience, not the actual security boundary. Every trip-scoped table has Row Level Security enabled in Postgres, so a request that shouldn't be allowed is rejected by the database itself regardless of what the client sends — verified directly during development, not just assumed from the policy text.

## Roles

Each trip has one **Owner** (its creator) and any number of invited collaborators:

- **Owner** — full control: manage the trip itself, invite/remove people, and everything an Editor can do.
- **Editor** — can add, edit, and delete itinerary items, saved places, packing items, and expenses.
- **Viewer** — can see everything on the trip, but can't add, edit, delete, or toggle anything.
- **Signed-out** — no access to any trip data. Explore is the one page that stays fully public.

## Features

- Accounts (sign up/in/out), password recovery and change, editable display name and profile photo.
- Create/edit/delete trips; a dynamic itinerary computed from a trip's own start/end dates.
- Activities with start/end time, category, and notes; saved places with an optional coordinate-backed map.
- A trip-level packing checklist.
- Personal per-collaborator budgets, plus shared expenses with equal-split balances.
- Friends, trip invitations (Editor/Viewer), and a notification/activity feed.
- Calendar (`.ics`) export and a print-friendly itinerary view.
- A default-currency preference and other account settings.

## Local development

```bash
npm install
cp .env.example .env   # then fill in your own keys — see below
npm run dev
```

Other commands:

```bash
npm run build     # production build
npm run lint       # ESLint
npm run preview   # preview a production build locally
```

## Environment variables

Copy `.env.example` to `.env` and fill in your own values — see that file for where to get each key and what it's used for. In short:

| Variable | Used for |
|---|---|
| `VITE_GEOAPIFY_API_KEY` | Place search, city autocomplete, geocoding (Explore, trip destination) |
| `VITE_PEXELS_API_KEY` | Optional place photos (the app works without it) |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase's public "anon" key — safe to ship to the browser; access control is enforced by RLS, not by keeping this secret |

Before signing up against a fresh Supabase project, run every file in `supabase/migrations/` in order, once, in that project's SQL Editor — it creates the tables and security policies these env vars are used against.

## Project structure

```
src/
  components/    UI components (one file per component)
  services/      The only layer that talks to Supabase
  utils/         Pure helper functions (dates, itinerary math, budget math, routing, ...)
  App.jsx        Top-level state, page routing
  App.css        All styling
supabase/
  migrations/    Numbered, hand-run SQL migrations
PROJECT_CONTEXT.md   A running architectural decision log kept up to date as the app changes
```

## Status

Voyage is a personal portfolio project — an actively developed prototype, not a production service with real users. It's meant to demonstrate real engineering judgment (a genuinely enforced permission model, real third-party API integrations, a deliberately small dependency footprint) rather than to claim it's finished or enterprise-scale.
