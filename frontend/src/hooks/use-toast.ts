"use client"

// Inspired by react-hot-toast library
import * as React from "react"
import { localizeUiNode } from "@/lib/ui-text"

import type {
  ToastActionElement,
  ToastProps,
} from "@/components/ui/toast"

// More than one, so a screen's own toast never replaces a refusal sentence (I-1).
const TOAST_LIMIT = 3
const TOAST_REMOVE_DELAY = 1000000

type ToasterToast = Omit<ToastProps, "title" | "description"> & {
  id: string
  title?: React.ReactNode
  description?: React.ReactNode
  action?: ToastActionElement
}

// Used only for its type, which ActionType derives below.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
const actionTypes = {
  ADD_TOAST: "ADD_TOAST",
  UPDATE_TOAST: "UPDATE_TOAST",
  DISMISS_TOAST: "DISMISS_TOAST",
  REMOVE_TOAST: "REMOVE_TOAST",
} as const

let count = 0

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER
  return count.toString()
}

type ActionType = typeof actionTypes

type Action =
  | {
      type: ActionType["ADD_TOAST"]
      toast: ToasterToast
    }
  | {
      type: ActionType["UPDATE_TOAST"]
      toast: Partial<ToasterToast>
    }
  | {
      type: ActionType["DISMISS_TOAST"]
      toastId?: ToasterToast["id"]
    }
  | {
      type: ActionType["REMOVE_TOAST"]
      toastId?: ToasterToast["id"]
    }

interface State {
  toasts: ToasterToast[]
}

const toastTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

const addToRemoveQueue = (toastId: string) => {
  if (toastTimeouts.has(toastId)) {
    return
  }

  const timeout = setTimeout(() => {
    toastTimeouts.delete(toastId)
    dispatch({
      type: "REMOVE_TOAST",
      toastId: toastId,
    })
  }, TOAST_REMOVE_DELAY)

  toastTimeouts.set(toastId, timeout)
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return {
        ...state,
        toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT),
      }

    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      }

    case "DISMISS_TOAST": {
      const { toastId } = action

      // ! Side effects ! - This could be extracted into a dismissToast() action,
      // but I'll keep it here for simplicity
      if (toastId) {
        addToRemoveQueue(toastId)
      } else {
        state.toasts.forEach((toast) => {
          addToRemoveQueue(toast.id)
        })
      }

      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === toastId || toastId === undefined
            ? {
                ...t,
                open: false,
              }
            : t
        ),
      }
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) {
        return {
          ...state,
          toasts: [],
        }
      }
      return {
        ...state,
        toasts: state.toasts.filter((t) => t.id !== action.toastId),
      }
  }
}

const listeners: Array<(state: State) => void> = []

let memoryState: State = { toasts: [] }

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action)
  listeners.forEach((listener) => {
    listener(memoryState)
  })
}

type Toast = Omit<ToasterToast, "id">

/**
 * A permission refusal toast (lib/forbidden-message.ts) was just shown. The
 * screen that made the call often follows with its own error toast: the same
 * sentence (error.message), the server's raw message, or a bare "An error
 * occurred" (I-1). For a moment those echoes of the same failure are dropped,
 * so the person reads who to ask; a toast that says something new still shows.
 */
let refusalEcho: { texts: string[]; until: number } | null = null
export function showRefusalToast(props: Toast, holdMs = 2500, serverMessage?: string) {
  refusalEcho = null
  const shown = toast(props)
  const texts = [props.description, serverMessage].filter((t): t is string => typeof t === "string" && t.length > 0)
  if (texts.length) refusalEcho = { texts, until: Date.now() + holdMs }
  return shown
}

/** The app's generic failure words (common.error and friends), en and ar. */
const GENERIC_ERRORS = new Set([
  "an error occurred", "error", "something went wrong", "request failed", "حدث خطأ", "خطأ", "حدث خطأ ما",
])
const isGeneric = (text: string) => GENERIC_ERRORS.has(text.trim().replace(/[.!]+$/, "").toLowerCase())
  || /^Request failed with status \d+$/.test(text.trim())

/** Whether a toast only repeats the refusal just shown. */
export function isRefusalEcho(props: Pick<Toast, "title" | "description" | "variant">, now = Date.now()): boolean {
  if (!refusalEcho || now >= refusalEcho.until) return false
  const texts = refusalEcho.texts
  const echoes = (v: unknown) => typeof v === "string" && texts.some((t) => v.includes(t))
  if ([props.title, props.description].some(echoes)) return true
  // A destructive toast with nothing beyond generic words (or the refusal's own text).
  if (props.variant !== "destructive") return false
  const parts = [props.title, props.description].filter((v) => v !== undefined && v !== null && v !== "")
  return parts.length > 0 && parts.every((v) => typeof v === "string" && (isGeneric(v) || echoes(v)))
}

function toast({ ...props }: Toast) {
  const id = genId()
  if (isRefusalEcho(props)) {
    return { id, dismiss: () => undefined, update: () => undefined }
  }
  const localizedTitle =
    typeof props.title === "string" ? localizeUiNode(props.title) : props.title
  const localizedDescription =
    typeof props.description === "string"
      ? localizeUiNode(props.description)
      : props.description

  const update = (props: ToasterToast) =>
    dispatch({
      type: "UPDATE_TOAST",
      toast: { ...props, id },
    })
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id })

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      title: localizedTitle,
      description: localizedDescription,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) dismiss()
      },
    },
  })

  return {
    id: id,
    dismiss,
    update,
  }
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState)

  React.useEffect(() => {
    listeners.push(setState)
    return () => {
      const index = listeners.indexOf(setState)
      if (index > -1) {
        listeners.splice(index, 1)
      }
    }
  }, [state])

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  }
}

export { useToast, toast }
