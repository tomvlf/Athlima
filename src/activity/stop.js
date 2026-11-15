/**
 * Handles the two confirmation decisions when finishing a ride. The page supplies its dialog,
 * checkpoint-clearing and stop functions so this logic can also be tested without opening real
 * dialogs.
 */
/**
 * Cancel leaves the ride alone. After confirming stop, rides under one minute offer save or
 * discard; discard clears recovery data first, so a failed clear cannot pretend the ride was
 * discarded.
 */
export async function stopRide({elapsed, confirmStop, clearCheckpoint, stop}) {
    if(!confirmStop('Confirm Stop?')) return;
    const discard = elapsed < 60 && !confirmStop('This ride is less than one minute. Save it? Select Cancel to discard it.');
    if(discard) await clearCheckpoint();
    stop(discard);
}
