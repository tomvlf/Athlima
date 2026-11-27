/*
 * Checks small power-chart HTML for planned targets, recorded readings, and missing data.
 * Tiny numeric samples are enough because the helper returns SVG text (drawn shapes)
 * without mounting a page. Labels must be escaped and unknown FTP must not look measured.
 */

import {renderPowerProfile} from '../../src/views/power-profile.js';

test('renders planned interval steps as a wattage profile', () => {
    const markup = renderPowerProfile({
        label: 'Threshold <ride>',
        ftp: 200,
        intervals: [{steps: [
            {duration: 300, power: 0.5},
            {duration: 600, power: 1},
        ]}],
    });

    expect(String(markup)).toContain('class="power-profile--target"');
    expect(String(markup)).toContain('Threshold &lt;ride&gt;');
    expect(String(markup)).toContain('role="img"');
    expect(String(markup)).toContain('fill="url(#power-profile-gradient-');
    expect(String(markup)).toContain('stop-color="#F8C73A"');
});

test('renders sampled ride power and omits unavailable profiles', () => {
    expect(String(renderPowerProfile({samples: [100, 120, 180], ftp: 200})))
        .toContain('class="power-profile--recorded"');
    expect(renderPowerProfile({samples: [0, NaN, -1]})).toBe('');
});

test('does not show an invented FTP reference on recorded profiles', () => {
    const withoutFtp = String(renderPowerProfile({samples: [100, 120, 180]}));
    expect(withoutFtp).not.toContain('power-profile--ftp');
    expect(String(renderPowerProfile({samples: [100, 120, 240], ftp: 200}))).toContain('power-profile--ftp');
    expect(withoutFtp).toContain('stroke="url(#power-profile-gradient-');
});
