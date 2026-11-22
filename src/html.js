/**
 * Safe HTML construction for the interface. `html` interpolates values as text unless they are
 * fragments created by `html`/`raw`, so imported names, descriptions and provider values cannot
 * become page instructions. `setHTML`/`insertHTML` are the only places that hand markup to the
 * browser; they create TrustedHTML through the `athlima` policy, which lets the Content Security
 * Policy enforce that every assignment goes through this module.
 *
 * Use `raw` only for markup that is already safe by construction, such as numeric-only charts.
 * It is an explicit trust decision, not a general escape hatch.
 */

const marker = Symbol('athlima.html');

const entities = {'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'};

/** Encode text for HTML. Null and undefined become empty text. */
export const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g, character => entities[character]);

/** A string-like markup fragment; being a String keeps existing string helpers and tests working. */
class HTMLFragment extends String {
    constructor(text) {
        super(text);
        Object.defineProperty(this, marker, {value: true});
    }
}

/** True when the value was produced by `html` or `raw` rather than being a plain string. */
export const isHTML = value => Boolean(value && value[marker] === true);

/**
 * Mark an already-constructed markup string as trusted. Prefer `html` for new code; this exists for
 * existing renderers whose values are escaped individually and for charts interpolating numbers.
 */
export function raw(value) {
    if(isHTML(value)) return value;
    return new HTMLFragment(String(value ?? ''));
}

/**
 * Render one interpolation. Whole fragments pass through, arrays are rendered item by item, and
 * everything else is escaped as text. `null`/`undefined` disappear instead of printing "undefined".
 */
function render(value) {
    if(value === null || value === undefined) return '';
    if(isHTML(value)) return value.toString();
    if(Array.isArray(value)) return value.map(render).join('');
    return escapeHTML(value);
}

/** Tagged template returning a trusted markup fragment with every interpolation escaped. */
export function html(strings, ...values) {
    if(!Array.isArray(strings) || !Array.isArray(strings.raw) || strings.length !== values.length + 1) {
        throw new TypeError('html must be used as a tagged template: html`...`');
    }
    let output = strings[0];
    for(let index = 0; index < values.length; index += 1) {
        output += render(values[index]) + strings[index + 1];
    }
    return raw(output);
}

/** Fragment text for tests and for composing with DOM APIs that accept text. */
export const textOf = value => render(value);

let policy;

/**
 * Convert a fragment to TrustedHTML when the browser supports Trusted Types. Without support (for
 * example jsdom in tests) the markup string is assigned directly and the CSP is not enforcing.
 */
function trusted(value) {
    if(!isHTML(value)) {
        throw new TypeError('HTML must be created with html`` or raw(); interpolate it instead of building strings.');
    }
    const factory = globalThis.trustedTypes;
    if(!factory || typeof factory.createPolicy !== 'function') return value.toString();
    if(!policy) {
        try {
            policy = factory.createPolicy('athlima', {createHTML: input => input});
        } catch(error) {
            // A policy name can only be created once per document. Fall back to the string when
            // another module already created it (tests, hot reload); enforcement still applies.
            return value.toString();
        }
    }
    return policy.createHTML(value.toString());
}

/** Replace an element's children with a trusted fragment. */
export function setHTML(element, value) {
    element.innerHTML = trusted(value);
}

/** Insert a trusted fragment at an adjacent position. */
export function insertHTML(element, position, value) {
    element.insertAdjacentHTML(position, trusted(value));
}
