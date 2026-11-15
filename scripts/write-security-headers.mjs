/**
 * Run after building the website to create Nginx response headers, the rules a browser receives
 * alongside each page. The two arguments are built HTML and output configuration paths. The Content
 * Security Policy (CSP) limits which scripts and outside connections the page can use. Re-run this
 * whenever the built HTML changes.
 */
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const [htmlPath, destination] = process.argv.slice(2);
if(!htmlPath || !destination) throw new Error('Provide built HTML and a destination for security headers.');

const html = readFileSync(htmlPath, 'utf8');
/**
 * Give each exact inline script, including Parcel's import map, a content fingerprint (SHA-256
 * hash). Allowing these fingerprints does not allow arbitrary inline scripts or eval. External
 * script tags do not need inline-content fingerprints.
 */
const hashes = new Set();
for(const [, attributes, content] of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi)) {
    if(/\bsrc\s*=/i.test(attributes) || !content.trim()) continue;
    hashes.add(`'sha256-${createHash('sha256').update(content).digest('base64')}'`);
}

/**
 * Start with everything forbidden, then allow only the resources the app needs. Inline styles are
 * allowed for the existing screen updates, but inline script attributes are not.
 */
const policy = [
    "default-src 'none'",
    `script-src 'self' ${[...hashes].join(' ')}`.trim(),
    "script-src-attr 'none'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "connect-src 'self' https://intervals.icu",
    "worker-src 'self'",
    "manifest-src 'self'",
    "media-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
].join('; ');

/**
 * Write directives for Nginx. "always" applies the protective headers even to error responses;
 * hardware permissions remain limited to this site.
 */
writeFileSync(destination, [
    `add_header Content-Security-Policy "${policy}" always;`,
    'add_header X-Content-Type-Options "nosniff" always;',
    'add_header X-Frame-Options "DENY" always;',
    'add_header Referrer-Policy "no-referrer" always;',
    'add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), payment=(), bluetooth=(self), serial=(self), usb=(self), screen-wake-lock=(self)" always;',
    '',
].join('\n'));
