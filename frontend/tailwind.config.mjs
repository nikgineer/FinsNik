// tailwind.config.js
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        "light-bg": "#e0f7fa",
        "light-text": "#004d40",
        "light-accent": "#00bcd4",
        "dark-bg": "#000000",
        "dark-text": "#ffffff",
        "dark-accent": "#3399ff",
      },
    },
  },
  plugins: [],
};
