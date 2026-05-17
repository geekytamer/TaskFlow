'use client';

import * as React from 'react';
import { TOURS, type Tour, type TourStep } from './tour-steps';

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

const SEEN_KEY = 'taskflow_tour_seen';

export function TourProvider({ children }: { children: React.ReactNode }) {
  const [activeTour, setActiveTour] = React.useState<Tour | null>(null);
  const [stepIndex, setStepIndex] = React.useState(0);

  const startTour = React.useCallback((tourId: string) => {
    const tour = TOURS.find(t => t.id === tourId);
    if (!tour) return;
    setActiveTour(tour);
    setStepIndex(0);
    // Mark as seen
    try {
      const seen = JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
      if (!seen.includes(tourId)) {
        localStorage.setItem(SEEN_KEY, JSON.stringify([...seen, tourId]));
      }
    } catch {}
  }, []);

  const endTour = React.useCallback(() => {
    setActiveTour(null);
    setStepIndex(0);
  }, []);

  const nextStep = React.useCallback(() => {
    setStepIndex(i => {
      if (activeTour && i >= activeTour.steps.length - 1) {
        setActiveTour(null);
        return 0;
      }
      return i + 1;
    });
  }, [activeTour]);

  const prevStep = React.useCallback(() => {
    setStepIndex(i => Math.max(0, i - 1));
  }, []);

  const currentStep = activeTour ? activeTour.steps[stepIndex] : null;
  const totalSteps = activeTour ? activeTour.steps.length : 0;

  return (
    <TourContext.Provider value={{ activeTour, stepIndex, currentStep, totalSteps, startTour, endTour, nextStep, prevStep, availableTours: TOURS }}>
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
    try {
      setSeen(JSON.parse(localStorage.getItem(SEEN_KEY) || '[]'));
    } catch {}
  }, []);
  return seen;
}
