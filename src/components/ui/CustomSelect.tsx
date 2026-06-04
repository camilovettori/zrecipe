'use client'

import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface SelectOption {
  value: string
  label: string
  disabled?: boolean
  separator?: boolean
  icon?: React.ReactNode
  description?: string
}

interface CustomSelectProps {
  value: string
  onChange: (value: string) => void
  options: SelectOption[]
  placeholder?: string
  disabled?: boolean
  error?: string
  className?: string
  size?: 'sm' | 'md' | 'lg'
}

export function CustomSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  disabled = false,
  error,
  className,
  size = 'md',
}: CustomSelectProps) {
  const [open, setOpen] = useState(false)
  const [openUpward, setOpenUpward] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const selectedOption = options.find((o) => !o.separator && o.value === value)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  const handleOpen = () => {
    if (disabled) return
    if (!open && containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect()
      setOpenUpward(window.innerHeight - rect.bottom < 220)
    }
    setOpen((prev) => !prev)
  }

  const sizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs min-h-[32px]',
    md: 'px-3 py-2.5 text-sm min-h-[40px]',
    lg: 'px-4 py-3 text-base min-h-[48px]',
  }

  const itemSizeClasses = {
    sm: 'px-2.5 py-1.5 text-xs',
    md: 'px-3 py-2 text-sm',
    lg: 'px-4 py-2.5 text-base',
  }

  return (
    <div ref={containerRef} className={cn('relative', className)}>
      <button
        type="button"
        disabled={disabled}
        onClick={handleOpen}
        className={cn(
          'flex w-full items-center justify-between gap-2 rounded-xl border bg-white text-left transition-all',
          'focus:outline-none focus:ring-2 focus:ring-emerald-400/30',
          sizeClasses[size],
          open ? 'border-emerald-400 ring-2 ring-emerald-400/20' : 'border-slate-200 hover:border-slate-300',
          error && 'border-red-400 focus:ring-red-300/30',
          disabled && 'cursor-not-allowed bg-slate-50 opacity-60',
        )}
      >
        <span className={cn('truncate font-medium', selectedOption ? 'text-slate-900' : 'text-slate-400')}>
          {selectedOption ? (
            <span className="flex items-center gap-2">
              {selectedOption.icon}
              {selectedOption.label}
            </span>
          ) : (
            placeholder
          )}
        </span>
        <ChevronDown
          className={cn(
            'h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-150',
            open && 'rotate-180 text-emerald-500',
          )}
        />
      </button>

      {open && (
        <div
          className={cn(
            'absolute z-50 min-w-full overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-lg shadow-slate-200/60',
            'dropdown-in',
            openUpward ? 'bottom-full mb-1.5' : 'top-full mt-1.5',
          )}
        >
          {options.map((option, index) => {
            if (option.separator) {
              return <div key={`sep-${index}`} className="my-1 border-t border-slate-100" />
            }

            const isSelected = option.value === value
            const isAction = option.value.startsWith('__')

            return (
              <button
                key={option.value}
                type="button"
                disabled={option.disabled}
                onClick={() => {
                  if (!option.disabled) {
                    onChange(option.value)
                    setOpen(false)
                  }
                }}
                className={cn(
                  'flex w-full items-center gap-2 text-left transition-colors',
                  itemSizeClasses[size],
                  isSelected && !isAction && 'bg-emerald-50 font-medium text-emerald-700',
                  !isSelected && !isAction && 'text-slate-700 hover:bg-slate-50',
                  isAction && 'font-medium text-emerald-600 hover:bg-emerald-50',
                  option.disabled && 'cursor-not-allowed opacity-40',
                )}
              >
                <span className="w-4 flex-shrink-0">
                  {isSelected && !isAction && <Check className="h-3.5 w-3.5 text-emerald-600" />}
                </span>
                <span className="flex-1">
                  {option.icon && <span className="mr-1">{option.icon}</span>}
                  {option.label}
                  {option.description && (
                    <span className="mt-0.5 block text-xs font-normal text-slate-400">{option.description}</span>
                  )}
                </span>
              </button>
            )
          })}
        </div>
      )}

      {error && <p className="mt-1 text-xs text-red-500">{error}</p>}
    </div>
  )
}
