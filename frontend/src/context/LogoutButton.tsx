import React from "react";

interface LogoutButtonProps {
  handleLogout: () => void;
}

const LogoutButton: React.FC<LogoutButtonProps> = ({ handleLogout }) => {
  return (
    <button
      type="button"
      onClick={handleLogout}
      className="group flex items-center gap-2 h-10 rounded-full 
        border border-white/20 
        bg-white/10 
        px-4 text-sm font-semibold 
        text-white shadow-lg 
        backdrop-blur-md 
        transition-transform duration-200 ease-out 
        hover:scale-[1.02] hover:bg-white/20 
        focus:outline-none focus:ring-2 focus:ring-white/30 focus:ring-offset-2 focus:ring-offset-transparent 
        dark:border-white/10 dark:bg-white/5 dark:text-slate-100"
      aria-label="Logout"
      title="Logout"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        className="h-5 w-5"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.8}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M17 16l4-4m0 0l-4-4m4 4H9m4 4v1.2a2 2 0 01-2 2H7a2 2 0 01-2-2V6.8a2 2 0 012-2h4a2 2 0 012 2V8"
        />
      </svg>
      <span className="hidden sm:inline">Logout</span>
    </button>
  );
};

export default LogoutButton;
