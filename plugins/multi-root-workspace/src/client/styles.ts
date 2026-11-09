/**
 * The plugin's one stylesheet, injected into the document by the client entry.
 *
 * The host ships its design tokens as CSS custom properties on `body`
 * (`--dsw-alias-*` semantics, `--dsw-elevation-*` shadows, `--ds-*` motion and
 * code-font tokens), so this sheet names no color of its own: light and dark
 * theme follow the host automatically. It carries the panel body, its capsule
 * controls, and the panel's own directory picker overlay — a self-drawn
 * floating layer whose mask, card and elevation copy the host Modal.module.css
 * recipe token for token (group hints and empty states reuse .mrfw-note).
 * The workspace-config section's dialog shell (mask, card, header, close
 * button) and the sidebar footer trigger still belong to the workspace-config
 * holder since ADR-0013, and the Modal primitive already styles those — this
 * sheet deliberately has no rule for either.
 *
 * @module dsh-plugin-multi-root-workspace/client/styles
 */

/** The stylesheet text; every class is prefixed `mrfw-` to stay collision-free. */
export const STYLES = /* css */ `
/* The section's own column. The holder's dialog content column owns the
 * padding and the scrolling (.panel: 20px 24px padding, overflow-y auto),
 * so this root must not scroll a second time; it only stacks the body blocks
 * and is allowed to shrink inside the dialog's flex column. */
.mrfw-body {
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* The section fills the holder's content column (flex: 1 1 auto) while still
 * collapsing to its content height in the Files-tab inline wrapper. */
.mrfw-sectionBody {
  flex: 1 1 auto;
}

.mrfw-description {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-alert {
  margin: 0 0 8px;
  font-size: 14px;
  line-height: 22px;
  color: var(--dsw-alias-state-error-primary);
}

.mrfw-section {
  display: flex;
  flex-direction: column;
}

.mrfw-section + .mrfw-section {
  margin-top: 8px;
}

.mrfw-sectionTitleRow {
  display: flex;
  align-items: baseline;
  gap: 8px;
  padding: 8px 0 4px;
}

.mrfw-sectionTitle {
  font-size: 14px;
  line-height: 22px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.mrfw-sectionNote {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 12px 0;
  border-bottom: 0.5px solid var(--dsw-alias-border-l2);
}

.mrfw-rowBare {
  border-bottom: none;
}

/* A root entry's two lines: the display name on top, the absolute path under
   it in the tertiary voice (the workspace rows recipe of the host sidebar). */
.mrfw-rootText {
  display: flex;
  flex: 1 1 240px;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}

.mrfw-rootName {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  line-height: 20px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

.mrfw-rootPath {
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  word-break: break-all;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-note {
  margin: 0;
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

.mrfw-stateWarn {
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-state-warn-primary);
}

/* The "common" badge: a root the plugin configuration grants to every
   workspace. It is a neutral tag, not a warning — the root is perfectly
   usable; only its actions are owned by the configuration instead of the panel. */
.mrfw-sourceBadge {
  flex: none;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-border-secondary);
  border-radius: 999px;
  font-size: 11px;
  line-height: 16px;
  color: var(--dsw-alias-label-secondary);
}

.mrfw-btn {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  gap: 4px;
  height: 28px;
  padding: 0 10px;
  border: none;
  border-radius: 14px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 12px;
  line-height: 18px;
  cursor: pointer;
  transition: background-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-btn:disabled {
  cursor: not-allowed;
  opacity: 0.4;
}

.mrfw-btnGhost:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-btnGhost:active:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-active);
}

.mrfw-btnDanger:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover-danger);
}

.mrfw-btnOutline {
  border: 0.5px solid var(--dsw-alias-border-l3);
  background: transparent;
}

.mrfw-btnOutline:hover:not(:disabled) {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-btnPrimary {
  background: var(--dsw-alias-button-primary-fill);
  color: var(--dsw-alias-label-primary-foreground);
}

.mrfw-btnPrimary:hover:not(:disabled) {
  background: var(--dsw-alias-button-primary-hover);
}

/* One icon-only action: a square of the capsule family, meaning in title.
   Declared after the .mrfw-btn family so its padding wins the cascade tie:
   the capsule's 0 10px padding would otherwise squeeze the icon glyph. */
.mrfw-iconBtn {
  width: 28px;
  padding: 0;
  border-radius: 8px;
}

.mrfw-input {
  flex: 1 1 220px;
  min-width: 0;
  height: 32px;
  padding: 0 8px;
  border: 0.5px solid var(--dsw-alias-border-l4);
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-family: inherit;
  font-size: 14px;
  line-height: 22px;
  outline: none;
  transition: border-color var(--ds-transition-duration-fast) var(--ds-ease-in-out);
}

.mrfw-input:focus {
  border-color: var(--dsw-alias-brand-primary);
}

.mrfw-input::placeholder {
  color: var(--dsw-alias-label-dimmed);
}

.mrfw-inputInline {
  flex: 1 1 auto;
}

.mrfw-aliasEditor {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  flex-basis: 100%;
}

.mrfw-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

/* One control row, one height: the capsule buttons match the 32px input. */
.mrfw-actions .mrfw-btn {
  height: 32px;
  border-radius: 16px;
}

.mrfw-fileTree { flex-basis: 100%; min-width: 0; }
.mrfw-fileLevel { list-style: none; padding-left: 16px; margin: 4px 0; }
.mrfw-fileEntry { display: block; border: 0; background: transparent; color: var(--dsw-alias-label-primary); font: inherit; text-align: left; cursor: pointer; padding: 4px; overflow-wrap: anywhere; }
.mrfw-fileEntry:focus-visible { outline: 1px solid var(--dsw-alias-brand-primary); }
.mrfw-filePreview { max-height: 320px; overflow: auto; padding: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); font-size: 12px; }
.mrfw-actions .mrfw-iconBtn {
  width: 32px;
}

/* The directory picker's self-drawn overlay. The layer is the panel's own
 * floating surface, not the holder's dialog shell, and its mask, card and
 * elevation copy the host Modal.module.css recipe token for token:
 * mask-1 + mask-blur on the overlay, layer-2 + radius-panel +
 * elevation-prominent on the card. The close button, breadcrumb buttons,
 * inputs and actions all reuse the capsule family and .mrfw-input below. */

/* Portal root: full-viewport, centered, 24px of air on every side — the top
   and bottom widen to the frame's overlay inset when the host declares one.
   The card sizes against this padding box, never a viewport calc of its own. */
.mrfw-pickerOverlay {
  position: fixed;
  inset: 0;
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: max(24px, var(--dsh-frame-overlay-top, 24px)) 24px;
}

.mrfw-pickerMask {
  position: absolute;
  inset: 0;
  background: var(--dsw-alias-bg-mask-1);
  backdrop-filter: var(--dsw-mask-blur);
  animation: mrfwPickerEnter var(--ds-transition-duration) var(--ds-ease-in-out);
}

.mrfw-pickerCard {
  position: relative;
  z-index: 1;
  display: flex;
  flex-direction: column;
  width: min(560px, 100%);
  max-height: min(560px, 100%);
  border-radius: var(--dsw-radius-panel);
  background: var(--dsw-alias-bg-layer-2);
  box-shadow: var(--dsw-elevation-prominent);
  overflow: hidden;
  animation: mrfwPickerEnter var(--ds-transition-duration) var(--ds-ease-in-out);
}

@keyframes mrfwPickerEnter {
  from { opacity: 0; }
  to { opacity: 1; }
}

@media (prefers-reduced-motion: reduce) {
  .mrfw-pickerMask,
  .mrfw-pickerCard {
    animation: none;
  }
}

/* Header row: title left, close right, the host header's pads. The close
   button reuses .mrfw-btn/.mrfw-iconBtn and only takes the host close's
   secondary ink. */
.mrfw-pickerHeader {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 22px 14px 12px 24px;
}

.mrfw-pickerHeader .mrfw-iconBtn {
  color: var(--dsw-alias-label-secondary);
}

.mrfw-pickerTitle {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 16px;
  line-height: 24px;
  font-weight: 500;
  color: var(--dsw-alias-label-primary);
}

/* Breadcrumbs: a wrapping flex line of ghost capsule buttons
   (.mrfw-btn .mrfw-btnGhost .mrfw-pickerCrumb) tightened to 24px; the current
   crumb carries aria-current and steps down to the secondary ink. The
   separator is a dimmed chevron glyph. */
.mrfw-pickerCrumbs {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
  padding: 0 24px 8px;
}

.mrfw-pickerCrumb {
  height: 24px;
  padding: 0 6px;
  border-radius: 999px;
}

.mrfw-pickerCrumb[aria-current] {
  color: var(--dsw-alias-label-secondary);
}

.mrfw-pickerCrumbSeparator {
  flex: none;
  color: var(--dsw-alias-label-dimmed);
}

/* The one-level listing: a fixed growth band with its own scroll; the empty
   layer speaks through .mrfw-note. */
.mrfw-pickerList {
  flex: 1 1 auto;
  min-height: 160px;
  max-height: 320px;
  overflow-y: auto;
  padding: 4px 0;
}

/* One subfolder row: a full-width transparent button with the file-entry
   recipe (inherited font, left-aligned) and the shared hover wash. */
.mrfw-pickerRow {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 16px;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 14px;
  line-height: 20px;
  text-align: left;
  cursor: pointer;
}

.mrfw-pickerRow:hover {
  background: var(--dsw-alias-interactive-bg-hover);
}

.mrfw-pickerRow:focus-visible {
  outline: 1px solid var(--dsw-alias-brand-primary);
}

/* Footer: the current path in the code font's tertiary voice, plus the
   confirm/close actions as reused capsules. */
.mrfw-pickerFooter {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-top: 0.5px solid var(--dsw-alias-border-l2);
}

.mrfw-pickerPath {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--ds-font-family-code);
  font-size: 12px;
  line-height: 18px;
  color: var(--dsw-alias-label-tertiary);
}

/* The inline new-folder row: a wrapping flex line around a reused .mrfw-input
   and capsule buttons. */
.mrfw-pickerCreate {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 0 16px 8px;
}
`
