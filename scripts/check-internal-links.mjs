import { readdirSync, statSync, readFileSync, existsSync } from 'node:fs';
import { extname, resolve, dirname, sep } from 'node:path';

const ignoredDirectories = new Set(['.git', '.parcel-cache', 'node_modules', 'dist', 'coverage', 'test-results', 'playwright-report']);

function filesUnder(directory) {
    return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
        if(entry.isDirectory()) {
            if(ignoredDirectories.has(entry.name)) return [];
            return filesUnder(resolve(directory, entry.name));
        }
        if(entry.isFile() && ['.md', '.html'].includes(extname(entry.name))) {
            return [resolve(directory, entry.name)];
        }
        return [];
    });
}

function targetsFrom(text) {
    const targets = [];
    for(const match of text.matchAll(/(?:\[[^\]]*\]\(([^)]+)\)|(?:href|src)=["']([^"']+)["'])/g)) {
        targets.push(match[1] || match[2]);
    }
    return targets.map(target => target.trim());
}

const failures = [];
for(const file of filesUnder(process.cwd())) {
    const text = readFileSync(file, 'utf8');
    for(const target of targetsFrom(text, file)) {
        if(!target || target.startsWith('#') || /^(?:https?:|mailto:|tel:|javascript:|data:)/.test(target)) continue;
        const clean = target.split(/[?#]/)[0];
        if(!clean) continue;
        if(clean.includes('${')) continue;
        const base = clean.startsWith('/') ? resolve(process.cwd(), `.${clean}`) : resolve(dirname(file), clean);
        const candidates = [base, `${base}.html`, resolve(base, 'index.html')];
        if(!candidates.some(existsSync)) {
            failures.push(`${file.replace(process.cwd() + sep, '')}: missing ${target}`);
        }
    }
}

if(failures.length) {
    console.error('Internal link check failed:\n' + failures.join('\n'));
    process.exit(1);
}
console.log('Internal link check passed');
