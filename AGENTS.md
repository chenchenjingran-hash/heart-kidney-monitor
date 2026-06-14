# Prototype Instructions

Run the local server yourself and open the preview in the in-app browser. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

## Durable product decisions

- Keep the current simple family-care timeline UI.
- Cloud sync uses one shared family email/password account across devices.
- LocalStorage remains the immediate offline cache; Supabase is the remote source of truth.
- Daily blood pressure supports morning, noon, and night readings; legacy single readings migrate to morning.
- Daily weight supports morning, noon, and night readings; legacy single readings migrate to morning.
- Daily water intake and urine output each support six entries and store an automatically calculated daily total.
