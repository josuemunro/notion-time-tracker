import React, { useState } from 'react';

const ProjectIcon = ({
  iconType,
  iconValue,
  projectName,
  projectColor,
  className = "w-6 h-6",
  fallbackClass = "bg-gray-500"
}) => {
  const [imageError, setImageError] = useState(false);
  if (iconType === 'emoji' && iconValue) {
    return (
      <span
        className={`${className} flex items-center justify-center text-center leading-none`}
        style={{ fontSize: className.includes('w-6') ? '1.25rem' : '1.5rem' }}
        title={projectName}
      >
        {iconValue}
      </span>
    );
  }

  if ((iconType === 'external' || iconType === 'file') && iconValue && !imageError) {
    return (
      <img
        src={iconValue}
        alt={`${projectName} icon`}
        className={`${className} object-cover rounded`}
        onError={() => {
          console.log(`🔗 Icon failed to load for ${projectName}, falling back to letter icon`);
          setImageError(true);
        }}
      />
    );
  }

  // Fallback: Show first letter of project name in a colored circle
  const firstLetter = projectName ? projectName.charAt(0).toUpperCase() : 'P';

  // Use project color if available, otherwise use hash-based color
  let backgroundStyle = {};
  let textColorClass = 'text-white';

  if (projectColor) {
    backgroundStyle = { backgroundColor: projectColor };
    // Calculate optimal text color for contrast
    textColorClass = getOptimalTextColor(projectColor);
  } else {
    const colors = [
      'bg-blue-500', 'bg-green-500', 'bg-purple-500', 'bg-pink-500',
      'bg-yellow-500', 'bg-indigo-500', 'bg-red-500', 'bg-teal-500'
    ];

    // Simple hash function to get consistent color for project name
    const hash = projectName ? projectName.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0) : 0;

    const colorClass = colors[Math.abs(hash) % colors.length];

    return (
      <div
        className={`${className} ${colorClass} flex items-center justify-center rounded-full text-white font-medium text-sm`}
        title={projectName}
      >
        {firstLetter}
      </div>
    );
  }

  return (
    <div
      className={`${className} flex items-center justify-center rounded-full ${textColorClass} font-medium text-sm`}
      style={backgroundStyle}
      title={projectName}
    >
      {firstLetter}
    </div>
  );
};

// Helper function to calculate optimal text color for contrast
function getOptimalTextColor(backgroundColor) {
  // Remove # if present
  const color = backgroundColor.replace('#', '');

  // Convert to RGB
  const r = parseInt(color.substr(0, 2), 16);
  const g = parseInt(color.substr(2, 2), 16);
  const b = parseInt(color.substr(4, 2), 16);

  // Calculate luminance using relative luminance formula
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;

  // Return black for light backgrounds, white for dark backgrounds
  return luminance > 0.5 ? 'text-black' : 'text-white';
};

export default ProjectIcon; 