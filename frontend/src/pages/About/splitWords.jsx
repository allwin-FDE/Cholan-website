// Wraps each word in nested spans so GSAP can slide words up (original `Cm`).
// Returns a flat array of [space?, word span] children, keyed by word index.
export default function splitWords(text) {
  return text.split(' ').flatMap((word, index) => [
    index > 0 ? ' ' : null,
    <span className="ab-word" key={index}>
      <span>{word}</span>
    </span>,
  ]);
}
