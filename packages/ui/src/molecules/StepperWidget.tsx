import React from 'react';

export interface StepItem {
  id: string | number;
  label: string;
  sublabel?: string;
}

export interface StepperWidgetProps {
  steps: StepItem[];
  currentStepIndex: number; // 0-based
  completedStepIndices?: number[];
  onStepClick?: (stepIndex: number) => void;
  className?: string;
}

export const StepperWidget: React.FC<StepperWidgetProps> = ({
  steps,
  currentStepIndex,
  completedStepIndices,
  onStepClick,
  className = '',
}) => {
  return (
    <div
      className={`flex items-center justify-between relative py-2 sm:py-3 px-1 sm:px-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden ${className}`}
    >
      {steps.map((step, index) => {
        const isActive = index === currentStepIndex;
        const isDone = !isActive && (Boolean(completedStepIndices?.includes(index)) || index < currentStepIndex);
        const isClickable = Boolean(
          onStepClick && (isActive || isDone || completedStepIndices?.includes(index) || index <= currentStepIndex)
        );

        const isLineDone =
          index < currentStepIndex ||
          (Boolean(completedStepIndices?.includes(index)) &&
            (Boolean(completedStepIndices?.includes(index + 1)) || index + 1 === currentStepIndex));

        return (
          <div
            key={step.id}
            className={`flex-1 text-center relative min-w-[56px] sm:min-w-[76px] ${
              isClickable ? 'cursor-pointer select-none hover:opacity-90 transition-opacity touch-manipulation' : ''
            }`}
            role={isClickable ? 'button' : undefined}
            tabIndex={isClickable ? 0 : undefined}
            onClick={() => {
              if (isClickable && onStepClick) {
                onStepClick(index);
              }
            }}
            onKeyDown={(e) => {
              if (isClickable && onStepClick && (e.key === 'Enter' || e.key === ' ')) {
                e.preventDefault();
                onStepClick(index);
              }
            }}
          >
            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={`absolute top-[12px] sm:top-[14px] left-[55%] right-[-45%] h-[2px] z-0 transition-colors ${
                  isLineDone ? 'bg-[#4d9775]' : 'bg-[#e7eeea]'
                }`}
              />
            )}

            {/* Step Icon circle */}
            <div
              className={`w-6 h-6 sm:w-7 sm:h-7 rounded-full mx-auto mb-1 sm:mb-1.5 grid place-items-center text-[11px] sm:text-xs font-bold relative z-10 transition-all ${
                isActive
                  ? 'bg-[#176b58] text-white shadow-[0_0_0_3px_#e4f1e9] sm:shadow-[0_0_0_4px_#e4f1e9]'
                  : isDone
                  ? 'bg-[#e0f0e6] text-[#287452]'
                  : 'bg-[#edf2ef] text-[#8e9a94]'
              }`}
            >
              {isDone ? '✓' : index + 1}
            </div>

            <small
              className={`block text-[11px] sm:text-xs font-medium leading-tight truncate px-0.5 ${
                isActive ? 'text-[#176b58] font-bold' : isDone ? 'text-[#287452]' : 'text-[#7d8b84]'
              }`}
            >
              {step.label}
            </small>
            {step.sublabel && (
              <span className="block text-[10px] sm:text-xs text-[#93a099] mt-0.5 truncate">{step.sublabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
