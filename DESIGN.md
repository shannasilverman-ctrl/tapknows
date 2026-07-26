# TAP design system

TAP is a consumer decision product for choosing the best card at checkout. It should feel decisive, tactile, financially trustworthy, and fast enough to use with someone waiting behind you.

## Product principles

1. Show the answer before the explanation.
2. Use the physical wallet as TAP’s signature product metaphor.
3. Make financial math visible, specific, and calm.
4. Prefer one strong product artifact over decorative marketing graphics.
5. Motion must explain a choice, a handoff, or a change in state.
6. Use plain consumer language. Avoid SaaS slogans and abstract claims.

## Typography

- Display: Outfit, weights 700–800.
- Body: Inter, weights 400–700.
- Numeric and compact data: Geist Mono, weights 400–600.
- Display tracking ranges from `-0.03em` to `-0.06em`; never crush letterforms.
- Body copy is at least 14px with a minimum line-height of 1.5.
- Uppercase tracking is reserved for short system labels, never paragraphs.

## Color

- Ink: `#24152b`
- Secondary ink: `#39213f`
- White canvas: `#ffffff`
- Paper: `#fffdf8`, reserved for product surfaces rather than page backgrounds
- Coral action: `#f06b4f`
- Mint proof: `#b9ddcf`
- Studio gray: `#ececea`
- Body gray: `#665e67`

Cream and beige must not become the default page field. Dark purple belongs inside the product experience and high-contrast brand sections, not as a generic decorative theme.

## Shape and depth

- Product controls: 10–14px radius.
- Content surfaces: 12–16px radius.
- Primary buttons may use a full pill.
- Device frames and the physical wallet may exceed the standard radius because their shape represents a real object.
- Prefer a border or a shadow, not both. Use shadows only to establish real elevation.
- Do not put cards inside cards unless the nesting represents an actual interface layer.

## Layout

- Desktop content width: 1180px.
- Reading measure: 65–72 characters.
- Mobile horizontal gutter: at least 16px.
- Related content should be grouped tightly; sections should have visibly larger separation.
- Avoid repeated three-card marketing grids, decorative numbering, and ornamental section kickers.

## Motion

- Default easing: `cubic-bezier(0.22, 1, 0.36, 1)`.
- Animate `transform` and `opacity`; avoid layout-property animation.
- No bounce, auto-scrolling marquees, decorative pulsing, or motion without a state change.
- Respect `prefers-reduced-motion`.

## TAP signatures

- Woven plum leather wallet texture.
- Gold, rose, graphite, and navy card faces.
- Coral contactless signal.
- White proof screen with visible runner-up, value difference, assumptions, and independence statement.
- One-screen-at-a-time mobile walkthrough with swipe, tap, keyboard, and explicit controls.
