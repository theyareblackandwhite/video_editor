import type { PersistStorage, StorageValue } from 'zustand/middleware';
import * as idb from 'idb-keyval';
import type { AppState } from './index';

export const idbStorage: PersistStorage<AppState> = {
    getItem: async (name): Promise<StorageValue<AppState> | null> => {
        return (await idb.get(name)) || null;
    },
    setItem: async (name, value): Promise<void> => {
        await idb.set(name, value);
    },
    removeItem: async (name): Promise<void> => {
        await idb.del(name);
    },
};
