import { create } from 'zustand';
import { persist, PersistStorage } from 'zustand/middleware';
import * as idb from 'idb-keyval';

interface AppState {
    count: number;
    file: File | null;
}

const idbStorage: PersistStorage<AppState> = {
    getItem: async (name) => {
        const val = await idb.get(name);
        return val || null;
    },
    setItem: async (name, value) => {
        await idb.set(name, value);
    },
    removeItem: async (name) => {
        await idb.del(name);
    },
};

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      count: 0,
      file: null,
    }),
    {
      name: 'test-storage',
      storage: idbStorage,
    }
  )
);
