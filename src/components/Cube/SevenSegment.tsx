const DIGIT_SEGMENTS: Record<string, ReadonlyArray<string>> = {
  '0': ['a', 'b', 'c', 'd', 'e', 'f'],
  '1': ['b', 'c'],
  '2': ['a', 'b', 'd', 'e', 'g'],
  '3': ['a', 'b', 'c', 'd', 'g'],
  '4': ['b', 'c', 'f', 'g'],
  '5': ['a', 'c', 'd', 'f', 'g'],
  '6': ['a', 'c', 'd', 'e', 'f', 'g'],
  '7': ['a', 'b', 'c'],
  '8': ['a', 'b', 'c', 'd', 'e', 'f', 'g'],
  '9': ['a', 'b', 'c', 'd', 'f', 'g'],
  '-': ['g'],
  ' ': [],
}

const ALL_SEGS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'] as const

function Digit({ char }: { char: string }) {
  const on = new Set(DIGIT_SEGMENTS[char] ?? DIGIT_SEGMENTS[' '])
  return (
    <span className="led-digit" aria-hidden="true">
      {ALL_SEGS.map((seg) => (
        <span
          key={seg}
          className={`led-digit__seg led-digit__seg--${seg}${on.has(seg) ? ' is-on' : ''}`}
        />
      ))}
    </span>
  )
}

type SevenSegmentProps = {
  mm: string
  ss: string
  blinking?: boolean
}

/** White 7-segment pairs with a gap (no colon), matching the physical product. */
export function SevenSegment({ mm, ss, blinking = false }: SevenSegmentProps) {
  return (
    <div className="led-row" aria-label={`${mm} ${ss}`}>
      <span className="led-pair">
        <Digit char={mm[0] ?? '0'} />
        <Digit char={mm[1] ?? '0'} />
      </span>
      <span className={`led-gap${blinking ? ' is-blink' : ''}`} aria-hidden="true" />
      <span className="led-pair">
        <Digit char={ss[0] ?? '0'} />
        <Digit char={ss[1] ?? '0'} />
      </span>
    </div>
  )
}
