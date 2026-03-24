import { ModalState } from "@/shared/types";
import { useCallback, useRef, useState } from "react";

const defaultConfig: ModalState = {
  title: '',
  description: '',
  type: 'default',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
};

export function useConfirmationModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [config, setConfig] = useState<ModalState>(defaultConfig);

  const resolverRef = useRef<((value: boolean) => void | null)>(null);

  const showModal = useCallback((options: ModalState) => {
    setConfig({
      ...defaultConfig,
      ...options,
    });

    setIsOpen(true);

    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  const handleConfirm = () => {
    resolverRef.current?.(true);
    resolverRef.current = null;
    setIsOpen(false);
  };

  const handleClose = () => {
    resolverRef.current?.(false);
    resolverRef.current = null;
    setIsOpen(false);
  };

  return {
    isOpen,
    showModal,
    modalProps: {
      isOpen,
      onClose: handleClose,
      onConfirm: handleConfirm,
      ...config,
    },
  };
}