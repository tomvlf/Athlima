/*
 * Connects an ANT+ USB adapter through the browser's serial interface, which
 * delivers a stream of bytes (small numbered pieces of data). Incoming chunks
 * may split or join messages, so MessageTransformer rebuilds complete ANT packets
 * before passing them to onData. The same lifecycle supports the USB fallback.
 */

//
// Web Serial
//
import { existance } from '../functions.js';
import { SerialPort } from './web-serial-polyfill.js';

const values = {
    dynastreamId:       4047, // 0x0FCF
    ANT_USB_2_Stick_Id: 1008,
    ANT_USB_m_Stick_Id: 1009,
    baudRate:           115200,
};

const filters = {
    dynastream: { filters: [{ usbVendorId: values.dynastreamId }] },
};

/**
 * Own one adapter, its reader and its writer. Callbacks receive complete packets
 * and closure notices; isOpen/isReading expose the two lifecycle flags without
 * opening anything. A custom request function can supply a USB-backed port.
 */
function SerialDriver(args = {}) {
    const defaults = {
        filter:   [{ usbVendorId: values.dynastreamId }],
        baudRate: 115200,
        onData:  defaultOnData,
        onClose: () => {},
    };

    async function defaultRequest() {
        // Ask the rider to choose an ANT adapter and grant this page access to it.
        const port = await navigator.serial.requestPort(filters.dynastream);
        return port;
    }

    const onData  = existance(args.onData, defaults.onData);
    const onClose = existance(args.onClose, defaults.onClose);
    const request = existance(args.request, defaultRequest);

    let port;
    let reader;
    let writer;
    let _reading = false;
    let _isOpen  = false;
    let readTask;

    function isOpen() { return _isOpen; }
    function setIsOpen(value) { _isOpen = value; return _isOpen; }

    function isReading() { return _reading; }
    function setReading(value) { _reading = value; return _reading; }


    // Acquire both streams, run the ready callback, then read until cancelled or disconnected.
    async function open(cb = () => {}) {
        if(isOpen()) return;

        const requestedPort = await request();
        await requestedPort.open({
            baudRate: defaults.baudRate,
            flowControl: 'hardware',
            bufferSize: 8192,
        });

        try {
            if(!requestedPort.readable || !requestedPort.writable) {
                throw new Error('The selected ANT+ adapter does not provide serial streams.');
            }

            port = requestedPort;
            writer = port.writable.getWriter();
            setIsOpen(true);
            setReading(true);
            await cb();
            readTask = read().catch(error => {
                console.error(':ant :serial :reader-error', error);
            });
        } catch(error) {
            setIsOpen(false);
            setReading(false);
            writer?.releaseLock();
            writer = undefined;
            await requestedPort.close();
            port = undefined;
            throw error;
        }
    }

    // Cancel any pending read; read() releases stream locks and closes the actual port.
    async function close() {
        if(!port) return;
        setIsOpen(false);
        setReading(false);
        await reader?.cancel().catch(() => {});
        await readTask;
    }

    // Deliver complete messages and always release the port, including after a read failure.
    async function read() {
        try {
            reader = port.readable
                .pipeThrough(new TransformStream(new MessageTransformer()))
                .getReader();

            while(isReading()) {
                const {value, done} = await reader.read();
                if(done) break;
                onData(value);
            }
        } catch(error) {
            if(isReading()) {
                console.error(':ant :serial :reader-error', error);
                throw error;
            }
        } finally {
            reader?.releaseLock();
            reader = undefined;
            writer?.releaseLock();
            writer = undefined;
            const closingPort = port;
            port = undefined;
            setReading(false);
            setIsOpen(false);
            await closingPort?.close().catch(error => {
                console.error(':ant :serial :close-error', error);
            });
            onClose();
        }
    }

    // With no application callback, make received packets visible in the browser console.
    function defaultOnData(data) {
        console.log(data);
    }

    // Send only the bytes covered by this DataView, not unrelated bytes in its backing buffer.
    async function write(dataview) {
        if(!isOpen() || !writer) {
            throw new Error('ANT+ adapter is not open.');
        }
        const bytes = new Uint8Array(
            dataview.buffer,
            dataview.byteOffset,
            dataview.byteLength
        );
        return writer.write(bytes);
    }

    return {
        isOpen,
        isReading,
        request,
        open,
        close,
        read,
        write,
    };
}

// Reuse the serial lifecycle with a USB adapter wrapped to look like a serial port.
function SerialPolyfillDriver(args = {}) {

    async function request() {
        // Use the browser's USB permission dialog instead of its serial-port dialog.
        const device = await navigator.usb.requestDevice(filters.dynastream);
        const port = new SerialPort(device);
        return port;
    }

    return SerialDriver(Object.assign(args, {request}));
}





/**
 * Reassemble packets across arbitrary stream chunks. The 0xA4 marker starts a
 * packet; its length byte excludes the four framing bytes. Incomplete packets
 * stay buffered, and stray bytes before a marker are discarded.
 */
class MessageTransformer {
    constructor() {
        this.buffer = [];
        this.sync = 0xA4;
    }
    // Emit every complete packet in this chunk; leave the remaining fragment for the next call.
    transform(chunk, controller) {
        this.buffer.push(...chunk);

        while(this.buffer.length >= 2) {
            const syncIndex = this.buffer.indexOf(this.sync);
            if(syncIndex === -1) {
                this.buffer.length = 0;
                return;
            }

            if(syncIndex > 0) this.buffer.splice(0, syncIndex);

            const messageLength = this.buffer[1] + 4;
            if(this.buffer.length < messageLength) return;

            controller.enqueue(Uint8Array.from(this.buffer.splice(0, messageLength)));
        }
    }
}

export { SerialDriver, SerialPolyfillDriver, MessageTransformer };
