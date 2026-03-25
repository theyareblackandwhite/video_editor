import * as idb from 'idb-keyval';

// Use a dedicated store for media files to avoid collisions with state persistence 
// and improve reliability for large binary objects.
const mediaStore = idb.createStore('podcut-media', 'files');

export const mediaStorage = {
    async saveMediaFile(id: string, file: File): Promise<void> {
        await idb.set(`media_${id}`, file, mediaStore);
    },

    async getMediaFile(id: string): Promise<File | null> {
        return (await idb.get(`media_${id}`, mediaStore)) || null;
    },

    async deleteMediaFile(id: string): Promise<void> {
        await idb.del(`media_${id}`, mediaStore);
    }
};
