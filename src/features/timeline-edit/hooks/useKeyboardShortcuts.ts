import { useEffect } from 'react';

interface UseKeyboardShortcutsOptions {
    togglePlay: () => void;
    handleMarkIn: () => void;
    handleCutOut: () => void;
    skip: (dt: number) => void;
    selectedCut: string | null;
    removeCut: (id: string) => void;
}

export function useKeyboardShortcuts({
    togglePlay,
    handleMarkIn,
    handleCutOut,
    skip,
    selectedCut,
    removeCut,
}: UseKeyboardShortcutsOptions) {
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const tag = (e.target as HTMLElement)?.tagName?.toLowerCase();
            if (tag === 'input' || tag === 'textarea' || (e.target as HTMLElement)?.isContentEditable) return;

            switch (e.key.toLowerCase()) {
                case ' ':
                    e.preventDefault();
                    togglePlay();
                    break;
                case 'i':
                    e.preventDefault();
                    handleMarkIn();
                    break;
                case 'o':
                case 'x':
                    e.preventDefault();
                    handleCutOut();
                    break;
                case 'arrowleft':
                    e.preventDefault();
                    skip(-1);
                    break;
                case 'arrowright':
                    e.preventDefault();
                    skip(1);
                    break;
                case 'j':
                    e.preventDefault();
                    skip(-5);
                    break;
                case 'l':
                    e.preventDefault();
                    skip(5);
                    break;
                case 'delete':
                case 'backspace':
                    if (selectedCut) {
                        e.preventDefault();
                        removeCut(selectedCut);
                    }
                    break;
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [togglePlay, handleMarkIn, handleCutOut, skip, selectedCut, removeCut]);
}
