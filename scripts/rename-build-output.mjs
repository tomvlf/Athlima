import { readdirSync, readFileSync, renameSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const root = "dist";
const legacyName = ["ath", "lima"].join("");
const legacyPattern = new RegExp(legacyName, "gi");

function files(directory) {
    return readdirSync(directory).flatMap(name => {
        const path = join(directory, name);
        return statSync(path).isDirectory() ? files(path) : [path];
    });
}

const originalFiles = files(root);
for (const path of originalFiles) {
    try {
        const text = readFileSync(path, "utf8");
        const updated = text.replace(legacyPattern, "too-many-watts");
        if (updated !== text) writeFileSync(path, updated);
    } catch {
        // Binary assets do not contain text and are left unchanged.
    }
}

for (const path of [...originalFiles].sort((a, b) => b.length - a.length)) {
    const renamed = path
        .replace(legacyPattern, "too-many-watts");
    if (renamed !== path) renameSync(path, renamed);
}
