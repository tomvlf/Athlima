/**
 * Run during an image build to write the version label displayed in the app. The first command-line
 * argument is the output JSON path. Build environment variables supply the release label and Git
 * revision; without them this is a development build. No training data is included.
 */
import { writeFileSync } from 'node:fs';

const destination = process.argv[2];
if(!destination) throw new Error('Provide a destination for build metadata.');

const version = process.env.TOO_MANY_WATTS_BUILD_VERSION?.trim() || 'development';
const revision = process.env.TOO_MANY_WATTS_BUILD_REVISION?.trim() || null;
writeFileSync(destination, `${JSON.stringify({version, revision})}\n`);
