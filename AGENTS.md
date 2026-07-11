# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

- Keep the current simple family-care timeline UI.
- Cloud sync uses one shared family email/password account across devices.
- LocalStorage remains the immediate offline cache; Supabase is the remote source of truth.
- Daily blood pressure supports morning, noon, and night readings; legacy single readings migrate to morning.
- Daily weight is recorded in jin and supports morning, noon, and night readings; legacy kilogram records migrate by converting kg to jin.
- Daily water intake and urine output each support fifteen optional decimal entries and store an automatically calculated daily total.
- Daily heart rate and SpO2 support morning, noon, and night readings; legacy single readings migrate to morning.
- Daily records auto-save after field edits, show the last modified time above the form and timeline entry, and the daily view opens on the latest record date.
- Each individual daily input stores and displays its own last modified time via `fieldUpdatedAt`, with legacy records falling back to the record-level timestamp until a field is edited.
- The recent-records timeline can be shown or hidden; its visibility is remembered per browser device in localStorage and is not included in cloud-synced family data.
- On phone-width layouts, heart rate and SpO2 are compact two-column groups, with heart rate on the left and SpO2 on the right; other daily fields remain full width.
- Place the urine output total and entries at the top of the daily form, directly after the date, so caregivers see urine tracking before weight and other vitals.
