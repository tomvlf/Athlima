/*
 * In-memory rider and bicycle weights used by Bluetooth trainer settings.
 * Stored/read values are kilograms. Weight setters take grams, matching the
 * app's weight input convention, and reject non-numeric inputs.
 */

import { isNumber } from '../functions.js';

// Initial options are kilograms; getters expose them. Only the rider-weight setter is public.
function UserData(args = {}) {
    const defaults = {
        userWeight: 75,
        bikeWeight: 8,
    };

    let _userWeight = args.userWeight ?? defaults.userWeight;
    let _bikeWeight = args.bikeWeight ?? defaults.bikeWeight;

    function userWeight() {
        return _userWeight;
    }

    function bikeWeight() {
        return _bikeWeight;
    }

    // x: Int
    // weight in grams 75000 -> 75 kg
    function setUserWeight(x) {
        if(isNumber(x)) {
            _userWeight = x / 1000;
        } else {
            throw 'invalid userWeight';
        }
    }

    // x: Int
    // weight in grams 8000 -> 8 kg
    function setBikeWeight(x) {
        if(isNumber(x)) {
            _bikeWeight = x / 1000;
        } else {
            throw 'invalid bikeWeight';
        }
    }

    return {
        userWeight,
        bikeWeight,
        setUserWeight,
    };
}

const userData = UserData();

export {
    UserData,
    userData,
};

