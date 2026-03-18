
function computeCorrelationOriginal(
    ref: Float32Array,
    target: Float32Array,
    lag: number
): number {
    let sum = 0;
    let count = 0;

    for (let i = 0; i < ref.length; i++) {
        const targetIdx = i + lag;
        if (targetIdx < 0 || targetIdx >= target.length) continue;
        sum += ref[i] * target[targetIdx];
        count++;
    }

    return count > 0 ? sum / count : 0;
}

function computeCorrelationOptimized(
    ref: Float32Array,
    target: Float32Array,
    lag: number
): number {
    const start = Math.max(0, -lag);
    const end = Math.min(ref.length, target.length - lag);

    if (start >= end) return 0;

    let sum = 0;
    for (let i = start; i < end; i++) {
        sum += ref[i] * target[i + lag];
    }

    return sum / (end - start);
}

function benchmark() {
    const size = 8000 * 10; // 10 seconds at 8kHz
    const ref = new Float32Array(size);
    const target = new Float32Array(size);

    for (let i = 0; i < size; i++) {
        ref[i] = Math.random();
        target[i] = Math.random();
    }

    const lags = [];
    for (let i = -8000; i <= 8000; i += 10) {
        lags.push(i);
    }

    console.log(`Running benchmark with ref size ${size}, target size ${size}, and ${lags.length} lags...`);

    // Warm up
    for (const lag of lags) {
        computeCorrelationOriginal(ref, target, lag);
        computeCorrelationOptimized(ref, target, lag);
    }

    const startOriginal = performance.now();
    for (let iter = 0; iter < 10; iter++) {
        for (const lag of lags) {
            computeCorrelationOriginal(ref, target, lag);
        }
    }
    const endOriginal = performance.now();
    console.log(`Original: ${(endOriginal - startOriginal).toFixed(4)}ms`);

    const startOptimized = performance.now();
    for (let iter = 0; iter < 10; iter++) {
        for (const lag of lags) {
            computeCorrelationOptimized(ref, target, lag);
        }
    }
    const endOptimized = performance.now();
    console.log(`Optimized: ${(endOptimized - startOptimized).toFixed(4)}ms`);

    // Verification
    for (const lag of lags) {
        const resOrig = computeCorrelationOriginal(ref, target, lag);
        const resOpt = computeCorrelationOptimized(ref, target, lag);
        if (Math.abs(resOrig - resOpt) > 1e-10) {
            console.error(`Verification failed for lag ${lag}: ${resOrig} vs ${resOpt}`);
            process.exit(1);
        }
    }
    console.log("Verification passed!");
}

benchmark();
