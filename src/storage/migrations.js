/**
 * Named IndexedDB migrations for the main Too Many Watts database.
 * Keeping migrations explicit makes upgrades reviewable and avoids fallthrough switch behavior.
 */
export const mainDatabaseMigrations = Object.freeze([
    {
        version: 1,
        name: 'create-session-workouts-activity',
        apply({createStore, storeNames}) {
            for(const storeName of storeNames) createStore(storeName);
        },
    },
    {version: 2, name: 'preserve-session-workouts-activity', apply() {}},
    {version: 3, name: 'preserve-session-workouts-activity-latest', apply() {}},
]);

export function runMainDatabaseMigrations({oldVersion, newVersion, createStore, storeNames = []}) {
    for(const migration of mainDatabaseMigrations) {
        if(migration.version <= oldVersion || migration.version > newVersion) continue;
        migration.apply({createStore, storeNames});
    }
}
