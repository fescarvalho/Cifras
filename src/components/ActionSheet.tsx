import React, { useEffect, useState } from "react";
import { Music, FileText, ListMusic, X, Image as ImageIcon } from "lucide-react";

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
        className={`fixed inset-0 z-50 bg-black/60 backdrop-blur-sm transition-opacity duration-300 ${
          isOpen ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-3xl shadow-2xl transform transition-transform duration-300 ease-out border-t border-slate-200 dark:border-slate-800 ${
          isOpen ? "translate-y-0" : "translate-y-full"
        }`}
        onTransitionEnd={handleAnimationEnd}
      >
        <div className="p-4 flex flex-col gap-2 relative">
          <div className="w-12 h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full mx-auto mb-4" />
          
          <button
            onClick={onClose}
            className="absolute top-2 right-2 min-w-[44px] min-h-[44px] flex items-center justify-center text-slate-400 active:text-slate-600 dark:active:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full active:scale-95 transition-all"
          >
            <X size={18} />
          </button>

          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 px-2 mt-2">
            {mode === "song" ? "Adicionar Cifra" : "Novo"}
          </h3>

          <button
            onClick={() => {
              onClose();
              onNewManual();
            }}
            className="flex items-center gap-4 w-full p-4 text-left active:bg-slate-100 dark:active:bg-slate-800/50 rounded-xl transition-all active:scale-[0.98]"
          >
            <div className="bg-violet-100 dark:bg-violet-900/40 p-3 rounded-full text-violet-600 dark:text-violet-400">
              {mode === "song" ? <Music size={24} /> : <ListMusic size={24} />}
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">
                {mode === "song" ? "Nova Música Manual" : "Novo Repertório (Missa)"}
              </div>
              <div className="text-sm text-slate-500 dark:text-slate-400">
                {mode === "song" ? "Digitar ou colar a cifra e letra" : "Criar uma lista de músicas para tocar"}
              </div>
            </div>
          </button>

          {onNewPrint && (
            <button
              onClick={() => {
                onClose();
                onNewPrint();
              }}
              className="flex items-center gap-4 w-full p-4 text-left active:bg-slate-100 dark:active:bg-slate-800/50 rounded-xl transition-all active:scale-[0.98]"
            >
              <div className="bg-sky-100 dark:bg-sky-900/40 p-3 rounded-full text-sky-600 dark:text-sky-400">
                <ImageIcon size={24} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                  <span>Importar via Print / Foto</span>
                  <span className="text-[10px] bg-sky-100 dark:bg-sky-900/60 text-sky-700 dark:text-sky-300 font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                    IA
                  </span>
                </div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Extrair cifra de captura de tela ou foto</div>
              </div>
            </button>
          )}

          {onNewPdf && (
            <button
              onClick={() => {
                onClose();
                onNewPdf();
              }}
              className="flex items-center gap-4 w-full p-4 text-left active:bg-slate-100 dark:active:bg-slate-800/50 rounded-xl transition-all active:scale-[0.98]"
            >
              <div className="bg-emerald-100 dark:bg-emerald-900/40 p-3 rounded-full text-emerald-600 dark:text-emerald-400">
                <FileText size={24} />
              </div>
              <div>
                <div className="font-semibold text-slate-900 dark:text-slate-100">Importar de PDF</div>
                <div className="text-sm text-slate-500 dark:text-slate-400">Extrair cifra automaticamente</div>
              </div>
            </button>
          )}
          
          {/* Extra padding for safe area */}
          <div className="h-6" />
        </div>
      </div>
    </>
  );
}
