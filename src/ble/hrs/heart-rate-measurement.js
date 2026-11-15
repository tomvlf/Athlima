/*
 * Reads a Bluetooth heart-rate message. Flags in its first byte say whether
 * heart rate needs one or two bytes and whether energy/beat intervals follow.
 * Results use beats/minute, energy in kilojoules and R–R intervals (time between
 * successive heartbeats) in seconds. Missing optional values remain undefined.
 */

//
// Heart Rate Spec
// Heart Rate Measurement characteristic
//

// A stateless decoder; dividing interval ticks by 1024 converts the sensor's timing units to seconds.
function HeartRateMeasurement(args = {}) {
    const rrIntervalResolution = 1024;

    // Follow the flags to keep optional-field positions aligned, then collect all complete two-byte intervals.
    function decode(dataview) {
        const flags = dataview.getUint8(0, true);
        const heartRateValueFormat    = ((flags >> 0) & 1) === 1;
        const sensorContactStatus     = ((flags >> 1) & 1) === 1;
        const sensorContactSupported  = ((flags >> 2) & 1) === 1;
        const energyExpenditureStatus = ((flags >> 3) & 1) === 1;
        const rrIntervalPresent       = ((flags >> 4) & 1) === 1;

        let i = 1;
        let heartRate = 0;
        let energyExpenditure;
        let rrInterval;

        if(heartRateValueFormat) {
            heartRate = dataview.getUint16(i, true);
            i += 2;
        } else {
            heartRate = dataview.getUint8(i, true);
            i += 1;
        }

        if(energyExpenditureStatus) {
            energyExpenditure = dataview.getUint16(i, true);
            i += 2;
        }

        if(rrIntervalPresent) {
            rrInterval = [];
            // A lone trailing byte is not a complete interval and is left unread.
            while(i <= dataview.byteLength - 2) {
                rrInterval.push(
                    dataview.getUint16(i, true) / rrIntervalResolution
                );
                i += 2;
            }
        }

        return {
            sensorContactSupported, // Bool
            sensorContactStatus, // Bool
            heartRate, // Int
            energyExpenditure, // Int?
            rrInterval, // [Float]?
        };
    }

    return Object.freeze({
        rrIntervalResolution,
        decode,
    });
}

const heartRateMeasurement = HeartRateMeasurement();

export {
    HeartRateMeasurement,
    heartRateMeasurement
};

