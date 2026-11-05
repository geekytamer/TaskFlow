'use client';

import * as React from 'react';
import type { AssistantSubject } from '@/services/assistantService';

/**
 * Where the assistant lives across the app: whether its side panel is open,
 * and which record is on screen (registered by record pages), so "this task"
 * means the task the person is looking at.
 */
interface AssistantPanelState {
  open: boolean;
  setOpen: (open: boolean | ((was: boolean) => boolean)) => void;
  /** The record on screen: the most recently opened one (a task sheet over its project page). */
  subject: AssistantSubject | null;
  /** Adds a record on screen; returns how to take it away again. */
  register: (subject: AssistantSubject) => () => void;
  /** Leaves the current record out of the next question ("About: …" chip removed). */
  dismiss: () => void;
  /** Set when "Ask about this" opened the panel: the composer takes focus. */
  focusRequest: number;
  openAbout: () => void;
  /** True once after "Ask about this" opened the panel: the chat then starts a fresh conversation. */
  takeAbout: () => boolean;
}

const Ctx = React.createContext<AssistantPanelState | null>(null);

export function AssistantPanelProvider({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const [stack, setStack] = React.useState<Array<{ token: number; subject: AssistantSubject }>>([]);
  const [dismissed, setDismissed] = React.useState<number | null>(null);
  const [focusRequest, setFocusRequest] = React.useState(0);
  const next = React.useRef(0);
  const aboutPending = React.useRef(false);
  const takeAbout = React.useCallback(() => { const was = aboutPending.current; aboutPending.current = false; return was; }, []);
  const register = React.useCallback((subject: AssistantSubject) => {
    const token = (next.current += 1);
    setStack((all) => [...all, { token, subject }]);
    return () => setStack((all) => all.filter((x) => x.token !== token));
  }, []);
  const top = stack.at(-1);
  const subject = top && top.token !== dismissed ? top.subject : null;
  const value = React.useMemo<AssistantPanelState>(() => ({
    open, setOpen, subject, register, focusRequest,
    dismiss: () => setDismissed(top?.token ?? null),
    openAbout: () => { aboutPending.current = true; setDismissed(null); setOpen(true); setFocusRequest((n) => n + 1); },
    takeAbout,
  }), [open, subject, register, focusRequest, top?.token, takeAbout]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/** The panel's state; outside the app layout (print pages) a no-op stand-in. */
export function useAssistantPanel(): AssistantPanelState {
  return React.useContext(Ctx) ?? {
    open: false, setOpen: () => undefined, subject: null, register: () => () => undefined, dismiss: () => undefined, focusRequest: 0, openAbout: () => undefined, takeAbout: () => false,
  };
}

/**
 * Tells the assistant which record is on screen while this component is
 * mounted (a task sheet, a project page). Pass null while nothing is open.
 */
export function useAssistantSubject(subject: AssistantSubject | null) {
  const { register } = useAssistantPanel();
  const key = subject ? `${subject.kind}:${subject.id}:${subject.title}` : '';
  React.useEffect(() => {
    if (!subject) return;
    return register(subject);
    // The key carries the subject's identity; the object itself changes every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, register]);
}
