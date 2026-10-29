import { formatMmSs } from '../../lib/faces'
import { SevenSegment } from './SevenSegment'

type GlassScreenProps = {
  totalSeconds: number
  running: boolean
}

export function GlassScreen({ totalSeconds, running }: GlassScreenProps) {
  const { mm, ss } = formatMmSs(totalSeconds)

  return (
    <div className="glass-bezel">
      <span className={`glass-led${running ? ' is-on' : ''}`} aria-hidden="true" />
      <SevenSegment mm={mm} ss={ss} blinking={running} />
    </div>
  )
}
