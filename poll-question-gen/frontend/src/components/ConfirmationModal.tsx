import { useState, useEffect } from 'react';
import {
  Trash2,
  Edit3,
  X,
  LucideIcon,
  AlertTriangle
} from 'lucide-react';
import { ModalState, ModalType } from '@/shared/types';

interface ThemeStyles {
  icon: LucideIcon;
  iconColor: string;
  iconBg: string;
  confirmBtn: string;
  focusRing: string;
}

const themeConfig: Record<ModalType, ThemeStyles> = {
  delete: {
    icon: Trash2,
    iconColor: 'text-red-600 dark:text-red-400',
    iconBg: 'bg-red-100 dark:bg-red-500/20',
    confirmBtn: 'bg-red-600 hover:bg-red-700 text-white',
    focusRing: 'focus:ring-red-500',
  },
  edit: {
    icon: Edit3,
    iconColor: 'text-blue-600 dark:text-blue-400',
    iconBg: 'bg-blue-100 dark:bg-blue-500/20',
    confirmBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    focusRing: 'focus:ring-blue-500',
  },
  default: {
    icon: AlertTriangle,
    iconColor: 'text-amber-600 dark:text-amber-400',
    iconBg: 'bg-amber-100 dark:bg-amber-500/20',
    confirmBtn: 'bg-amber-500 hover:bg-amber-600 text-white',
    focusRing: 'focus:ring-amber-500',
  }
};

interface ConfirmationModalProps extends ModalState {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  type = 'default',
  confirmText = 'Confirm',
  cancelText = 'Cancel',
}) => {
  const [isRendered, setIsRendered] = useState(isOpen);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setIsRendered(true);
      const frame = requestAnimationFrame(() => setIsVisible(true));
      return () => cancelAnimationFrame(frame);
    } else {
      setIsVisible(false);
      const timer = setTimeout(() => setIsRendered(false), 300);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isRendered) return null;

  const currentTheme = themeConfig[type] || themeConfig.default;
  const Icon = currentTheme.icon;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-0">
      {/* Overlay */}
      <div
        className={`fixed inset-0 bg-gray-900/60 backdrop-blur-sm transition-opacity duration-300 ${isVisible ? 'opacity-100' : 'opacity-0'
          }`}
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className={`relative w-full max-w-lg transform overflow-hidden rounded-2xl bg-white dark:bg-gray-900 dark:border dark:border-gray-800 text-left align-middle shadow-2xl transition-all duration-300 ${isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-4 sm:translate-y-0'
          }`}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-500 dark:hover:bg-gray-800 dark:hover:text-gray-300 transition-colors"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Content */}
        <div className="px-6 pb-6 pt-8 sm:p-8 sm:flex sm:items-start">
          <div className={`mx-auto flex h-12 w-12 shrink-0 items-center justify-center rounded-full sm:mx-0 ${currentTheme.iconBg}`}>
            <Icon className={`h-6 w-6 ${currentTheme.iconColor}`} />
          </div>

          <div className="mt-4 text-center sm:ml-4 sm:mt-0 sm:text-left">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            <p className="mt-3 text-sm text-gray-500 dark:text-gray-400 leading-relaxed whitespace-pre-line">
              {description}
            </p>
          </div>
        </div>

        {/* Actions */}
        <div className="bg-gray-50 dark:bg-gray-900 px-6 py-4 sm:flex sm:flex-row-reverse sm:px-8 border-t border-gray-100 dark:border-gray-800">
          <button
            type="button"
            onClick={onConfirm}
            className={`inline-flex w-full justify-center rounded-xl px-5 py-2.5 text-sm font-semibold shadow-sm transition-all sm:ml-3 sm:w-auto ${currentTheme.confirmBtn} ${currentTheme.focusRing}`}
          >
            {confirmText}
          </button>

          <button
            type="button"
            onClick={onClose}
            className="mt-3 inline-flex w-full justify-center rounded-xl border border-gray-300 dark:border-gray-700 bg-white dark:bg-gray-900 px-5 py-2.5 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 transition-all sm:mt-0 sm:w-auto"
          >
            {cancelText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmationModal;