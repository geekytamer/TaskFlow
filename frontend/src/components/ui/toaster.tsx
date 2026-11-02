"use client"

import { useToast } from "@/hooks/use-toast"
import { useI18n } from "@/context/i18n-context"
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"

export function Toaster() {
  const { toasts } = useToast()
  const { isRtl } = useI18n()

  return (
    // K-3: in Arabic toasts leave (and are swiped away) toward the left edge,
    // the side they sit on, instead of sliding across the screen to the right.
    <ToastProvider swipeDirection={isRtl ? "left" : "right"}>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            <ToastClose />
          </Toast>
        )
      })}
      <ToastViewport />
    </ToastProvider>
  )
}
