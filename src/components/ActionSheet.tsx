import React, { useEffect, useState } from "react";
import { Music, FileText, X } from "lucide-react";

interface ActionSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onNewManual: () => void;
  onNewPdf: () => void;
}

export default function ActionSheet({ isOpen, onClose, onNewManual, onNewPdf }: ActionSheetProps) {
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
            className="absolute top-4 right-4 p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-800 rounded-full"
          >
            <X size={18} />
          </button>

          <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 px-2">Adicionar Cifra</h3>

          <button
            onClick={() => {
              onClose();
              onNewManual();
            }}
            className="flex items-center gap-4 w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors active:scale-95"
          >
            <div className="bg-violet-100 dark:bg-violet-900/40 p-3 rounded-full text-violet-600 dark:text-violet-400">
              <Music size={24} />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Nova Música Manual</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Digitar ou colar a cifra e letra</div>
            </div>
          </button>

          <button
            onClick={() => {
              onClose();
              onNewPdf();
            }}
            className="flex items-center gap-4 w-full p-4 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50 rounded-xl transition-colors active:scale-95"
          >
            <div className="bg-emerald-100 dark:bg-emerald-900/40 p-3 rounded-full text-emerald-600 dark:text-emerald-400">
              <FileText size={24} />
            </div>
            <div>
              <div className="font-semibold text-slate-900 dark:text-slate-100">Importar de PDF</div>
              <div className="text-sm text-slate-500 dark:text-slate-400">Extrair cifra automaticamente</div>
            </div>
          </button>
          
          {/* Extra padding for safe area */}
          <div className="h-6" />
        </div>
      </div>
    </>
  );
}
