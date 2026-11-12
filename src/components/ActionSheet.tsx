import React, { useEffect, useState } from "react";
import { Music, FileText, ListMusic, X, Image as ImageIcon, ChevronRight } from "lucide-react";

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onNewManual: () => void;
  onNewPdf?: () => void;
  onNewPrint?: () => void;
  mode?: "song" | "setlist";
}

export default function ActionSheet({ isOpen, onClose, onNewManual, onNewPdf, onNewPrint, mode = "song" }: ActionSheetProps) {
  const [show, setShow] = useState(isOpen);

  useEffect(() => {
    if (isOpen) setShow(true);
  }, [isOpen]);

  const handleAnimationEnd = () => {
    if (!isOpen) setShow(false);
  };

  if (!show && !isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 max-w-lg mx-auto bg-white/95 dark:bg-slate-900/95 backdrop-blur-xl rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out border-t border-slate-200/80 dark:border-slate-800 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        onTransitionEnd={handleAnimationEnd}
      >
        <div className="p-5 flex flex-col gap-2.5 relative pb-safe">
          <div className="w-10 h-1.5 bg-slate-300 dark:bg-slate-700 rounded-full mx-auto mb-2" />

          <div className="flex items-center justify-between px-1 mb-2">
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 tracking-tight">
                {mode === "song" ? "Adicionar Cifra" : "Criar Repertório"}
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Escolha como deseja cadastrar no seu acervo
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-9 h-9 flex items-center justify-center text-slate-400 active:text-slate-600 dark:active:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-all"
            >
              <X size={18} />
            </button>
          </div>

          <button
            onClick={() => {
              onClose();
              onNewManual();
            }}
            className="flex items-center justify-between gap-3.5 w-full p-3.5 text-left bg-slate-50/80 dark:bg-slate-800/50 hover:bg-violet-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-2xl transition-all active:scale-[0.98]"
          >
            <div className="flex items-center gap-3.5 min-w-0">
              <div className="bg-gradient-to-br from-violet-500 to-indigo-600 p-3 rounded-xl text-white shadow-md shadow-violet-500/20 shrink-0">
                {mode === "song" ? <Music size={22} /> : <ListMusic size={22} />}
              </div>
              <div className="min-w-0">
                <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                  {mode === "song" ? "Nova Música Manual" : "Novo Repertório (Missa)"}
                </div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                  {mode === "song" ? "Digitar ou colar a cifra e letra" : "Criar uma lista de músicas para tocar"}
                </div>
              </div>
            </div>
            <ChevronRight size={18} className="text-slate-400 shrink-0" />
          </button>

          {onNewPrint && (
            <button
              onClick={() => {
                onClose();
                onNewPrint();
              }}
              className="flex items-center justify-between gap-3.5 w-full p-3.5 text-left bg-slate-50/80 dark:bg-slate-800/50 hover:bg-sky-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-2xl transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="bg-gradient-to-br from-sky-500 to-cyan-600 p-3 rounded-xl text-white shadow-md shadow-sky-500/20 shrink-0">
                  <ImageIcon size={22} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100 flex items-center gap-2">
                    <span>Importar via Print / Foto</span>
                    <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
                      IA
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Extrair cifra de captura de tela ou foto
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-400 shrink-0" />
            </button>
          )}

          {onNewPdf && (
            <button
              onClick={() => {
                onClose();
                onNewPdf();
              }}
              className="flex items-center justify-between gap-3.5 w-full p-3.5 text-left bg-slate-50/80 dark:bg-slate-800/50 hover:bg-emerald-50/60 dark:hover:bg-slate-800 border border-slate-200/70 dark:border-slate-800 rounded-2xl transition-all active:scale-[0.98]"
            >
              <div className="flex items-center gap-3.5 min-w-0">
                <div className="bg-gradient-to-br from-emerald-500 to-teal-600 p-3 rounded-xl text-white shadow-md shadow-emerald-500/20 shrink-0">
                  <FileText size={22} />
                </div>
                <div className="min-w-0">
                  <div className="font-bold text-sm text-slate-900 dark:text-slate-100">
                    Importar de PDF
                  </div>
                  <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                    Extrair músicas mantendo o alinhamento dos acordes
                  </div>
                </div>
              </div>
              <ChevronRight size={18} className="text-slate-400 shrink-0" />
            </button>
          )}

          <div className="h-3" />
        </div>
      </div>
    </>
  );
}
