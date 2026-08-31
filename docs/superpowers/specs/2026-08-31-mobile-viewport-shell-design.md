# Mobile viewport shell design

## Goal

Every Web route must meet the physical edges of a mobile browser viewport. The app must not leave decorative outer gaps at the bottom or sides.

## Scope

- Apply the rule through the shared viewport shell rather than route-specific CSS.
- Keep browser safe-area handling as *internal content padding* for headers, scrollable main content, and the tab bar.
- Preserve the current desktop presentation: a centred, rounded preview frame with an outer margin.
- Remove the legacy fixed `390px × 844px` device shell rule.

## Design

The root document (`html`, `body`, and `#app`) will explicitly fill the available viewport and remain free of default outer margins. On mobile, `.device` will be a borderless, shadowless shell with `width: 100vw`, `height: 100dvh`, and zero margin/radius. `100dvh` tracks the visible mobile browser viewport as browser UI expands or collapses.

The safe-area inset variables will stay on inner layout rules. Consequently, the app background reaches the viewport edges while interactive content remains clear of notches and home-indicator areas.

At the existing desktop breakpoint, the preview shell will continue to use a centred constrained width, vertical margin, rounded corners, and shadow.

## Regression coverage

The responsive shell test will assert the mobile full-width rule, the dynamic viewport height rule, and the absence of the legacy fixed dimensions. Existing build and test commands will validate that the CSS changes do not affect other Web routes.

## Error handling

No runtime behavior or data flow changes are needed. Browsers without `dvh` support retain the existing CSS cascade behavior where supported by the project; no route-level fallback is introduced.
