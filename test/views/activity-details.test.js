/** @jest-environment jsdom */
/** Checks that a recorded Train Now explanation is displayed as text and cannot become markup. */
import { renderActivityDetails } from '../../src/views/activity-details.js';

test('shows why Train Now chose the recorded session', () => {
    const element = document.createElement('div');
    element.innerHTML = renderActivityDetails({
        trainNowReasoning: 'Recovery chosen because the last two sessions were hard.',
    });
    expect(element.textContent).toContain('Why Train Now:');
    expect(element.textContent).toContain('Recovery chosen because the last two sessions were hard.');
});

test('escapes untrusted Train Now reasoning', () => {
    const element = document.createElement('div');
    element.innerHTML = renderActivityDetails({
        trainNowReasoning: '<img src=x onerror=alert(1)>',
    });
    expect(element.querySelector('img')).toBeNull();
    expect(element.textContent).toContain('<img src=x onerror=alert(1)>');
});
