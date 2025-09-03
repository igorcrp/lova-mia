import { useState, useEffect, useRef, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { X, ArrowRight, ArrowLeft, Play } from "lucide-react";
import { cn } from "@/lib/utils";

interface TourStep {
  id: number;
  title: string;
  content: string;
  targetSelector: string;
  position: "top" | "bottom" | "left" | "right";
  isInteractive: boolean;
  requiredFields?: string[];
  skipCondition?: () => boolean;
}

interface PlatformTourProps {
  isOpen: boolean;
  onClose: () => void;
  onComplete: () => void;
}

const tourSteps: TourStep[] = [
  {
    id: 1,
    title: "Welcome to Our Investment Platform",
    content: "Welcome! This tour will show you the platform's purpose and how to use it to analyze stocks. The platform uses AI to calculate millions of data points and show you, over time, which stocks are profitable for you to invest in and execute your trades. It will show you the best price to buy or sell a specific stock.",
    targetSelector: "",
    position: "bottom",
    isInteractive: false
  },
  {
    id: 2,
    title: "Basic Configuration",
    content: "Let's start with the basic settings. Select your operation type, country, stock market, and asset class. Each selection will load the next available options.",
    targetSelector: "[data-tour='basic-config']",
    position: "bottom",
    isInteractive: true,
    requiredFields: ["operation", "country", "stockMarket", "assetClass"]
  },
  {
    id: 3,
    title: "Entry and Exit Strategy",
    content: "Define your trading strategy by setting the reference price, analysis period, entry percentage, and stop loss percentage. These parameters determine when to enter and exit positions.",
    targetSelector: "[data-tour='strategy-config']",
    position: "bottom",
    isInteractive: true,
    requiredFields: ["referencePrice", "period", "entryPercentage", "stopPercentage"]
  },
  {
    id: 4,
    title: "Capital and Comparison (Optional)",
    content: "Set your initial capital for simulation and optionally add comparison assets. When ready, click 'Show Results' to generate the analysis.",
    targetSelector: "[data-tour='capital-config'], [data-tour='show-results']",
    position: "bottom",
    isInteractive: true,
    requiredFields: ["showResults"]
  },
  {
    id: 5,
    title: "Analyzing Results",
    content: "The results table shows the number of trades, profits, losses, stops triggered, and final capital. Click the magnifying glass icon to view detailed charts of capital evolution, entry/exit prices, volumes, and daily data.",
    targetSelector: "[data-tour='results-table']",
    position: "top",
    isInteractive: false
  }
];

export function PlatformTour({ isOpen, onClose, onComplete }: PlatformTourProps) {
  const [currentStep, setCurrentStep] = useState(1);
  const [completedSteps, setCompletedSteps] = useState<number[]>([]);
  const [targetElement, setTargetElement] = useState<HTMLElement | null>(null);
  const [modalPosition, setModalPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [forceUpdate, setForceUpdate] = useState(0);
  const modalRef = useRef<HTMLDivElement>(null);

  const updateHighlightPosition = useCallback(() => {
    setForceUpdate(prev => prev + 1);
  }, []);

  const checkStepCompletion = useCallback((step: TourStep): boolean => {
    if (!step.isInteractive) return true;
    
    if (step.requiredFields) {
      return step.requiredFields.every(field => {
        // For step 4, check if show results button should be enabled
        if (field === "showResults") {
          // Check if the form is valid and ready for submission
          const formEl = document.querySelector('form');
          if (!formEl) return false;
          const submitButton = formEl.querySelector('[data-tour="show-results"]') as HTMLButtonElement;
          return submitButton && !submitButton.disabled;
        }
        
        // For other fields, check the actual form values using selectors
        if (field === "operation") {
          const select = document.querySelector('[data-tour="basic-config"] button[role="combobox"]');
          if (!select) return false;
          const span = select.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Select operation';
        }
        
        if (field === "country") {
          const selects = document.querySelectorAll('[data-tour="basic-config"] button[role="combobox"]');
          const countrySelect = selects[1]; // Second select is country
          if (!countrySelect) return false;
          const span = countrySelect.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Select country';
        }
        
        if (field === "stockMarket") {
          const selects = document.querySelectorAll('[data-tour="basic-config"] button[role="combobox"]');
          const stockMarketSelect = selects[2]; // Third select is stock market
          if (!stockMarketSelect) return false;
          const span = stockMarketSelect.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Select stock...';
        }
        
        if (field === "assetClass") {
          const selects = document.querySelectorAll('[data-tour="basic-config"] button[role="combobox"]');
          const assetClassSelect = selects[3]; // Fourth select is asset class
          if (!assetClassSelect) return false;
          const span = assetClassSelect.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Select asset...';
        }
        
        if (field === "referencePrice") {
          const select = document.querySelector('[data-tour="strategy-config"] button[role="combobox"]');
          if (!select) return false;
          const span = select.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Reference price';
        }
        
        if (field === "period") {
          const selects = document.querySelectorAll('[data-tour="strategy-config"] button[role="combobox"]');
          const periodSelect = selects[1]; // Second select in strategy config
          if (!periodSelect) return false;
          const span = periodSelect.querySelector('span');
          return span && span.textContent && span.textContent.trim() !== 'Period';
        }
        
        if (field === "entryPercentage") {
          const inputs = document.querySelectorAll('[data-tour="strategy-config"] input[inputmode="decimal"]') as NodeListOf<HTMLInputElement>;
          const entryInput = inputs[0]; // First decimal input
          return entryInput && entryInput.value && entryInput.value.trim() !== '' && entryInput.value.trim() !== '0' && entryInput.value.trim() !== '0.00';
        }
        
        if (field === "stopPercentage") {
          const inputs = document.querySelectorAll('[data-tour="strategy-config"] input[inputmode="decimal"]') as NodeListOf<HTMLInputElement>;
          const stopInput = inputs[1]; // Second decimal input
          return stopInput && stopInput.value && stopInput.value.trim() !== '' && stopInput.value.trim() !== '0' && stopInput.value.trim() !== '0.00';
        }
        
        return true;
      });
    }
    
    return true;
  }, []);

  // Add scroll listener to update highlight position
  useEffect(() => {
    if (!isOpen || !targetElement) return;

    const handleScroll = () => {
      updateHighlightPosition();
    };

    const handleResize = () => {
      updateHighlightPosition();
    };

    window.addEventListener('scroll', handleScroll, true);
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('scroll', handleScroll, true);
      window.removeEventListener('resize', handleResize);
    };
  }, [isOpen, targetElement, updateHighlightPosition]);

  // Add a listener for when results appear to auto-advance to step 5
  useEffect(() => {
    if (!isOpen || currentStep !== 4) return;

    const observer = new MutationObserver(() => {
      const resultsTable = document.querySelector("[data-tour='results-table']");
      if (resultsTable && currentStep === 4) {
        // Delay to ensure results are fully rendered
        setTimeout(() => {
          setCurrentStep(5);
        }, 500);
      }
    });

    // Observe changes to the document body
    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    return () => observer.disconnect();
  }, [isOpen, currentStep]);
  useEffect(() => {
    if (!isOpen) return;

    const step = tourSteps.find(s => s.id === currentStep);
    if (!step?.isInteractive || !step.requiredFields) return;

    const handleFormChange = () => {
      setForceUpdate(prev => prev + 1);
    };

    // Listen for changes on select buttons and inputs
    const selectors = [
      '[data-tour="basic-config"] button[role="combobox"]',
      '[data-tour="strategy-config"] button[role="combobox"]', 
      '[data-tour="strategy-config"] input[inputmode="decimal"]',
      '[data-tour="show-results"]'
    ];

    const elements: HTMLElement[] = [];
    selectors.forEach(selector => {
      const nodeList = document.querySelectorAll(selector);
      elements.push(...Array.from(nodeList as NodeListOf<HTMLElement>));
    });

    elements.forEach(element => {
      element.addEventListener('input', handleFormChange);
      element.addEventListener('change', handleFormChange);
      element.addEventListener('click', handleFormChange);
      // For selects, also listen for mutation changes
      if (element.tagName === 'BUTTON') {
        const observer = new MutationObserver(handleFormChange);
        observer.observe(element, { attributes: true, childList: true, subtree: true });
        // Store observer reference for cleanup
        (element as any).__observer = observer;
      }
    });

    return () => {
      elements.forEach(element => {
        element.removeEventListener('input', handleFormChange);
        element.removeEventListener('change', handleFormChange);
        element.removeEventListener('click', handleFormChange);
        // Clean up mutation observers
        if ((element as any).__observer) {
          (element as any).__observer.disconnect();
          delete (element as any).__observer;
        }
      });
    };
  }, [currentStep, isOpen]);

  useEffect(() => {
    if (!isOpen) return;

    const step = tourSteps.find(s => s.id === currentStep);
    if (!step?.targetSelector) {
      setTargetElement(null);
      return;
    }

    const element = document.querySelector(step.targetSelector) as HTMLElement;
    setTargetElement(element);

    if (element) {
      // Only scroll into view for steps other than step 5 (Results table) on desktop
      if (currentStep !== 5 && window.innerWidth >= 768) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
      }
      
      // Position modal - mobile uses centered positioning, desktop uses element-based
      if (window.innerWidth < 768) {
        // Mobile: Center the modal
        setModalPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      } else {
        // Desktop: Position based on element
        const rect = element.getBoundingClientRect();
        const modalWidth = 400; // Approximate modal width
        const modalHeight = 300; // Approximate modal height
        
        let x = rect.left;
        let y = rect.bottom + 20;
        
        // For step 5 (Results table), position modal above the table if it would go off-screen
        if (currentStep === 5) {
          // Check if modal would be below viewport
          if (y + modalHeight > window.innerHeight) {
            y = Math.max(20, rect.top - modalHeight - 20); // Position above
          }
          // Ensure modal stays within horizontal bounds
          x = Math.max(20, Math.min(window.innerWidth - modalWidth - 20, rect.left));
        } else {
          // For other steps, use existing logic
          x = Math.max(16, Math.min(window.innerWidth - 600, rect.left));
        }
        
        setModalPosition({ x, y });
      }
    }
  }, [currentStep, isOpen]);

  // Initialize modal position for welcome step
  useEffect(() => {
    if (isOpen && currentStep === 1) {
      if (window.innerWidth < 768) {
        // Mobile: Center the modal
        setModalPosition({
          x: window.innerWidth / 2,
          y: window.innerHeight / 2
        });
      } else {
        // Desktop: Center horizontally, position at top
        setModalPosition({
          x: (window.innerWidth - 500) / 2,
          y: 100
        });
      }
    }
  }, [isOpen, currentStep]);

  // Mouse handlers for dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    // Allow dragging from the header or any non-interactive area
    if (target.closest('button') || target.closest('input') || target.closest('[role="button"]')) {
      return;
    }
    
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - modalPosition.x,
      y: e.clientY - modalPosition.y
    });
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (!isDragging) return;
    
    const modalWidth = 400; // Approximate modal width
    const modalHeight = 350; // Approximate modal height
    
    // Allow free movement anywhere on screen
    const newX = e.clientX - dragOffset.x;
    const newY = e.clientY - dragOffset.y;
    
    setModalPosition({
      x: Math.max(-modalWidth + 50, Math.min(window.innerWidth - 50, newX)), // Allow partial off-screen
      y: Math.max(-modalHeight + 50, Math.min(window.innerHeight - 50, newY)) // Allow partial off-screen
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, dragOffset]);

  const handleNext = () => {
    const step = tourSteps.find(s => s.id === currentStep);
    if (!step) return;

    if (step.isInteractive && !checkStepCompletion(step)) {
      return; // Don't advance if requirements not met
    }

    setCompletedSteps(prev => [...prev, currentStep]);
    
    // For step 4, automatically advance to step 5 when results appear
    if (currentStep === 4) {
      // Wait a bit for results to load and then advance
      setTimeout(() => {
        const resultsTable = document.querySelector("[data-tour='results-table']");
        if (resultsTable) {
          setCurrentStep(5);
        }
      }, 1000);
      return;
    }
    
    if (currentStep < tourSteps.length) {
      setCurrentStep(currentStep + 1);
    } else {
      onComplete();
    }
  };

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  const handleSkip = () => {
    onClose();
  };

  if (!isOpen) return null;

  const currentStepData = tourSteps.find(s => s.id === currentStep);
  if (!currentStepData) return null;

  const isFirstStep = currentStep === 1;
  const isLastStep = currentStep === tourSteps.length;
  const canAdvance = !currentStepData.isInteractive || checkStepCompletion(currentStepData);

  return (
    <div className="fixed inset-0 z-50 pointer-events-none">
      {/* Overlay for mobile to darken background */}
      {window.innerWidth < 768 && (
        <div className="fixed inset-0 bg-black/20 pointer-events-none z-30" />
      )}
      
      {/* Highlight box for target element */}
      {targetElement && (() => {
        // For step 4, highlight both capital config and show results button
        const step = tourSteps.find(s => s.id === currentStep);
        if (step?.id === 4) {
          const capitalElement = document.querySelector("[data-tour='capital-config']") as HTMLElement;
          const buttonElement = document.querySelector("[data-tour='show-results']") as HTMLElement;
          
          if (capitalElement && buttonElement) {
            const capitalRect = capitalElement.getBoundingClientRect();
            const buttonRect = buttonElement.getBoundingClientRect();
            
            // Calculate combined area
            const top = Math.min(capitalRect.top, buttonRect.top) - 4;
            const left = Math.min(capitalRect.left, buttonRect.left) - 4;
            const right = Math.max(capitalRect.right, buttonRect.right) + 4;
            const bottom = Math.max(capitalRect.bottom, buttonRect.bottom) + 4;
            
            return (
              <div
                className="fixed border-2 border-primary rounded-lg shadow-lg pointer-events-none transition-all duration-300 z-40"
                style={{
                  top,
                  left,
                  width: right - left,
                  height: bottom - top,
                  backgroundColor: "rgba(59, 130, 246, 0.1)"
                }}
              />
            );
          }
        }
        
        // Default highlighting for other steps
        return (
          <div
            className="fixed border-2 border-primary rounded-lg shadow-lg pointer-events-none transition-all duration-300 z-40"
            style={{
              top: targetElement.getBoundingClientRect().top - 4,
              left: targetElement.getBoundingClientRect().left - 4,
              width: targetElement.offsetWidth + 8,
              height: targetElement.offsetHeight + 8,
              backgroundColor: "rgba(59, 130, 246, 0.1)"
            }}
          />
        );
      })()}

      {/* Tour Modal */}
      <Card 
        ref={modalRef}
        className={cn(
          "absolute bg-background/98 backdrop-blur border shadow-2xl pointer-events-auto overflow-hidden transition-all duration-300",
          // Mobile styles
          "w-[calc(100vw-2rem)] max-w-sm mx-4 rounded-lg",
          // Desktop styles  
          "md:w-full md:max-w-md md:mx-0 md:cursor-move md:max-h-none"
        )}
        style={{
          // Mobile positioning
          ...(window.innerWidth < 768 ? {
            left: currentStep === 1 ? '50%' : (targetElement ? '50%' : modalPosition.x),
            top: currentStep === 1 ? '50%' : (targetElement ? 
              Math.min(window.innerHeight - 280, targetElement.getBoundingClientRect().bottom + 20) : 
              modalPosition.y),
            transform: currentStep === 1 ? 'translate(-50%, -50%)' : (targetElement ? 'translateX(-50%)' : 'none'),
            maxHeight: targetElement && currentStep !== 1 ? 
              `${window.innerHeight - targetElement.getBoundingClientRect().bottom - 40}px` : 
              '260px'
          } : {
            // Desktop: Use existing positioning
            left: modalPosition.x,
            top: modalPosition.y,
            transform: 'none'
          })
        }}
        onMouseDown={handleMouseDown}
      >
        <CardContent className="p-3 md:p-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between mb-3 md:mb-4 flex-shrink-0">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-2">
                <div className="flex items-center justify-center w-6 h-6 md:w-8 md:h-8 rounded-full bg-primary/10 text-primary font-bold text-xs md:text-sm flex-shrink-0">
                  {currentStep}
                </div>
                <h2 className="text-base md:text-lg font-semibold text-foreground leading-tight truncate">
                  {currentStepData.title}
                </h2>
              </div>
              
              {/* Progress indicator */}
              <div className="flex gap-1 mb-2 md:mb-3">
                {tourSteps.map((_, index) => (
                  <div
                    key={index}
                    className={cn(
                      "h-1 md:h-1.5 rounded-full transition-all duration-300",
                      index + 1 <= currentStep ? "bg-primary flex-1" : "bg-muted flex-1"
                    )}
                  />
                ))}
              </div>
            </div>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={handleSkip}
              className="ml-2 text-muted-foreground hover:text-foreground min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto flex-shrink-0"
            >
              <X className="h-4 w-4 md:h-3 md:w-3" />
            </Button>
          </div>

          {/* Content - Scrollable on mobile */}
          <div className="mb-4 md:mb-6 flex-1 overflow-y-auto">
            <p className="text-white leading-relaxed text-sm md:text-sm">
              {currentStepData.content}
            </p>
            
            {currentStepData.isInteractive && !canAdvance && (
              <div className="mt-3 p-2 md:p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
                <p className="text-xs text-yellow-800 dark:text-yellow-200 font-medium">
                  Please complete the highlighted fields to continue.
                </p>
              </div>
            )}
          </div>

          {/* Navigation - Fixed at bottom */}
          <div className="flex items-center justify-between gap-2 flex-shrink-0">
            <div className="flex gap-1 md:gap-2">
              {!isFirstStep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handlePrevious}
                  className="flex items-center gap-1 min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto px-2 md:px-3"
                >
                  <ArrowLeft className="h-3 w-3" />
                  <span className="hidden sm:inline">Back</span>
                </Button>
              )}
            </div>

            <div className="flex gap-1 md:gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleSkip}
                className="text-muted-foreground min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto px-2 md:px-3 text-xs md:text-sm"
              >
                <span className="hidden sm:inline">Skip Tour</span>
                <span className="sm:hidden">Skip</span>
              </Button>
              
              {isFirstStep ? (
                <Button size="sm" onClick={handleNext} className="flex items-center gap-1 min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto px-2 md:px-3">
                  <Play className="h-3 w-3" />
                  <span className="hidden sm:inline">Start Tour</span>
                  <span className="sm:hidden">Start</span>
                </Button>
              ) : isLastStep ? (
                <Button size="sm" onClick={handleNext} className="flex items-center gap-1 min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto px-2 md:px-3">
                  <span className="hidden sm:inline">Complete Tour</span>
                  <span className="sm:hidden">Complete</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              ) : (
                <Button
                  size="sm"
                  onClick={handleNext}
                  disabled={!canAdvance}
                  className="flex items-center gap-1 min-w-[44px] min-h-[44px] md:min-w-auto md:min-h-auto px-2 md:px-3"
                >
                  <span className="hidden sm:inline">Next</span>
                  <span className="sm:hidden">Next</span>
                  <ArrowRight className="h-3 w-3" />
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}