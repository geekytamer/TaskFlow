"use client"

import * as React from "react"
import { Command as CommandPrimitive } from "cmdk"
import { X } from "lucide-react"

import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import {
  Command,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command"

export interface MultiSelectItem {
  value: string
  label: string
  icon?: React.ComponentType<{ className?: string }>
}

interface MultiSelectProps {
  items: MultiSelectItem[]
  selected: string[]
  onChange: React.Dispatch<React.SetStateAction<string[]>>
  placeholder?: string
  className?: string
}

export function MultiSelect({
  items,
  selected,
  onChange,
  placeholder = "Select items...",
  className,
}: MultiSelectProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)
  const [open, setOpen] = React.useState(false)
  const [inputValue, setInputValue] = React.useState("")

  const handleSelect = (value: string) => {
    onChange((prev) =>
      prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]
    )
    setInputValue("")
  }

  const handleRemove = (value: string) => {
    onChange((prev) => prev.filter((v) => v !== value))
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const input = inputRef.current
    if (input) {
      if (e.key === "Delete" || e.key === "Backspace") {
        if (input.value === "" && selected.length > 0) {
          handleRemove(selected[selected.length - 1])
        }
      }
      if (e.key === "Escape") {
        input.blur()
      }
    }
  }

  const selectedItems = items.filter((item) => selected.includes(item.value))

  return (
    <Command
      onKeyDown={handleKeyDown}
      className={cn("overflow-visible bg-transparent", className)}
    >
      <div className="group rounded-md border border-input px-3 py-2 text-sm ring-offset-background focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2">
        <div className="flex flex-wrap gap-1">
          {selectedItems.map((item) => (
            <Badge key={item.value} variant="secondary">
              {item.label}
              <button
                className="ml-1 rounded-full outline-none ring-offset-background focus:ring-2 focus:ring-ring focus:ring-offset-2"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    handleRemove(item.value)
                  }
                }}
                onMouseDown={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                }}
                onClick={() => handleRemove(item.value)}
              >
                <X className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </button>
            </Badge>
          ))}
          <CommandPrimitive.Input
            ref={inputRef}
            value={inputValue}
            onValueChange={setInputValue}
            onBlur={() => setOpen(false)}
            onFocus={() => setOpen(true)}
            placeholder={placeholder}
            className="ml-2 flex-1 bg-transparent outline-none placeholder:text-muted-foreground"
          />
        </div>
      </div>
      <div className="relative mt-2">
        {open && items.length > 0 ? (
          <div className="absolute top-0 z-10 w-full rounded-md border bg-popover text-popover-foreground shadow-md outline-none animate-in">
            <CommandList>
              <CommandGroup className="h-full overflow-auto">
                {items.map((item) => (
                  <CommandItem
                    key={item.value}
                    onMouseDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                    }}
                    onSelect={() => handleSelect(item.value)}
                    className={cn(
                      "cursor-pointer",
                      selected.includes(item.value) && "font-bold"
                    )}
                  >
                    <div className="flex items-center gap-2">
                      {item.icon && (
                        <item.icon className="h-4 w-4 text-muted-foreground" />
                      )}
                      <span>{item.label}</span>
                    </div>
                  </CommandItem>
                ))}
              </CommandGroup>
            </CommandList>
          </div>
        ) : null}
      </div>
    </Command>
  )
}
