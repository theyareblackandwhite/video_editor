import React, { useState } from 'react';
import { useAppStore } from '../../app/store';
import { Plus, Trash2, Edit2, Folder, Check, X } from 'lucide-react';

interface ProjectSidebarProps {
    isOpen: boolean;
}

export const ProjectSidebar: React.FC<ProjectSidebarProps> = ({ isOpen }) => {
    const { projects, currentProjectId, createProject, switchProject, renameProject, deleteProject } = useAppStore();

    const [editingId, setEditingId] = useState<string | null>(null);
    const [editName, setEditName] = useState('');

    const handleCreateProject = () => {
        const name = `Adsız Proje ${projects.length + 1}`;
        createProject(name);
    };

    const handleSwitch = (id: string) => {
        if (id === currentProjectId) return;
        switchProject(id);
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
        <div className={`${isOpen ? 'w-64' : 'w-0'} bg-white border-r border-gray-200 h-full flex flex-col shrink-0 overflow-hidden transition-all duration-300 ease-in-out relative shadow-xl z-[60]`}>
            <div className="p-4 border-b border-gray-200 flex items-center justify-between min-w-[256px]">
                <h2 className="font-bold text-gray-800">Projelerim</h2>
            </div>

            <div className="p-4 border-b border-gray-200 min-w-[256px]">
                <button
                    onClick={handleCreateProject}
                    className="w-full flex items-center justify-center space-x-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm"
                >
                    <Plus size={20} />
                    <span className="font-medium">Yeni Proje</span>
                </button>
            </div>

            <div className="flex-1 overflow-y-auto p-2 min-w-[256px]">
                <div className="space-y-1">
                    {projects.map((project) => (
                        <div
                            key={project.id}
                            onClick={() => handleSwitch(project.id)}
                            className={`group flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                                currentProjectId === project.id
                                    ? 'bg-blue-50 text-blue-700 ring-1 ring-blue-100'
                                    : 'hover:bg-gray-50 text-gray-600'
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
                                            className="w-24 px-2 py-0.5 text-sm border border-blue-300 rounded focus:ring-2 focus:ring-blue-500 outline-none"
                                        />
                                        <button onClick={saveEdit} className="p-1 text-green-600 hover:bg-green-100 rounded">
                                            <Check size={14} />
                                        </button>
                                        <button onClick={cancelEdit} className="p-1 text-red-600 hover:bg-red-100 rounded">
                                            <X size={14} />
                                        </button>
                                    </div>
                                ) : (
                                    <span className="text-sm font-semibold truncate" title={project.name}>
                                        {project.name}
                                    </span>
                                )}
                            </div>

                            {!editingId && (
                                <div className="flex items-center space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => startEditing(e, project.id, project.name)}
                                        className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-100 rounded-lg"
                                        title="Yeniden Adlandır"
                                    >
                                        <Edit2 size={14} />
                                    </button>
                                    <button
                                        onClick={(e) => handleDelete(e, project.id)}
                                        className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-100 rounded-lg"
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
