/** ⓘ tooltip — hover on desktop, tap (focus) on mobile. Pass already-localized text. */
export function Info({ text, left = false }: { text: string; left?: boolean }) {
  return (
    <span className={`info-tip ${left ? "tip-left" : ""}`} tabIndex={0} role="note"
      aria-label={text} onClick={(e) => (e.currentTarget as HTMLElement).focus()}>
      i
      <span className="info-bubble">{text}</span>
    </span>
  );
}
