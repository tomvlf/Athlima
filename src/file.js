/**
 * Reads user-selected files and prepares browser downloads without sending them to a server. Text
 * workouts and binary FIT files need different readers. A Blob is a file-like bundle in browser
 * memory; creating one does not itself save it to disk.
 */

//
// File Handler
//
import { dateToDashString } from './utils.js';

/**
 * Share file-reading and download operations between workouts and activities. Format interpretation
 * happens in the workout/FIT modules, not in this class.
 */
class FileHandler {
    Type = {
        OctetStream: 'application/octet-stream',
        textPlain: 'text/plain',
    }

    constructor(args) {}
    /**
     * Read a selected file as text and return a Promise that resolves to its contents or rejects
     * with the browser read error.
     */
    readTextFile(file) {
        const self = this;
        const reader = new FileReader();
        reader.readAsText(file);

        return new Promise((resolve, reject) => {
            reader.onload = function(event) {
                return resolve(reader.result);
            };
            reader.onerror = function(event) {
                return reject(reader.error);
            };
        });
    }
    /**
     * Read a selected file as raw bytes in an ArrayBuffer, preserving the binary structure needed
     * by FIT decoding.
     */
    readBinaryFile(file) {
        const self = this;
        const reader = new FileReader();
        reader.readAsArrayBuffer(file);

        return new Promise((resolve, reject) => {
            reader.onload = function(event) {
                return resolve(reader.result);
            };
            reader.onerror = function(event) {
                return reject(reader.error);
            };
        });
    }
    unsupporedFormat() {
        console.warn(`.fit workout files and other binary formats are not yet supported!`);
    }
    /**
     * Choose text or binary reading from the file extension; this only reads bytes/text, not the
     * workout structure.
     */
    read(file) {
        const self = this;
        let ext = file.name.split('.').pop();
        switch(ext) {
            case 'zwo': return self.readTextFile(file); break;
            case 'erg': return self.readTextFile(file); break;
            case 'mrc': return self.readTextFile(file); break;
            case 'fit': return self.readBinaryFile(file); break;
            default:           self.unsupportedFormat(); break;
        }
    }
    /** Wrap contents with a media-type label so the browser can treat them as a downloadable file. */
    toBlob(buffer, type) {
        const self = this;
        return new Blob([buffer], {type: type ?? self.Type.OctetStream});
    }
    /**
     * Create a reusable download function. Each call creates a temporary local URL, triggers a
     * named download and releases that URL afterwards.
     */
    download() {
        const self = this;
        let a = document.createElement('a');
        document.body.appendChild(a);
        a.style = 'display: none';
        return function (buffer, name, type) {
            let url = window.URL.createObjectURL(self.toBlob(buffer, type));
            a.href = url;
            a.download = name;
            a.click();
            window.URL.revokeObjectURL(url);
        };
    };
}

const fileHandler = new FileHandler();

export { fileHandler };
