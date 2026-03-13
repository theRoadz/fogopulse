'use client'

import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import type { TradeDirection } from '@/types/trade'

interface DirectionButtonProps {
  direction: 'up' | 'down'
  selected: TradeDirection
  onSelect: (direction: 'up' | 'down') => void
  disabled?: boolean
}

/**
 * Direction button for selecting UP or DOWN trade direction.
 * UP button has green styling, DOWN button has red styling.
 * Selected state shows filled background.
 */
export function DirectionButton({
  direction,
  selected,
  onSelect,
  disabled = false,
}: DirectionButtonProps) {
  const isUp = direction === 'up'
  const isSelected = selected === direction

  const handleClick = () => {
    if (!disabled) {
      onSelect(direction)
    }
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
      aria-pressed={isSelected}
      aria-label={`Predict price goes ${isUp ? 'UP' : 'DOWN'}`}
      className={cn(
        'h-16 text-lg font-semibold flex items-center justify-center gap-2',
        'border-2 transition-all duration-200',
        // UP button styling
        isUp && [
          'border-green-500/50 text-green-500',
          isSelected && 'border-green-500 bg-green-500/20',
          !isSelected && !disabled && 'hover:bg-green-500/10',
        ],
        // DOWN button styling
        !isUp && [
          'border-red-500/50 text-red-500',
          isSelected && 'border-red-500 bg-red-500/20',
          !isSelected && !disabled && 'hover:bg-red-500/10',
        ]
      )}
    >
      {/* Triangle icon */}
      <span className="text-xl" aria-hidden="true">
        {isUp ? '▲' : '▼'}
      </span>
      {isUp ? 'UP' : 'DOWN'}
    </Button>
  )
}
