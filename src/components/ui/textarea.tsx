"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, onInput, value, ...props }, ref) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null)

    const syncHeight = React.useCallback(() => {
      const element = innerRef.current

      if (!element) {
        return
      }

      element.style.height = "auto"
      element.style.height = `${element.scrollHeight}px`
    }, [])

    React.useLayoutEffect(() => {
      syncHeight()
    }, [syncHeight, value])

    return (
      <textarea
        data-slot="textarea"
        ref={(node) => {
          innerRef.current = node

          if (typeof ref === "function") {
            ref(node)
          } else if (ref) {
            ref.current = node
          }
        }}
        className={cn(
          "flex min-h-16 w-full overflow-hidden rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 md:text-sm dark:bg-input/30 dark:aria-invalid:ring-destructive/40",
          className
        )}
        value={value}
        onInput={(event) => {
          syncHeight()
          onInput?.(event)
        }}
        {...props}
      />
    )
  }
)

Textarea.displayName = "Textarea"

export { Textarea }
