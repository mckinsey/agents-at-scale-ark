import React from 'react';

interface StatusBadgeProps {
  ready?: boolean;
  discovering?: boolean;
}

export function StatusBadge({ ready, discovering }: StatusBadgeProps) {
  if (ready === true) {
    return (
      <div className="rounded-full bg-green-100 px-2 py-1 text-xs font-medium text-green-800">
        Ready
      </div>
    );
  } else if (discovering === true) {
    return (
      <div className="rounded-full bg-yellow-100 px-2 py-1 text-xs font-medium text-yellow-800">
        Discovering
      </div>
    );
  } else {
    return (
      <div className="rounded-full bg-red-100 px-2 py-1 text-xs font-medium text-red-800">
        Not Ready
      </div>
    );
  }
}
