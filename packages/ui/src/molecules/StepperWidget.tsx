import React from 'react';

export interface StepItem {
  id: string | number;
  label: string;
  sublabel?: string;
}

export interface StepperWidgetProps {
  steps: StepItem[];
  currentStepIndex: number; // 0-based
  className?: string;
}

export const StepperWidget: React.FC<StepperWidgetProps> = ({
  steps,
  currentStepIndex,
  className = '',
}) => {
  return (
    <div className={`flex items-center justify-between relative py-4 px-2 overflow-x-auto ${className}`}>
      {steps.map((step, index) => {
        const isDone = index < currentStepIndex;
        const isActive = index === currentStepIndex;

        return (
          <div key={step.id} className="flex-1 text-center relative min-w-[80px]">
            {/* Connecting line */}
            {index < steps.length - 1 && (
              <div
                className={`absolute top-[14px] left-[55%] right-[-45%] h-[2px] z-0 transition-colors ${
                  isDone ? 'bg-[#4d9775]' : 'bg-[#e7eeea]'
                }`}
              />
            )}

            {/* Step Icon circle */}
            <div
              className={`w-7 h-7 rounded-full mx-auto mb-1.5 grid place-items-center text-xs font-bold relative z-10 transition-all ${
                isDone
                  ? 'bg-[#e0f0e6] text-[#287452]'
                  : isActive
                  ? 'bg-[#176b58] text-white shadow-[0_0_0_4px_#e4f1e9]'
                  : 'bg-[#edf2ef] text-[#8e9a94]'
              }`}
            >
              {isDone ? '✓' : index + 1}
            </div>

            <small
              className={`block text-xs font-medium leading-tight ${
                isActive ? 'text-[#176b58] font-bold' : isDone ? 'text-[#287452]' : 'text-[#7d8b84]'
              }`}
            >
              {step.label}
            </small>
            {step.sublabel && (
              <span className="block text-xs text-[#93a099] mt-0.5">{step.sublabel}</span>
            )}
          </div>
        );
      })}
    </div>
  );
};
