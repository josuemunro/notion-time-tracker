import React, { createContext, useContext, useState } from 'react';
import { CheckIcon, XMarkIcon, ArrowUturnLeftIcon } from '@heroicons/react/24/solid';

const ToastContext = createContext();

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

export const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);

  const addToast = (toast) => {
    const id = Date.now();
    const newToast = { id, ...toast };
    setToasts(prev => [...prev, newToast]);

    // Auto-remove toast after duration (default 5 seconds)
    setTimeout(() => {
      removeToast(id);
    }, toast.duration || 5000);

    return id;
  };

  const removeToast = (id) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  };

  const showSuccess = (message, options = {}) => {
    return addToast({ type: 'success', message, ...options });
  };

  const showError = (message, options = {}) => {
    return addToast({ type: 'error', message, ...options });
  };

  const showUndo = (message, onUndo, options = {}) => {
    return addToast({
      type: 'undo',
      message,
      onUndo,
      duration: 8000, // Longer duration for undo
      ...options
    });
  };

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showUndo }}>
      {children}

      {/* Toast Container */}
      <div className="fixed top-4 right-4 z-50 space-y-2">
        {toasts.map(toast => (
          <Toast key={toast.id} toast={toast} onClose={() => removeToast(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
};

const Toast = ({ toast, onClose }) => {
  const { type, message, onUndo } = toast;

  const getToastStyles = () => {
    switch (type) {
      case 'success':
        return 'bg-green-100 border-green-500 text-green-800';
      case 'error':
        return 'bg-red-100 border-red-500 text-red-800';
      case 'undo':
        return 'bg-blue-100 border-blue-500 text-blue-800';
      default:
        return 'bg-gray-100 border-gray-500 text-gray-800';
    }
  };

  const getIcon = () => {
    switch (type) {
      case 'success':
        return <CheckIcon className="h-5 w-5 text-green-600" />;
      case 'error':
        return <XMarkIcon className="h-5 w-5 text-red-600" />;
      case 'undo':
        return <ArrowUturnLeftIcon className="h-5 w-5 text-blue-600" />;
      default:
        return null;
    }
  };

  return (
    <div className={`flex items-center p-4 border-l-4 rounded-lg shadow-lg max-w-md min-w-80 ${getToastStyles()}`}>
      <div className="flex items-center space-x-3 flex-1">
        {getIcon()}
        <span className="text-sm font-medium">{message}</span>
      </div>

      <div className="flex items-center space-x-2 ml-3">
        {type === 'undo' && onUndo && (
          <button
            onClick={() => {
              onUndo();
              onClose();
            }}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
          >
            Undo
          </button>
        )}
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-black hover:bg-opacity-10 transition-colors"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}; 