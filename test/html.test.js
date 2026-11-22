/** @jest-environment jsdom */
/**
 * Exercises the shared safe-HTML helpers: text escaping, fragment pass-through, array rendering,
 * the explicit raw escape hatch and the refusal to accept unmarked strings at a DOM sink.
 */
import { html, raw, setHTML, insertHTML, parseXML, escapeHTML, isHTML, textOf } from '../src/html.js';

test('escapes interpolated text but keeps markup fragments intact', () => {
    const name = '<img src=x onerror=alert(1)> & "friends"';
    const card = html`<p>${name}</p>`;
    expect(card.toString()).toBe(`<p>${escapeHTML(name)}</p>`);
    expect(card.toString()).not.toContain('<img');
    expect(isHTML(card)).toBe(true);
});

test('passes fragments and arrays through without double escaping', () => {
    const items = [html`<li>${'a & b'}</li>`, raw('<li>trusted</li>')];
    const list = html`<ul>${items}</ul>`;
    expect(list.toString()).toBe('<ul><li>a &amp; b</li><li>trusted</li></ul>');
});

test('renders null, undefined and numbers predictably', () => {
    expect(textOf(html`${null}${undefined}${0}${Number.NaN}`)).toBe('0NaN');
});

test('raw marks an existing string as trusted', () => {
    expect(raw('<b>ok</b>').toString()).toBe('<b>ok</b>');
    expect(isHTML(raw('<b>ok</b>'))).toBe(true);
});

test('setHTML accepts fragments and inserts them', () => {
    const element = document.createElement('div');
    setHTML(element, html`<span>${'<script>'}</span>`);
    expect(element.innerHTML).toBe('<span>&lt;script&gt;</span>');
});

test('insertHTML accepts fragments at an adjacent position', () => {
    const element = document.createElement('ul');
    element.append(document.createElement('li'));
    insertHTML(element, 'afterbegin', html`<li>${'&'}</li>`);
    expect(element.children.length).toBe(2);
    expect(element.firstElementChild.textContent).toBe('&');
});

test('DOM sinks refuse plain strings', () => {
    const element = document.createElement('div');
    expect(() => setHTML(element, '<b>plain</b>')).toThrow(TypeError);
    expect(() => insertHTML(element, 'beforeend', '<b>plain</b>')).toThrow(TypeError);
});

test('uses the named Trusted Types policy for HTML sinks and XML parsing', () => {
    const trustedValue = {trusted: true};
    const createHTML = jest.fn(() => trustedValue);
    const createPolicy = jest.fn(() => ({createHTML}));
    const previous = globalThis.trustedTypes;
    const previousDOMParser = globalThis.DOMParser;
    const parseFromString = jest.fn(() => 'parsed');
    globalThis.trustedTypes = {createPolicy};
    globalThis.DOMParser = class {
        parseFromString = parseFromString;
    };
    try {
        const element = document.createElement('div');
        setHTML(element, html`<b>${'safe'}</b>`);
        expect(parseXML('<workout_file />')).toBe('parsed');
        expect(createPolicy).toHaveBeenCalledWith('athlima', {createHTML: expect.any(Function)});
        expect(createHTML).toHaveBeenCalledWith('<b>safe</b>');
        expect(createHTML).toHaveBeenCalledWith('<workout_file />');
        expect(parseFromString).toHaveBeenCalledWith(trustedValue, 'text/xml');
    } finally {
        globalThis.trustedTypes = previous;
        globalThis.DOMParser = previousDOMParser;
    }
});
