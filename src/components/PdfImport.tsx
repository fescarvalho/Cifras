"use client";

import { useState } from "react";
import { LiturgicalPart } from "@/generated/prisma/client";
import { saveMassFromImport } from "@/app/actions";
import { useRouter } from "next/navigation";

interface ExtractedSong {
  id: string;
  title: string;
  content: string;
  part: LiturgicalPart;
}

const LITURGICAL_PARTS = [
  "ENTRADA", "PERDAO", "GLORIA", "SALMO", "ACLAMACAO", "OFERTORIO", 
  "SANTO", "RESPOSTAS_EUCARISTICAS", "AMEM", "CORDEIRO", 
  "COMUNHAO", "ACAO_DE_GRACAS", "CANTO_FINAL", "ESPECIAL"
] as const;

export default function PdfImport() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [songs, setSongs] = useState<ExtractedSong[]>([]);
  
  // Setlist Details
  const [massTitle, setMassTitle] = useState("");
  const [massDate, setMassDate] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setError(null);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    
    setIsUploading(true);
    setError(null);
    
    const formData = new FormData();
    formData.append("file", file);
    
    try {
      const res = await fetch("/api/parse-pdf", {
        method: "POST",
        body: formData,
      });
      
      const data = await res.json();
      
      if (!res.ok) {
        throw new Error(data.error || "Erro ao processar o PDF.");
      }
      
      setSongs(data.songs);
      
      // Try to guess mass title from filename
      if (!massTitle) {
         setMassTitle(file.name.replace(".pdf", ""));
      }
      // Default to next Sunday or today for date if not set
      if (!massDate) {
         const today = new Date();
         setMassDate(today.toISOString().split("T")[0]);
      }
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsUploading(false);
    }
  };

  const updateSong = (id: string, field: keyof ExtractedSong, value: string) => {
    setSongs(songs.map(s => s.id === id ? { ...s, [field]: value } : s));
  };
  
  const removeSong = (id: string) => {
    setSongs(songs.filter(s => s.id !== id));
  };

  const handleSaveMass = async () => {
    if (!massTitle || !massDate || songs.length === 0) {
      setError("Preencha o título da missa, data e garanta que há músicas.");
      return;
    }
    
    setIsSaving(true);
    setError(null);
    
    try {
      const res = await saveMassFromImport({
        title: massTitle,
        dateStr: massDate,
        songs: songs.map(s => ({
            title: s.title,
            content: s.content,
            part: s.part
        }))
      });
      
      if (!res.success) {
        throw new Error(res.error);
      }
      
      alert("Missa importada e salva com sucesso!");
      router.push("/");
      
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSaving(false);
    }
  };

  if (songs.length === 0) {
    return (
      <div className="p-6 bg-white rounded-xl shadow-md space-y-4 border border-gray-100">
        <h2 className="text-xl font-bold text-gray-800">Importar Repertório via PDF</h2>
        <p className="text-sm text-gray-600">
          Faça o upload de um PDF com as músicas. O sistema tentará extrair os textos e dividi-los.
        </p>
        
        <div className="flex flex-col gap-4">
          <input 
            type="file" 
            accept="application/pdf"
            onChange={handleFileChange}
            className="block w-full text-sm text-gray-500
              file:mr-4 file:py-2 file:px-4
              file:rounded-md file:border-0
              file:text-sm file:font-semibold
              file:bg-indigo-50 file:text-indigo-700
              hover:file:bg-indigo-100"
          />
          
          {error && <p className="text-red-500 text-sm font-medium">{error}</p>}
          
          <button
            onClick={handleUpload}
            disabled={!file || isUploading}
            className="w-full sm:w-auto px-4 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isUploading ? "Processando..." : "Extrair Músicas"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="p-6 bg-white rounded-xl shadow-md border border-gray-100 space-y-4">
        <h2 className="text-xl font-bold text-gray-800">Revisão do Repertório</h2>
        
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Título da Missa</label>
            <input 
              type="text" 
              value={massTitle} 
              onChange={e => setMassTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
              placeholder="Ex: Missa de Domingo"
            />
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">Data</label>
            <input 
              type="date" 
              value={massDate} 
              onChange={e => setMassDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>
      </div>
      
      {error && <p className="text-red-500 text-sm font-medium">{error}</p>}

      <div className="space-y-4">
        <h3 className="text-lg font-semibold text-gray-800">Músicas Extraídas ({songs.length})</h3>
        
        {songs.map((song, index) => (
          <div key={song.id} className="p-4 bg-white rounded-lg shadow-sm border border-gray-200 flex flex-col gap-3">
            <div className="flex justify-between items-center">
               <span className="font-medium text-gray-500 text-sm">Música {index + 1}</span>
               <button 
                 onClick={() => removeSong(song.id)}
                 className="text-red-500 text-sm hover:text-red-700 font-medium"
               >
                 Remover
               </button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Título</label>
                <input 
                  type="text" 
                  value={song.title} 
                  onChange={e => updateSong(song.id, 'title', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-gray-700">Momento Litúrgico</label>
                <select 
                  value={song.part} 
                  onChange={e => updateSong(song.id, 'part', e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  {LITURGICAL_PARTS.map(p => (
                    <option key={p} value={p}>{p.replace(/_/g, ' ')}</option>
                  ))}
                </select>
              </div>
            </div>
            
            <div className="space-y-1">
              <label className="text-xs font-medium text-gray-700">Conteúdo (Letra e Cifras)</label>
              <textarea 
                value={song.content} 
                onChange={e => updateSong(song.id, 'content', e.target.value)}
                rows={8}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500 whitespace-pre-wrap"
              />
            </div>
          </div>
        ))}
      </div>

      <div className="flex justify-end gap-3 pb-8">
         <button
            onClick={() => setSongs([])}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md font-medium hover:bg-gray-50 transition-colors"
          >
            Cancelar
         </button>
         <button
            onClick={handleSaveMass}
            disabled={isSaving || songs.length === 0}
            className="px-6 py-2 bg-indigo-600 text-white rounded-md font-medium hover:bg-indigo-700 disabled:opacity-50 transition-colors"
          >
            {isSaving ? "Salvando..." : "Salvar Missa Completa"}
         </button>
      </div>
    </div>
  );
}
