import * as idb from 'idb-keyval';

export const mediaStorage = {
    async saveMediaFile(id: string, file: File): Promise<void> {
        await idb.set(`media_${id}`, file);
    },

    async getMediaFile(id: string): Promise<File | null> {
        return (await idb.get(`media_${id}`)) || null;
    },

    async deleteMediaFile(id: string): Promise<void> {
        await idb.del(`media_${id}`);
    }
};
