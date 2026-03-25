/**
 * CanvasSnapshot Harness
 * Dumps the Konva.js stage state for agent verification.
 * .antigravity standard: Application Legibility.
 */

import Konva from 'konva';

export interface CanvasState {
    width: number;
    height: number;
    layers: Array<{
        name: string;
        children: Array<{
            type: string;
            attrs: Record<string, unknown>;
        }>;
    }>;
}

/**
 * Captures a structural snapshot of the Konva stage.
 * Used by agents to verify UI elements, positions, and layers.
 */
export const captureCanvasSnapshot = (stage: Konva.Stage): CanvasState => {
    return {
        width: stage.width(),
        height: stage.height(),
        layers: stage.getLayers().map(layer => ({
            name: layer.name(),
            children: layer.getChildren().map(child => ({
                type: child.className,
                attrs: child.getAttrs()
            }))
        }))
    };
};

/**
 * Logs the snapshot to the console in a structured format for agents.
 */
export const logCanvasSnapshot = (stage: Konva.Stage) => {
    const snapshot = captureCanvasSnapshot(stage);
    console.warn('--- AGENT_HARNESS: CANVAS_SNAPSHOT ---');
    console.warn(JSON.stringify(snapshot, null, 2));
    console.warn('--- END_SNAPSHOT ---');
};
