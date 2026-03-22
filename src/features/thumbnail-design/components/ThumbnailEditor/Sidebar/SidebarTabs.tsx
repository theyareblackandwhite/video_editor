import React from 'react';
import { Settings, Package, LayoutTemplate } from 'lucide-react';

export type SidebarTab = 'edit' | 'elements' | 'templates';

interface SidebarTabsProps {
  activeTab: SidebarTab;
  onTabChange: (tab: SidebarTab) => void;
}

export const SidebarTabs: React.FC<SidebarTabsProps> = ({ activeTab, onTabChange }) => {
  const tabs = [
    { id: 'edit' as const, icon: <Settings className="w-4 h-4" />, label: 'Düzenle' },
    { id: 'elements' as const, icon: <Package className="w-4 h-4" />, label: 'Bileşenler' },
    { id: 'templates' as const, icon: <LayoutTemplate className="w-4 h-4" />, label: 'Şablonlar' },
  ];

  return (
    <div className="flex bg-slate-900/80 border border-slate-700/50 rounded-xl p-1 shadow-lg">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
          className={`flex-1 flex flex-col items-center justify-center gap-1.5 py-2.5 rounded-lg transition-all ${
            activeTab === tab.id
              ? 'bg-blue-600 text-white shadow-[0_0_15px_rgba(37,99,235,0.3)]'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}
        >
          {tab.icon}
          <span className="text-[10px] font-bold uppercase tracking-tight">
            {tab.label}
          </span>
        </button>
      ))}
    </div>
  );
};
