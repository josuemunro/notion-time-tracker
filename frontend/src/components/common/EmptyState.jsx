import React from 'react';
import { InboxIcon } from '@heroicons/react/24/outline';

// Single shared empty-state treatment: centered, muted, optional icon + hint.
function EmptyState({ icon: Icon = InboxIcon, title, hint, className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center text-center py-12 px-6 ${className}`}>
      <Icon className="h-10 w-10 text-gray-300 mb-3" aria-hidden="true" />
      <p className="text-sm font-medium text-gray-600">{title}</p>
      {hint && <p className="text-sm text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

export default EmptyState;
