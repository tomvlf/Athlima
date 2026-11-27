import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const root = 'dist';

function files(directory) {
    return readdirSync(directory).flatMap(name => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? files(path) : [path];
    });
}

const allowed = /\.(?:html|js|css|png|jpe?g|webp|svg|webmanifest)$/i;
const assets = ['/', '/mobile', '/offline-assets.json'];
for(const path of files(root)) {
    if(!allowed.test(path)) continue;
    assets.push(`/${relative(root, path).split(sep).join('/')}`);
}

writeFileSync(join(root, 'offline-assets.json'), `${JSON.stringify({cacheName: 'too-many-watts-shell-v4', assets}, null, 2)}\n`);
