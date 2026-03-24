import React, { useState, useEffect } from 'react';
import { supabase } from '../../../shared/api/supabase';
import { 
  Bot, Users, Settings, Trophy, ShoppingCart, Camera, Gamepad2, Undo2,
  Save, CheckCircle2, AlertCircle, Loader2, Plus, Trash2, Link as LinkIcon
} from 'lucide-react';

interface OctagonSection {
  section_id: number;
  title: string;
  content: string;
}

export interface TiendaProduct {
  asin: string;
  title: string;
  price: string;
  rating: string;
  imageUrl: string;
  affiliateUrl: string;
}

export const OctagonSettingsPanel: React.FC = () => {
  const [sections, setSections] = useState<OctagonSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<number | null>(null);
  const [message, setMessage] = useState<{ id: number, text: string, type: 'success' | 'error' } | null>(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data, error } = await supabase
        .from('octagon_settings')
        .select('*')
        .order('section_id', { ascending: true });

      if (error) throw error;
      setSections(data || []);
    } catch (err) {
      console.error('Error fetching octagon settings:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleContentChange = (id: number, value: string) => {
    setSections(prev => prev.map(s => s.section_id === id ? { ...s, content: value } : s));
  };

  const saveSection = async (id: number) => {
    const section = sections.find(s => s.section_id === id);
    if (!section) return;

    setSavingId(id);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('octagon_settings')
        .update({ content: section.content, updated_at: new Date().toISOString() })
        .eq('section_id', id);

      if (error) throw error;
      setMessage({ id, text: 'Guardado correctamente', type: 'success' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      console.error('Error saving octagon section:', err);
      setMessage({ id, text: 'Error al guardar', type: 'error' });
    } finally {
      setSavingId(null);
    }
  };

  const getIcon = (id: number) => {
    const props = { size: 24, className: "text-cyan-400" };
    switch(id) {
      case 0: return <Bot {...props} />;
      case 1: return <Users {...props} />;
      case 2: return <Settings {...props} />;
      case 3: return <Trophy {...props} />;
      case 4: return <ShoppingCart {...props} />;
      case 5: return <Camera {...props} />;
      case 6: return <Gamepad2 {...props} />;
      case 7: return <Undo2 {...props} />;
      default: return <Settings {...props} />;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="w-8 h-8 text-cyan-400 animate-spin" />
          <p className="text-slate-400 animate-pulse">Cargando configuración...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">Configuración Menú Octagonal</h1>
        <p className="text-slate-400">Personaliza el texto informativo que aparece en cada sección del menú VIVO.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-12">
        {sections.map((section) => (
          <div key={section.section_id} className="bg-slate-800 rounded-xl p-6 border border-slate-700 flex flex-col h-full hover:border-slate-500 transition-colors">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-slate-900 rounded-lg border border-slate-700">
                  {getIcon(section.section_id)}
                </div>
                <h3 className="text-lg font-semibold text-white uppercase tracking-wider">{section.title}</h3>
              </div>
              <span className="text-[10px] font-bold text-slate-500 bg-slate-900 px-2 py-1 rounded">SECTION {section.section_id}</span>
            </div>

            <div className="flex-1 mb-4 flex flex-col min-h-0">
              <label className="block text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">Contenido Dinámico</label>
              
              {section.section_id === 4 ? (
                <TiendaEditor 
                  value={section.content} 
                  onChange={(val) => handleContentChange(section.section_id, val)} 
                />
              ) : (
                <textarea
                  value={section.content}
                  onChange={(e) => handleContentChange(section.section_id, e.target.value)}
                  placeholder={`Escribe aquí el texto que verá el usuario en ${section.title}...`}
                  className="w-full h-48 bg-slate-900 border border-slate-700 rounded-lg p-4 text-slate-200 focus:outline-none focus:border-cyan-500 text-sm resize-none scrollbar-thin scrollbar-thumb-slate-700"
                />
              )}
            </div>

            <div className="flex items-center justify-between">
              <div className="h-6">
                {message?.id === section.section_id && (
                  <span className={`text-xs flex items-center gap-1 ${message.type === 'success' ? 'text-emerald-400' : 'text-rose-400'} animate-in fade-in slide-in-from-left-2 duration-300`}>
                    {message.type === 'success' ? <CheckCircle2 size={14} /> : <AlertCircle size={14} />}
                    {message.text}
                  </span>
                )}
              </div>
              <button
                onClick={() => saveSection(section.section_id)}
                disabled={savingId === section.section_id}
                className="flex items-center gap-2 px-6 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-slate-700 text-white rounded-lg transition-all font-bold text-xs uppercase tracking-widest shadow-lg shadow-cyan-900/20 active:scale-95"
              >
                {savingId === section.section_id ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Save size={16} />
                )}
                Guardar
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="pt-8 pb-4 text-center border-t border-slate-700/50">
        <p className="text-slate-500 text-[10px] uppercase tracking-[0.2em] font-medium font-mono text-center">
          © 2026 ANTIGRAVITY SOLUTIONS • OCTAGON DYNAMIC CONTENT LAYER
        </p>
      </div>
    </div>
  );
};

// --- Specialized Tienda Editor ---
const TiendaEditor: React.FC<{ value: string, onChange: (v: string) => void }> = ({ value, onChange }) => {
  const [products, setProducts] = useState<TiendaProduct[]>(() => {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        return parsed as TiendaProduct[];
      }
    } catch {
      // Ignore parse error on init
    }
    return [];
  });

  const updateProduct = (index: number, field: keyof TiendaProduct, val: string) => {
    const newProducts = [...products];
    const existing = newProducts[index];
    if (!existing) return;
    newProducts[index] = { ...existing, [field]: val } as TiendaProduct;
    
    // Auto generate affiliate link if ASIN changes and affiliate link is empty or starts with standard amazon url
    if (field === 'asin' && val) {
      const prod = newProducts[index];
      if (prod) prod.affiliateUrl = `https://www.amazon.es/dp/${val}/?tag=thomaspirzl-21`;
    }

    setProducts(newProducts);
    onChange(JSON.stringify(newProducts));
  };

  const addProduct = () => {
    if (products.length >= 6) return;
    const newProducts = [
      ...products, 
      { asin: '', title: '', price: '0.00€', rating: '5.0', imageUrl: '', affiliateUrl: '' }
    ];
    setProducts(newProducts);
    onChange(JSON.stringify(newProducts));
  };

  const removeProduct = (index: number) => {
    const newProducts = products.filter((_, i) => i !== index);
    setProducts(newProducts);
    onChange(JSON.stringify(newProducts));
  };

  return (
    <div className="flex flex-col gap-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-thin scrollbar-thumb-slate-700">
      {products.map((prod, i) => (
        <div key={i} className="bg-slate-900 border border-slate-700 rounded-lg p-4 space-y-3 relative group">
          <button 
            onClick={() => removeProduct(i)}
            className="absolute top-2 right-2 p-1.5 text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 rounded transition-colors"
          >
            <Trash2 size={14} />
          </button>
          
          <div className="text-xs font-bold text-emerald-500 uppercase flex items-center gap-1.5 mb-2">
            <ShoppingCart size={14} /> Producto {i + 1}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] text-slate-400 uppercase mb-1 block">ASIN</label>
              <input 
                type="text" 
                value={prod.asin} 
                onChange={e => updateProduct(i, 'asin', e.target.value)}
                placeholder="ej: B0DPW3TY8C"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase mb-1 block">Precio</label>
              <input 
                type="text" 
                value={prod.price} 
                onChange={e => updateProduct(i, 'price', e.target.value)}
                placeholder="ej: 79.99€"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 uppercase mb-1 block">Título del Producto</label>
              <input 
                type="text" 
                value={prod.title} 
                onChange={e => updateProduct(i, 'title', e.target.value)}
                placeholder="Backgammon Premium Set..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="col-span-2">
              <label className="text-[10px] text-slate-400 uppercase mb-1 block">URL Imagen (Amazon)</label>
              <input 
                type="text" 
                value={prod.imageUrl} 
                onChange={e => updateProduct(i, 'imageUrl', e.target.value)}
                placeholder="https://m.media-amazon.com/..."
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 uppercase mb-1 block">Valoración</label>
              <input 
                type="text" 
                value={prod.rating} 
                onChange={e => updateProduct(i, 'rating', e.target.value)}
                placeholder="4.8/5"
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
            </div>
          </div>

          <div>
             <label className="text-[10px] text-slate-400 uppercase mb-1 flex items-center gap-1"><LinkIcon size={10} /> Enlace de Afiliado</label>
             <input 
                type="text" 
                value={prod.affiliateUrl} 
                onChange={e => updateProduct(i, 'affiliateUrl', e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-1.5 text-xs text-white placeholder-slate-600 focus:border-emerald-500 outline-none"
              />
          </div>
        </div>
      ))}

      {products.length < 6 && (
        <button 
          onClick={addProduct}
          className="w-full py-3 border border-dashed border-slate-600 hover:border-emerald-500 text-slate-400 hover:text-emerald-400 rounded-lg flex items-center justify-center gap-2 text-xs font-bold transition-colors uppercase tracking-wider"
        >
          <Plus size={16} /> Añadir Producto ({products.length}/6)
        </button>
      )}
    </div>
  );
};
