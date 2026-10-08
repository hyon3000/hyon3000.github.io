export const normalizeKataGoBackendPreference = (backend)=>backend === 'wasm' || backend === 'cpu' ? backend : 'webgpu';
export function getKataGoWarmupFallbackBackend(args) {
    if (args.stage !== 'warmup') return null;
    const activeBackend = args.activeBackend?.trim().toLowerCase();
    if (args.requestedBackend === 'webgpu' && activeBackend === 'webgpu') return 'wasm';
    if (args.requestedBackend !== 'cpu' && activeBackend === 'wasm') return 'cpu';
    return null;
}
export function shouldRetryKataGoModelLoadOnFallback(args) {
    return getKataGoWarmupFallbackBackend(args) !== null;
}
export function shouldCacheKataGoFallbackForRequest(args) {
    const fallbackBackend = args.fallbackBackend?.trim().toLowerCase();
    return !!fallbackBackend && fallbackBackend !== args.requestedBackend;
}
