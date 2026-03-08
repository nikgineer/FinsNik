import React from "react";

const Loader: React.FC = () => {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-40 flex items-center justify-center z-50">
      <div className="flex flex-col items-center">
        <div className="animate-spin rounded-full h-16 w-16 border-t-4 border-b-4 border-cyan-400"></div>
        <span className="mt-4 text-white text-sm">Loading portfolio...</span>
      </div>
    </div>
  );
};

export default Loader;
