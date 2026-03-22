import React from 'react';
import { Layout, Sparkles, AlertTriangle } from 'lucide-react';
import { useThumbnailStore, type ThumbnailObject } from '../../../../../store/thumbnailSlice';

interface TemplateDef {
  name: string;
  description: string;
  objects: Partial<ThumbnailObject>[];
}

const TEMPLATES: TemplateDef[] = [
  {
    name: 'Modern Vlog',
    description: 'Büyük vurgulu metin ve sosyal medya ikonları.',
    objects: [
      {
        type: 'text',
        text: 'VLOG BAŞLIĞI',
        x: 50,
        y: 50,
        fontSize: 120,
        fill: '#ffffff',
        fontFamily: 'Anton',
        fontStyle: 'bold',
        textBackgroundEnabled: true,
        textBackgroundColor: '#ef4444',
        padding: 20,
      },
      {
        type: 'image',
        src: 'https://cdn-icons-png.flaticon.com/512/1384/1384060.png',
        x: 50,
        y: 550,
        width: 100,
        height: 100,
      }
    ]
  },
  {
    name: 'Gaming / VS',
    description: 'İki tarafı ayıran metin ve vurgular.',
    objects: [
      {
        type: 'text',
        text: 'VS',
        x: 500,
        y: 250,
        fontSize: 200,
        fill: '#facc15',
        fontFamily: 'Bangers',
        stroke: '#000000',
        strokeWidth: 8,
      },
      {
        type: 'rect',
        x: 630,
        y: 0,
        width: 20,
        height: 720,
        fill: '#ffffff',
        opacity: 0.5,
      }
    ]
  },
  {
    name: 'Minimalist',
    description: 'Temiz ve profesyonel görünüm.',
    objects: [
      {
        type: 'text',
        text: 'EĞİTİM SERİSİ',
        x: 100,
        y: 100,
        fontSize: 80,
        fill: '#3b82f6',
        fontFamily: 'Inter',
        fontStyle: 'bold',
      },
      {
        type: 'rect',
        x: 100,
        y: 200,
        width: 400,
        height: 10,
        fill: '#3b82f6',
      }
    ]
  }
];

export const TemplatesPanel: React.FC = () => {
  const { loadTemplate, thumbnailObjects } = useThumbnailStore();

  const handleLoad = (template: TemplateDef) => {
    if (thumbnailObjects.length > 0) {
      if (!window.confirm('Mevcut tasarımınız silinecek ve şablon yüklenecek. Onaylıyor musunuz?')) {
        return;
      }
    }
    loadTemplate(template.objects as ThumbnailObject[]);
  };

  return (
    <div className="flex flex-col gap-4 p-1">
      <div className="p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl flex gap-3 items-start">
        <Sparkles className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-blue-300 leading-relaxed font-medium">
          Şablonlar, önceden hazırlanmış metin ve şekil düzenleridir. Mevcut arka planınızı korurlar.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        {TEMPLATES.map((template, idx) => (
          <button
            key={idx}
            onClick={() => handleLoad(template)}
            className="group flex flex-col p-4 rounded-xl bg-slate-800/40 border border-slate-700/50 hover:bg-slate-700/60 hover:border-blue-500/50 transition-all text-left"
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-white group-hover:text-blue-400 transition-colors">
                {template.name}
              </span>
              <Layout className="w-3.5 h-3.5 text-slate-500 group-hover:text-blue-400" />
            </div>
            <p className="text-[10px] text-slate-500 leading-tight">
              {template.description}
            </p>
          </button>
        ))}
      </div>

      <div className="mt-4 p-3 border border-dashed border-slate-700 rounded-xl flex gap-2 items-center opacity-50">
        <AlertTriangle className="w-4 h-4 text-slate-500" />
        <span className="text-[10px] text-slate-500 italic">Daha fazla şablon yakında...</span>
      </div>
    </div>
  );
};
