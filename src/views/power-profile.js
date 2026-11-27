/*
 * Builds the small power chart shown on workout and activity cards.
 * SVG is a picture described by lines and shapes. These helpers return its HTML
 * text for a caller to place on the page; they do not change the page themselves.
 * The accessible label is interpolated as text.
 */

import { html } from '../html.js';

const powerZoneStops = [
    [0, '#636468'],
    [0.54, '#328AFF'],
    [0.75, '#44A5AB'],
    [0.87, '#57C057'],
    [0.94, '#F8C73A'],
    [1.05, '#FF663A'],
    [1.2, '#FE340B'],
];

let gradientSequence = 0;

function renderPowerGradient(id, maxWatts, threshold, top, bottom) {
    const visibleStops = powerZoneStops.filter(([share]) => share * threshold <= maxWatts);
    const stops = visibleStops.map(([share, color]) =>
        html`<stop offset="${share * threshold / maxWatts * 100}%" stop-color="${color}"></stop>`,
    );
    const finalColor = visibleStops.at(-1)?.[1] || powerZoneStops[0][1];
    if(!visibleStops.length || visibleStops.at(-1)[0] * threshold < maxWatts) {
        stops.push(html`<stop offset="100%" stop-color="${finalColor}"></stop>`);
    }
    return html`<defs>
        <linearGradient id="${id}" gradientUnits="userSpaceOnUse"
                        x1="0" y1="${bottom}" x2="0" y2="${top}">
            ${stops}
        </linearGradient>
    </defs>`;
}

/**
 * Prefer planned interval targets; otherwise draw recorded watt samples.
 * FTP is the rider's reference power in watts. Targets use 200 W if it is absent.
 * Return an empty string when neither usable intervals nor enough samples exist.
 */
function renderPowerProfile({intervals = [], samples = [], ftp, label = 'Power profile'} = {}) {
    const hasThreshold = Number.isFinite(ftp) && ftp > 0;
    const threshold = hasThreshold ? ftp : 200;
    const width = 240;
    const height = 58;
    const left = 2;
    const right = width - 2;
    const top = 5;
    const bottom = height - 4;
    let segments = [];

    for(const interval of intervals) {
        for(const step of interval.steps || []) {
            const duration = Number(step.duration);
            const relativePower = Number(step.power);
            if(Number.isFinite(duration) && duration > 0 &&
               Number.isFinite(relativePower) && relativePower >= 0) {
                segments.push({duration, watts: relativePower * threshold});
            }
        }
    }

    if(segments.length) {
        // Horizontal width represents time; height represents power, not duration.
        const totalDuration = segments.reduce((sum, segment) => sum + segment.duration, 0);
        let elapsed = 0;
        const maxWatts = Math.max(threshold, ...segments.map(segment => segment.watts));
        const scale = value => bottom - (value / maxWatts) * (bottom - top);
        const points = [`M ${left} ${bottom}`];
        for(const segment of segments) {
            const x1 = left + (elapsed / totalDuration) * (right - left);
            elapsed += segment.duration;
            const x2 = left + (elapsed / totalDuration) * (right - left);
            const y = scale(segment.watts);
            points.push(`L ${x1} ${y}`, `L ${x2} ${y}`);
        }
        points.push(`L ${right} ${bottom}`, 'Z');
        const ftpY = scale(threshold);
        const gradientId = `power-profile-gradient-${++gradientSequence}`;
        return html`<figure class="power-profile">
            <figcaption>Power profile</figcaption>
            <svg viewBox="0 0 ${width} ${height}" role="img"
                 aria-label="${label}: target power from 0 to ${Math.round(maxWatts)} watts"
                 preserveAspectRatio="none">
                ${renderPowerGradient(gradientId, maxWatts, threshold, top, bottom)}
                <line class="power-profile--ftp" x1="${left}" y1="${ftpY}" x2="${right}" y2="${ftpY}"></line>
                <path class="power-profile--target" d="${points.join(' ')}"
                      fill="url(#${gradientId})" fill-opacity="0.78"></path>
            </svg>
        </figure>`;
    }

    const validSamples = samples.filter(value => Number.isFinite(value) && value >= 0);
    if(validSamples.length < 2) return '';

    // Average groups of readings so a long ride still produces a small preview.
    const bucketCount = Math.min(64, validSamples.length);
    const points = Array.from({length: bucketCount}, (_, index) => {
        const start = Math.floor(index * validSamples.length / bucketCount);
        const end = Math.max(start + 1, Math.floor((index + 1) * validSamples.length / bucketCount));
        const bucket = validSamples.slice(start, end);
        return bucket.reduce((sum, value) => sum + value, 0) / bucket.length;
    });
    const maxWatts = Math.max(1, hasThreshold ? threshold : 0, ...points);
    const x = index => left + (index / Math.max(1, points.length - 1)) * (right - left);
    const y = value => bottom - (value / maxWatts) * (bottom - top);
    const line = points.map((value, index) =>
        `${index ? 'L' : 'M'} ${x(index)} ${y(value)}`,
    ).join(' ');
    const area = `${line} L ${right} ${bottom} L ${left} ${bottom} Z`;
    const ftpY = bottom - (threshold / maxWatts) * (bottom - top);
    const gradientId = `power-profile-gradient-${++gradientSequence}`;

    return html`<figure class="power-profile">
        <figcaption>Power profile</figcaption>
        <svg viewBox="0 0 ${width} ${height}" role="img"
             aria-label="${label}: recorded power from 0 to ${Math.round(maxWatts)} watts"
             preserveAspectRatio="none">
            ${renderPowerGradient(gradientId, maxWatts, threshold, top, bottom)}
            ${hasThreshold ? html`<line class="power-profile--ftp" x1="${left}" y1="${ftpY}" x2="${right}" y2="${ftpY}"></line>` : ''}
            <path class="power-profile--recorded-area" d="${area}"
                  fill="url(#${gradientId})" fill-opacity="0.2"></path>
            <path class="power-profile--recorded" d="${line}"
                  stroke="url(#${gradientId})"></path>
        </svg>
    </figure>`;
}

export {renderPowerProfile};
