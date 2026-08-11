'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { TOURS, tourAllowsRole, type Tour, type TourStep } from './tour-steps';
import { useCompany } from '@/context/company-context';

interface TourContextValue {
  activeTour: Tour | null;
  stepIndex: number;
  currentStep: TourStep | null;
  totalSteps: number;
  startTour: (tourId: string) => void;
  endTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  availableTours: Tour[];
}

const TourContext = React.createContext<TourContextValue | null>(null);

export const SEEN_KEY = 'taskflow_tour_seen';
export const TOURS_CHANGED_EVENT = 'taskflow-tours-changed';

export function TourProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const { currentRole } = useCompany();
  const [activeTour, setActiveTour] = React.useState<Tour | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);

  // Tours the current role can actually follow — the same set the guide page
  // lists, computed once here so every entry point agrees.
  const availableTours = React.useMemo(
    () => TOURS.filter((tour) => tourAllowsRole(tour, currentRole)),
    [currentRole],
  );

  const startTour = React.useCallback((tourId: string) => {
    const tour = TOURS.find(t => t.id === tourId);
    if (!tour) return;
    // Refuse a tour whose page this role would be bounced out of, whatever
    // route into startTour was used.
    if (!tourAllowsRole(tour, currentRole)) return;
    setActiveTour(tour);
    setStepIndex(0);
    // Take the user straight to the page this tour explains.
    const dest = tour.steps[0]?.route ?? tour.route;
    if (dest && typeof window !== 'undefined' && window.location.pathname !== dest) {
      router.push(dest);
    }
    // Mark as seen
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (!seen.includes(tourId)) {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, tourId]));
        window.dispatchEvent(new Event(TOURS_CHANGED_EVENT));
      }
    } catch {}
  }, [router, currentRole]);

  const endTour = React.useCallback(() => {
    setActiveTour(null);
    setStepIndex(0);
  }, []);

  const nextStep = React.useCallback(() => {
    if (!activeTour) return;
    // Decided here rather than inside a setState updater: updaters must be pure,
    // and StrictMode runs them twice in development, so ending the tour from
    // inside one could tear it down on a pass meant only as a dry run.
    if (stepIndex >= activeTour.steps.length - 1) {
      setActiveTour(null);
      setStepIndex(0);
      return;
    }
    setStepIndex(stepIndex + 1);
  }, [activeTour, stepIndex]);

  const prevStep = React.useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  const currentStep = activeTour ? activeTour.steps[stepIndex] : null;
  const totalSteps = activeTour ? activeTour.steps.length : 0;

  return (
    <TourContext.Provider value={{ activeTour, stepIndex, currentStep, totalSteps, startTour, endTour, nextStep, prevStep, availableTours }}>
      {children}
    </TourContext.Provider>
  );
}

export function useTour() {
  const ctx = React.useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

export function useSeenTours(): string[] {
  const [seen, setSeen] = React.useState<string[]>([]);
  React.useEffect(() => {
    const read = () => {
      try {
        setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
      } catch {
        setSeen([]);
      }
    };
    read();
    // The guide page shows progress live, so it needs to hear about a tour
    // being completed or progress being reset without a reload.
    window.addEventListener(TOURS_CHANGED_EVENT, read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener(TOURS_CHANGED_EVENT, read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return seen;
}
