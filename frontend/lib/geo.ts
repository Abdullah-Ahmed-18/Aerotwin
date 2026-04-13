/**
 * Linear interpolation between two [lat, lon] coordinates.
 * t is 0..1, where 0 = from, 1 = to.
 */
export function lerpCoords(from: [number, number], to: [number, number], t: number): [number, number] {
    const clampedT = Math.max(0, Math.min(1, t));
    return [
        from[0] + (to[0] - from[0]) * clampedT,
        from[1] + (to[1] - from[1]) * clampedT,
    ];
}

/**
 * Calculate bearing (0-360 degrees) from point A to point B.
 */
export function calculateBearing(from: [number, number], to: [number, number]): number {
    const dLon = (to[1] - from[1]) * Math.PI / 180;
    const fromLat = from[0] * Math.PI / 180;
    const toLat = to[0] * Math.PI / 180;

    const y = Math.sin(dLon) * Math.cos(toLat);
    const x = Math.cos(fromLat) * Math.sin(toLat)
            - Math.sin(fromLat) * Math.cos(toLat) * Math.cos(dLon);
    let bearing = Math.atan2(y, x) * 180 / Math.PI;
    return ((bearing % 360) + 360) % 360;
}
