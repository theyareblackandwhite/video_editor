import React from 'react';
import { Upload, AudioLines, Scissors, Download, Check, Smartphone } from 'lucide-react';
import { useAppStore } from '../../app/store';

const STEPS = [
    { num: 1, label: 'Yükle', icon: Upload },
    { num: 2, label: 'Senkronize', icon: AudioLines },
    { num: 3, label: 'Düzenle', icon: Scissors },
    { num: 4, label: 'Kapak Tasarla', icon: Check },
    { num: 5, label: 'Shorts', icon: Smartphone },
    { num: 6, label: 'Dışa Aktar', icon: Download },
];

interface StepBarProps {
    hideLogo?: boolean;
}

export const StepBar: React.FC<StepBarProps> = ({ hideLogo }) => {
    const { currentStep, setStep } = useAppStore();

    // Progress percentage based on completed steps
    const progressPercent = ((currentStep - 1) / (STEPS.length - 1)) * 100;

    return (
        <div className="flex-1">
            <div className="px-6 py-2">
                {/* Logo + Steps row */}
                <div className="flex items-center gap-8">
                    {!hideLogo && (
                        <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent whitespace-nowrap select-none">
                            PodCut
                        </h1>
                    )}

                    {/* Steps container */}
                    <div className="flex-1 relative">
                        {/* Track + Progress lines — inset to align with dot centers */}
                        <div className="absolute top-4 left-4 right-4">
                            {/* Background track */}
                            <div className="absolute inset-0 h-[3px] bg-gray-200 rounded-full" />
                            {/* Animated progress fill */}
                            <div
                                className="absolute left-0 top-0 h-[3px] bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500 ease-out"
                                style={{ width: `${progressPercent}%` }}
                            />
                        </div>

                        {/* Step dots */}
                        <div className="relative flex justify-between">
                            {STEPS.map(({ num, label, icon: Icon }) => {
                                const isActive = currentStep === num;
                                const isCompleted = currentStep > num;

                                return (
                                    <button
                                        key={num}
                                        onClick={() => setStep(num)}
                                        className={`group flex flex-col items-center gap-1.5 cursor-pointer transition-transform duration-300
                                            ${isActive ? 'scale-110' : 'hover:scale-105'}`}
                                        style={{ outline: 'none' }}
                                    >
                                        {/* Circle — w-8 h-8 = 32px, so center is at 16px = top-4/left-4 */}
                                        <div
                                            className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-500 ease-out
                                                ${isActive
                                                    ? 'bg-gradient-to-br from-blue-500 to-indigo-600 text-white shadow-lg shadow-blue-500/30 ring-4 ring-blue-100'
                                                    : isCompleted
                                                        ? 'bg-green-500 text-white shadow-md shadow-green-500/20'
                                                        : 'bg-gray-100 text-gray-400 group-hover:bg-gray-200 group-hover:text-gray-600'
                                                }`}
                                        >
                                            {isCompleted ? (
                                                <Check size={16} strokeWidth={3} />
                                            ) : (
                                                <Icon size={16} />
                                            )}
                                        </div>

                                        {/* Label */}
                                        <span
                                            className={`text-[11px] font-semibold transition-colors duration-300
                                                ${isActive
                                                    ? 'text-blue-600'
                                                    : isCompleted
                                                        ? 'text-green-600'
                                                        : 'text-gray-400 group-hover:text-gray-600'
                                                }`}
                                        >
                                            {label}
                                        </span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
