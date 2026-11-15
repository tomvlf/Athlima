/**
 * Shows the build label packaged with the frontend and optionally its Git revision, the identifier
 * of the source used to build it. This reports the code loaded in this browser, not a live update
 * check. A development build may have no revision.
 */
import frontendBuildInfo from './build-info.json';
import { escape } from './format.js';

const frontendVersion = frontendBuildInfo.version?.trim() || 'development';
const frontendRevision = frontendBuildInfo.revision?.trim() || '';
const label = (version, revision) => revision ? `${version} (${revision.slice(0, 12)})` : version;
const fullLabel = (version, revision) => revision ? `${version} / ${revision}` : version;

/**
 * Build an escaped version label, optionally showing a shortened revision while retaining the full
 * revision in the hover text.
 */
export function versionMarkup({showRevision = true} = {}) {
    return `<div class="app-versions" role="group" aria-label="Deployed versions" data-show-revision="${showRevision}">
        <span>Frontend: <strong data-frontend-version title="${escape(fullLabel(frontendVersion, frontendRevision))}">${escape(label(frontendVersion, showRevision ? frontendRevision : ''))}</strong></span>
        <span>Storage: on this device</span>
    </div>`;
}

/**
 * Return the version element already rendered in the supplied root. This compatibility hook does
 * not fetch version data or create a second label.
 */
export function mountVersions(root) {
    return root.querySelector('.app-versions');
}
