import React, { useState } from 'react';
import { useAppStore } from '../../app/store';
import { Plus, Trash2, Edit2, Folder, Check, X } from 'lucide-react';

export const ProjectSidebar: React.FC = () => {
    const {
        projects,
        currentProjectId,
        createProject,
        switchProject,
        deleteProject,
        renameProject,
        hydrateMediaFiles
    } = useAppStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleCreateProject = () => {
        const name = `Adsız Proje ${projects.length + 1}`;
        createProject(name);
    };

    const handleSwitch = async (id: string) => {
        if (id === currentProjectId) return;
        switchProject(id);
        await hydrateMediaFiles(id);
    };

    const handleDelete = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Bu projeyi silmek istediğinize emin misiniz?')) {
            deleteProject(id);
        }
    };

    const startEditing = (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        setEditingId(id);
        setEditName(name);
    };

    const saveEdit = (e?: React.MouseEvent) => {
        if (e) e.stopPropagation();
        if (editingId && editName.trim()) {
            renameProject(editingId, editName.trim());
        }
        setEditingId(null);
    };

    const cancelEdit = (e: React.MouseEvent) => {
        e.stopPropagation();
        setEditingId(null);
    };

    return (
        <div className="w-64 bg-white border-r border-gray-200 h-full flex flex-col shrink-0 overflow-y-auto">
            <div className="p-4 border-b border-gray-200">
                <button
                    onClick={handleCreateProject}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
                >
                    <Plus size={20} />
                    <span>Yeni Proje</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-3 px-2">Projeler</h3>
                <div className="space-y-1">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            onClick={() => handleSwitch(project.id)}
                            className={`group flex items-center justify-between p-2 rounded-lg cursor-pointer transition-colors ${
                                currentProjectId === project.id
                                    ? 'bg-blue-50 text-blue-700'
                                    : 'hover:bg-gray-100 text-gray-700'
                            }`}
                        >
                            <div className="flex items-center space-x-3 overflow-hidden">
                                <Folder size={18} className={currentProjectId === project.id ? 'text-blue-500' : 'text-gray-400'} />

                                {editingId === project.id ? (
                                    <div className="flex items-center space-x-1" onClick={e => e.stopPropagation()}>
                                        <input
                                            type="text"
                                            value={editName}
                                            onChange={(e) => setEditName(e.target.value)}
                                            onKeyDown={(e) => e.key === 'Enter' && saveEdit()}
                                            autoFocus
                                            className="w-24 px-1 py-0.5 text-sm border rounded"
                                        />
                                        <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded">
                                            <Check size={14} />
                                        </button>
                                        <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-100 rounded">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-sm font-medium truncate" title={project.name}>
                                        {project.name}
                                    </span>
                                )}
                            </div>

                            {!editingId && (
                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => startEditing(e, project.id, project.name)}
                                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-100 rounded"
                                        title="Yeniden Adlandır"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, project.id)}
                                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-100 rounded"
                                        title="Sil"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
