import { useRef } from 'react'

// Pip positions for each number (3x3 grid, 9 positions)
// true = show pip
const PIP_LAYOUT = {
  0: [false, false, false, false, false, false, false, false, false],
  1: [false, false, false, false, true,  false, false, false, false],
  2: [true,  false, false, false, false, false, false, false, true ],
  3: [true,  false, false, false, true,  false, false, false, true ],
  4: [true,  false, true,  false, false, false, true,  false, true ],
  5: [true,  false, true,  false, true,  false, true,  false, true ],
  6: [true,  true,  true,  false, false, false, true,  true,  true ],
}

function PipGrid({ count, isTop, small }) {
  const layout = PIP_LAYOUT[count] || PIP_LAYOUT[0]
  const size = small ? 4 : 6
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(3, 1fr)',
      gridTemplateRows: 'repeat(3, 1fr)',
      width: '100%',
      height: '100%',
      padding: '2px',
      gap: '1px',
    }}>
      {layout.map((show, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          {show && (
            <div style={{
              width: size,
              height: size,
              borderRadius: '50%',
              background: isTop && count > 0 ? '#c0392b' : '#222',
              boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.4)',
            }} />
          )}
        </div>
      ))}
    </div>
  )
}

export default function DominoCard({
  tile,
  horizontal = false,
  selected = false,
  validMove = false,
  played = false,
  small = false,
  onSelect,
  onDragStart,
  onDragEnd,
  style,
  className,
}) {
  const dragStartPos = useRef(null)

  const w = small ? (horizontal ? 52 : 28) : (horizontal ? 64 : 36)
  const h = small ? (horizontal ? 28 : 52) : (horizontal ? 36 : 64)

  const handleTouchStart = (e) => {
    const touch = e.touches[0]
    dragStartPos.current = { x: touch.clientX, y: touch.clientY }
  }

  const handleTouchEnd = (e) => {
    if (!dragStartPos.current) return
    const touch = e.changedTouches[0]
    const dx = Math.abs(touch.clientX - dragStartPos.current.x)
    const dy = Math.abs(touch.clientY - dragStartPos.current.y)
    const dist = Math.sqrt(dx * dx + dy * dy)

    if (dist < 10 && onSelect) {
      onSelect(tile)
    } else if (dist >= 10 && onDragEnd) {
      onDragEnd(e, tile)
    }
    dragStartPos.current = null
  }

  return (
    <div
      className={`domino ${horizontal ? 'horizontal' : ''} ${selected ? 'selected' : ''} ${validMove ? 'valid-move' : ''} ${played ? 'played' : ''} ${className || ''}`}
      style={{
        width: w,
        height: h,
        ...style,
      }}
      onClick={() => onSelect && onSelect(tile)}
      draggable={!played && !!onDragStart}
      onDragStart={(e) => onDragStart && onDragStart(e, tile)}
      onDragEnd={(e) => onDragEnd && onDragEnd(e, tile)}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <div className="domino-half">
        <PipGrid count={tile.left} isTop={false} small={small} />
      </div>
      <div className={`domino-divider`} />
      <div className="domino-half">
        <PipGrid count={tile.right} isTop={false} small={small} />
      </div>
    </div>
  )
}
