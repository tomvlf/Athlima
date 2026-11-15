/**
 * Small compatibility facade exposing the direct Intervals.icu browser integration to ride models.
 * API means the agreed way one program talks to another; this is not an Athlima backend or login
 * service.
 */
import { xf } from '../functions.js';
import intervals from './intervals.js';

/**
 * Return the shared integration and lifecycle hooks. start announces its saved connection status;
 * stop is intentionally empty because this facade owns no background process.
 */
export default function API() {
    return Object.freeze({
        intervals,
        start() {
            xf.dispatch('services', {intervals: intervals.status().connected});
        },
        stop() {},
    });
}
