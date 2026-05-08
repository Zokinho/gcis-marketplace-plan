import { createContext, useContext, useState, useCallback, useRef, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Joyride, STATUS, EVENTS, ACTIONS, type EventData, type Controls, type Step } from 'react-joyride';
import { getTourById } from './tourDefinitions';
import { useUserStatus } from './useUserStatus';
import TourTooltip from '../components/TourTooltip';

const STORAGE_KEY = 'harvex-tours-completed';

interface TourContextValue {
  activeTourId: string | null;
  stepIndex: number;
  isRunning: boolean;
  startTour: (id: string) => void;
  endTour: () => void;
  hasCompletedTour: (id: string) => boolean;
  hasCompletedAnyTour: () => boolean;
  resetTour: (id: string) => void;
  resetAllTours: () => void;
}

const TourContext = createContext<TourContextValue | null>(null);

export function useTour(): TourContextValue {
  const ctx = useContext(TourContext);
  if (!ctx) throw new Error('useTour must be used within TourProvider');
  return ctx;
}

function getCompletedTours(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveCompletedTours(tours: string[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(tours));
}

export function TourProvider({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [activeTourId, setActiveTourId] = useState<string | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [completedTours, setCompletedTours] = useState<string[]>(getCompletedTours);

  // Track pending navigation for cross-page tours
  const pendingNavRef = useRef<{ route: string; stepIndex: number } | null>(null);
  const observerRef = useRef<MutationObserver | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: statusData } = useUserStatus();
  const isSeller = statusData?.user?.contactType?.includes('Seller') ?? false;

  const activeTourRaw = activeTourId ? getTourById(activeTourId) : null;

  // Filter out steps that require seller role for non-sellers
  const activeTour = useMemo(() => {
    if (!activeTourRaw) return null;
    if (isSeller) return activeTourRaw;
    return {
      ...activeTourRaw,
      steps: activeTourRaw.steps.filter((s) => !s.requiresSeller),
    };
  }, [activeTourRaw, isSeller]);

  // Convert tour steps to Joyride format
  const joyrideSteps: Step[] = activeTour
    ? activeTour.steps.map((step) => ({
        target: step.target,
        title: step.title,
        content: step.content,
        placement: (step.placement || 'auto') as Step['placement'],
        blockTargetInteraction: step.spotlightClicks ? false : true,
        skipBeacon: step.disableBeacon ?? true,
        skipScroll: step.skipScroll ?? false,
      }))
    : [];

  // Resume tour after cross-page navigation
  useEffect(() => {
    const pending = pendingNavRef.current;
    if (!pending || !activeTour) return;

    // Check if we've arrived at the right route
    if (location.pathname !== pending.route) return;

    // Wait for target element to appear
    const targetStep = activeTour.steps[pending.stepIndex];
    if (!targetStep) return;

    function tryResume() {
      const el = document.querySelector(targetStep.target);
      if (el) {
        cleanup();
        setStepIndex(pending!.stepIndex);
        setIsRunning(true);
        pendingNavRef.current = null;
      }
    }

    function cleanup() {
      if (observerRef.current) {
        observerRef.current.disconnect();
        observerRef.current = null;
      }
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    }

    // Try immediately
    tryResume();

    // If not found, observe DOM mutations
    if (pendingNavRef.current) {
      observerRef.current = new MutationObserver(tryResume);
      observerRef.current.observe(document.body, { childList: true, subtree: true });

      // Timeout after 5s
      timeoutRef.current = setTimeout(() => {
        cleanup();
        // Resume anyway — Joyride will handle missing target gracefully
        setStepIndex(pending.stepIndex);
        setIsRunning(true);
        pendingNavRef.current = null;
      }, 5000);
    }

    return cleanup;
  }, [location.pathname, activeTour]);

  const startTour = useCallback(
    (id: string) => {
      const tour = getTourById(id);
      if (!tour) return;

      const firstStep = tour.steps[0];

      setActiveTourId(id);
      setStepIndex(0);

      // Navigate to first step's route if needed
      if (firstStep.route && location.pathname !== firstStep.route) {
        navigate(firstStep.route);
        pendingNavRef.current = { route: firstStep.route, stepIndex: 0 };
      } else {
        setIsRunning(true);
      }
    },
    [navigate, location.pathname]
  );

  const endTour = useCallback(() => {
    setIsRunning(false);
    setActiveTourId(null);
    setStepIndex(0);
    pendingNavRef.current = null;
  }, []);

  const markCompleted = useCallback(
    (id: string) => {
      setCompletedTours((prev) => {
        if (prev.includes(id)) return prev;
        const next = [...prev, id];
        saveCompletedTours(next);
        return next;
      });
    },
    []
  );

  const hasCompletedTour = useCallback(
    (id: string) => completedTours.includes(id),
    [completedTours]
  );

  const hasCompletedAnyTour = useCallback(
    () => completedTours.length > 0,
    [completedTours]
  );

  const resetTour = useCallback((id: string) => {
    setCompletedTours((prev) => {
      const next = prev.filter((t) => t !== id);
      saveCompletedTours(next);
      return next;
    });
  }, []);

  const resetAllTours = useCallback(() => {
    setCompletedTours([]);
    saveCompletedTours([]);
  }, []);

  // Wait for a target element to appear, then resume the tour at the given step
  const waitForTarget = useCallback(
    (selector: string, targetStepIndex: number) => {
      function tryResume() {
        const el = document.querySelector(selector);
        if (el) {
          cleanupWait();
          setStepIndex(targetStepIndex);
          setIsRunning(true);
        }
      }

      function cleanupWait() {
        if (observerRef.current) {
          observerRef.current.disconnect();
          observerRef.current = null;
        }
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
      }

      // Clean up any previous observer
      cleanupWait();

      // Try immediately
      tryResume();

      // If not found, observe DOM mutations
      if (!document.querySelector(selector)) {
        observerRef.current = new MutationObserver(tryResume);
        observerRef.current.observe(document.body, { childList: true, subtree: true });

        // Timeout after 3s — resume anyway, Joyride handles missing target
        timeoutRef.current = setTimeout(() => {
          cleanupWait();
          setStepIndex(targetStepIndex);
          setIsRunning(true);
        }, 3000);
      }
    },
    []
  );

  // Joyride event handler
  const handleEvent = useCallback(
    (data: EventData, _controls: Controls) => {
      const { status, action, index, type } = data;

      // Tour finished or skipped
      if (status === STATUS.FINISHED || status === STATUS.SKIPPED) {
        if (status === STATUS.FINISHED && activeTourId) {
          markCompleted(activeTourId);
        }
        endTour();
        return;
      }

      // Handle tour end event
      if (type === EVENTS.TOUR_END) {
        if (activeTourId) markCompleted(activeTourId);
        endTour();
        return;
      }

      // Handle close/skip actions from tooltip buttons
      if (action === ACTIONS.CLOSE || action === ACTIONS.SKIP) {
        endTour();
        return;
      }

      // Handle step transitions
      if (type === EVENTS.STEP_AFTER) {
        const nextIndex = action === ACTIONS.PREV ? index - 1 : index + 1;

        if (!activeTour || nextIndex < 0 || nextIndex >= activeTour.steps.length) {
          // Past the last step — tour is complete
          if (activeTourId) markCompleted(activeTourId);
          endTour();
          return;
        }

        const nextStep = activeTour.steps[nextIndex];

        // Cross-page navigation needed?
        if (nextStep.route && location.pathname !== nextStep.route) {
          setIsRunning(false);
          pendingNavRef.current = { route: nextStep.route, stepIndex: nextIndex };
          navigate(nextStep.route);
        } else {
          // Check if the next target already exists
          const nextEl = document.querySelector(nextStep.target);
          if (nextEl) {
            setStepIndex(nextIndex);
          } else {
            // Target not found — if current step allows clicks, trigger the click
            // to open a modal/panel, then wait for the next target to appear
            const currentStep = activeTour.steps[index];
            if (currentStep.spotlightClicks) {
              const currentEl = document.querySelector(currentStep.target);
              if (currentEl) {
                setIsRunning(false);
                (currentEl as HTMLElement).click();
                waitForTarget(nextStep.target, nextIndex);
                return;
              }
            }
            // Fall through — set the step and let TARGET_NOT_FOUND handle it
            setStepIndex(nextIndex);
          }
        }
      }

      // Handle target not found — skip to next
      if (type === EVENTS.TARGET_NOT_FOUND) {
        const nextIndex = index + 1;
        if (activeTour && nextIndex < activeTour.steps.length) {
          setStepIndex(nextIndex);
        } else {
          if (activeTourId) markCompleted(activeTourId);
          endTour();
        }
      }
    },
    [activeTour, activeTourId, endTour, location.pathname, markCompleted, navigate, waitForTarget]
  );

  return (
    <TourContext.Provider
      value={{
        activeTourId,
        stepIndex,
        isRunning,
        startTour,
        endTour,
        hasCompletedTour,
        hasCompletedAnyTour,
        resetTour,
        resetAllTours,
      }}
    >
      {children}
      {activeTour && joyrideSteps.length > 0 && (
        <Joyride
          steps={joyrideSteps}
          run={isRunning}
          stepIndex={stepIndex}
          continuous
          scrollToFirstStep
          onEvent={handleEvent}
          tooltipComponent={TourTooltip}
          options={{
            overlayClickAction: false,
            spotlightPadding: 8,
            scrollOffset: 200,
            zIndex: 10000,
            overlayColor: 'rgba(0, 0, 0, 0.5)',
          }}
        />
      )}
    </TourContext.Provider>
  );
}
