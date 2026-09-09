-- Voyage — adds optional map coordinates to `saved_places`
--
-- Run this once, after 0001-0015, in the Supabase SQL Editor.
--
-- Background: Map v1 shows a small map of a trip's saved places, but
-- only for places that actually have coordinates — Explore-sourced
-- places already resolve a precise latitude/longitude via Geoapify
-- (see services/geoapify.js's normalizePlace) at the moment they're
-- found, but until now that data was silently discarded the instant a
-- place was saved (utils/explore.js's toSavedPlace only ever kept
-- name/category/location-as-text/notes/image). This migration adds
-- somewhere for those coordinates to actually land.
--
-- A plain pair of nullable columns on the existing `saved_places`
-- table, not a new table — same reasoning as 0015's `default_currency`
-- addition to `profiles`: this is a single extra fact about a place
-- that already exists, not a new relationship, so it belongs on the
-- row itself.
--
-- No default forced at the database level: every existing row gets
-- NULL for both columns, which the app reads as "no coordinates for
-- this place" — it simply isn't rendered as a map pin (see
-- TripMap.jsx), never guessed or geocoded after the fact from its free
-- -text `location`. A manually-added place (AddPlace.jsx has no
-- geocoding of any kind) will always have NULL here too, by design —
-- Map v1 only ever shows what Geoapify actually resolved.
--
-- RLS is untouched: both of `saved_places`' existing policies
-- (0001_init.sql's "members can view saved places" / "owners and
-- editors can manage saved places") are row-level (scoped by trip_id
-- membership), not column-scoped, so they already cover these two new
-- columns with zero policy changes — same precedent 0015's own comment
-- documents for `profiles`. No new grant needed either, for the same
-- reason.

alter table public.saved_places
  add column if not exists latitude numeric,
  add column if not exists longitude numeric;
