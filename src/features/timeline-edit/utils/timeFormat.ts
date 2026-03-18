/** Format seconds to m:ss.d */
export const fmtTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60);
    const ms = Math.floor((s % 1) * 10);
    return `${m}:${String(sec).padStart(2, '0')}.${ms}`;
};

let idCounter = 0;
export const uid = () => `seg-${++idCounter}-${Date.now()}`;
