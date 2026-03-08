import "./App.css";
import {
  BrowserRouter,
  Routes,
  Route,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { useEffect } from "react";
import LoginPage from "./loginPage";
import ForgotPasswordPage from "./forgotPassword";
import { AnimatePresence } from "framer-motion";
import SignupPage from "./signUp";
import PrivateRoute from "./mainPage/PrivateRoute";
import MainPage from "./mainPage";
import PortfolioDetailPage from "./mainPage/CashPortfolioDetailsPage/PortfolioDetailPage";
import PlotsPage from "./PlotsPage";
import AllTransactions from "./transactions";
import InvestPortfolioDetailPage from "./mainPage/investPortfolioDetailsPage";
import useAutoLogout from "./mainPage/useAutoLogout";
import InvestmentDetailsPage from "./mainPage/investPortfolioDetailsPage/InvestmentDetailsPage";
import InvestmentChart from "./PlotsPage/InvestmentChart";

const ACCENT_PALETTES: Array<{ id: string; values: Record<string, string> }> = [
  {
    id: "midnight",
    values: {
      "--glass-highlight": "hsla(218, 86%, 62%, 0.58)",
      "--glass-button-bg": "hsla(224, 89%, 28%, 0.9)",
      "--glass-button-strong": "hsla(224, 92%, 34%, 0.98)",
      "--glass-button-gloss": "hsla(218, 98%, 70%, 0.7)",
      "--glass-outline": "hsla(220, 88%, 62%, 0.78)",
      "--accent-on-primary": "hsla(220, 100%, 95%, 0.94)",
    },
  },
  {
    id: "crimson",
    values: {
      "--glass-highlight": "hsla(352, 88%, 64%, 0.6)",
      "--glass-button-bg": "hsla(350, 82%, 30%, 0.92)",
      "--glass-button-strong": "hsla(350, 86%, 36%, 0.98)",
      "--glass-button-gloss": "hsla(352, 95%, 72%, 0.7)",
      "--glass-outline": "hsla(350, 88%, 62%, 0.78)",
      "--accent-on-primary": "hsla(350, 100%, 96%, 0.94)",
    },
  },
  {
    id: "malachite",
    values: {
      "--glass-highlight": "hsla(160, 82%, 58%, 0.58)",
      "--glass-button-bg": "hsla(160, 85%, 24%, 0.92)",
      "--glass-button-strong": "hsla(160, 90%, 30%, 0.98)",
      "--glass-button-gloss": "hsla(160, 96%, 66%, 0.7)",
      "--glass-outline": "hsla(158, 90%, 58%, 0.78)",
      "--accent-on-primary": "hsla(155, 100%, 94%, 0.94)",
    },
  },
  {
    id: "ultraviolet",
    values: {
      "--glass-highlight": "hsla(268, 90%, 68%, 0.6)",
      "--glass-button-bg": "hsla(266, 88%, 28%, 0.92)",
      "--glass-button-strong": "hsla(266, 92%, 34%, 0.98)",
      "--glass-button-gloss": "hsla(268, 96%, 74%, 0.7)",
      "--glass-outline": "hsla(268, 90%, 64%, 0.78)",
      "--accent-on-primary": "hsla(266, 100%, 95%, 0.94)",
    },
  },
  {
    id: "ember",
    values: {
      "--glass-highlight": "hsla(18, 94%, 66%, 0.58)",
      "--glass-button-bg": "hsla(16, 92%, 28%, 0.92)",
      "--glass-button-strong": "hsla(16, 96%, 34%, 0.98)",
      "--glass-button-gloss": "hsla(18, 98%, 72%, 0.7)",
      "--glass-outline": "hsla(16, 90%, 60%, 0.78)",
      "--accent-on-primary": "hsla(18, 100%, 96%, 0.94)",
    },
  },
  {
    id: "arctic",
    values: {
      "--glass-highlight": "hsla(194, 88%, 66%, 0.6)",
      "--glass-button-bg": "hsla(190, 90%, 26%, 0.92)",
      "--glass-button-strong": "hsla(190, 94%, 32%, 0.98)",
      "--glass-button-gloss": "hsla(194, 96%, 72%, 0.7)",
      "--glass-outline": "hsla(192, 90%, 62%, 0.78)",
      "--accent-on-primary": "hsla(194, 100%, 95%, 0.94)",
    },
  },
  {
    id: "obsidian",
    values: {
      "--glass-highlight": "hsla(218, 28%, 62%, 0.5)",
      "--glass-button-bg": "hsla(220, 28%, 18%, 0.94)",
      "--glass-button-strong": "hsla(220, 32%, 24%, 0.98)",
      "--glass-button-gloss": "hsla(218, 40%, 58%, 0.68)",
      "--glass-outline": "hsla(220, 28%, 58%, 0.78)",
      "--accent-on-primary": "hsla(220, 32%, 92%, 0.94)",
    },
  },
  {
    id: "celestial",
    values: {
      "--glass-highlight": "hsla(296, 88%, 70%, 0.6)",
      "--glass-button-bg": "hsla(292, 90%, 30%, 0.92)",
      "--glass-button-strong": "hsla(292, 94%, 36%, 0.98)",
      "--glass-button-gloss": "hsla(296, 96%, 76%, 0.7)",
      "--glass-outline": "hsla(294, 90%, 64%, 0.78)",
      "--accent-on-primary": "hsla(294, 100%, 95%, 0.94)",
    },
  },
  {
    id: "tide",
    values: {
      "--glass-highlight": "hsla(202, 88%, 64%, 0.6)",
      "--glass-button-bg": "hsla(198, 92%, 26%, 0.92)",
      "--glass-button-strong": "hsla(198, 96%, 32%, 0.98)",
      "--glass-button-gloss": "hsla(202, 96%, 70%, 0.7)",
      "--glass-outline": "hsla(200, 90%, 60%, 0.78)",
      "--accent-on-primary": "hsla(202, 100%, 95%, 0.94)",
    },
  },
  {
    id: "nebula",
    values: {
      "--glass-highlight": "hsla(256, 88%, 68%, 0.6)",
      "--glass-button-bg": "hsla(250, 90%, 30%, 0.92)",
      "--glass-button-strong": "hsla(250, 94%, 36%, 0.98)",
      "--glass-button-gloss": "hsla(256, 96%, 74%, 0.7)",
      "--glass-outline": "hsla(252, 88%, 64%, 0.78)",
      "--accent-on-primary": "hsla(252, 100%, 95%, 0.94)",
    },
  },
];

function AnimatedRoutes() {
  const location = useLocation();

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<LoginPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route element={<PrivateRoute />}>
          <Route path="/main" element={<MainPage />} />
          <Route path="/portfolio/:id" element={<PortfolioDetailPage />} />
          <Route path="/plots" element={<PlotsPage />} />
          <Route path="/transactions" element={<AllTransactions />} />
          <Route
            path="/investportfolio/:id"
            element={<InvestPortfolioDetailPage />}
          />
          <Route path="/investments/:id" element={<InvestmentDetailsPage />} />
          <Route path="/investments/:id/chart" element={<InvestmentChart />} />
        </Route>
      </Routes>
    </AnimatePresence>
  );
}

function AppContent() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem("token");
    navigate("/login");
  };

  useAutoLogout(handleLogout);

  return <AnimatedRoutes />;
}

function App() {
  useEffect(() => {
    const root = document.documentElement;
    if (!root.classList.contains("dark")) {
      root.classList.add("dark");
    }

    if (!root.dataset.accentSeed) {
      const palette =
        ACCENT_PALETTES[Math.floor(Math.random() * ACCENT_PALETTES.length)];
      root.dataset.accentSeed = palette.id;
      for (const [property, value] of Object.entries(palette.values)) {
        root.style.setProperty(property, value);
      }
    }

    try {
      localStorage.setItem("theme", "dark");
    } catch {
      /* ignore storage issues */
    }

    const themeColorMeta = document.querySelector<HTMLMetaElement>(
      'meta[name="theme-color"]',
    );
    themeColorMeta?.setAttribute("content", "#000000");
  }, []);

  return (
    <BrowserRouter>
      <AppContent />
    </BrowserRouter>
  );
}

export default App;
