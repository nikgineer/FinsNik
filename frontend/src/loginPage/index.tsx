import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import config from "../config";
import type { FormEvent } from "react";
import { motion } from "framer-motion";
import AuthLayout from "../auth/AuthLayout";

export default function LoginPage() {
  const navigate = useNavigate();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const handleLogin = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${config.backendUrl}/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Login failed");
      }

      const data: { token?: string } = await response.json();

      if (data.token) {
        localStorage.setItem("token", data.token);
        setTimeout(() => navigate("/main"), 300);
      } else {
        throw new Error("No token received!");
      }
    } catch (err) {
      // 👇 Safely access message from unknown error
      const message =
        err instanceof Error ? err.message : "Unknown login error";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -28 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="w-full transform-gpu transition-transform duration-300"
      >
        <div className="glass-panel w-full text-dark-text rounded-3xl p-8 sm:p-10 space-y-6 transition-colors duration-300 shadow-xl">
          <h2 className="text-2xl font-bold text-center text-light-accent dark:text-dark-accent">
            Welcome Back
          </h2>

          {error && (
            <div className="text-red-500 text-sm text-center">{error}</div>
          )}

          <form className="space-y-4" onSubmit={handleLogin} autoComplete="on">
            <input
              type="email"
              name="email"
              autoComplete="username"
              placeholder="Email ID"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="glass-input"
              required
            />

            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                name="password"
                autoComplete="current-password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="glass-input pr-12"
                required
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-3 flex items-center text-sm text-light-text dark:text-dark-text/80"
                tabIndex={-1}
              >
                {showPassword ? "🫣" : "😬"}
              </button>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="glass-button w-full py-3"
            >
              {loading ? "Login" : "Login"}
            </button>
          </form>

          <div className="flex justify-between text-sm text-light-accent dark:text-dark-accent">
            <Link to="/forgot-password" className="hover:underline">
              Forgot Password?
            </Link>
            <Link to="/signup" className="hover:underline">
              Sign Up
            </Link>
          </div>
        </div>
      </motion.div>
    </AuthLayout>
  );
}
