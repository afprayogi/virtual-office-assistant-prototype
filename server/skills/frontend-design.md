---
name: frontend-design
description: Guidance for distinctive, intentional visual design when building new UI or reshaping an existing one.
license: Complete terms in LICENSE.txt
source: github.com/anthropics/skills/tree/main/skills/frontend-design
---

# Frontend Design

Approach this as the design lead at a design studio known for distinct visual identity — not templated defaults.

## Principles
- Ground designs in the subject matter: identify product, audience, and primary job before designing.
- Hero first: open with the most characteristic thing in the subject's world.
- Typography carries personality: one or two families, clear scale, deliberate weights/spacing; line length < 80 chars.
- Avoid generic tells: single accented word in headlines, ALL-CAPS labels, unnecessary labels above content.
- Visual structure is information; numbering only when content is truly sequential.
- Use non-user-triggered motion sparingly; one orchestrated moment beats scattered effects.
- Written content is design content: plain language, active voice, errors explain what went wrong and how to fix it.

## Process
1. Plan: compact token system — palette (4-6 hex), type roles, layout concept with ASCII wireframes, principles.
2. Review plan against the brief; revise anything that reads like a generic default.
3. Build: watch CSS specificity so selectors don't cancel each other out.
4. Restraint & self-critique: one memorable element, everything else quiet; responsive, keyboard focus, reduced-motion respected, accessible.

## Avoid generic AI-design defaults
Warm cream + terracotta, near-black + acid green, broadsheet with hairlines, identical rounded SaaS cards with soft shadows, fake labels like 'WORD — fragment' or 'A · B · C'.
