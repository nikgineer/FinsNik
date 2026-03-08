import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import config from "../config"; // should export backendUrl as a string
import type { FormEvent } from "react";
import AuthLayout from "../auth/AuthLayout";

export default function SignupPage() {
  const navigate = useNavigate();

  const [fullname, setFullName] = useState<string>("");
  const [email, setEmail] = useState<string>("");
  const [password, setPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [securityword, setSecurityWord] = useState<string>("");

  const [showSecretWord, setShowSecretWord] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [passwordMatchError, setPasswordMatchError] = useState<string>("");

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (confirmPassword && password !== confirmPassword) {
      setPasswordMatchError("Passwords do not match.");
    } else {
      setPasswordMatchError("");
    }
  }, [password, confirmPassword]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!passwordRegex.test(password)) {
      setError(
        "Password must include uppercase, lowercase, number, special character and be at least 8 characters.",
      );
      return;
    }

    if (!securityword.trim()) {
      setError("Please enter your recovery word.");
      return;
    }

    try {
      const response = await fetch(`${config.backendUrl}/sign-up`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fullname, email, password, securityword }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Signup failed");
      }

      const data = await response.json();
      console.log("Signup success:", data);
      setSuccess("Signup successful! Redirecting to login...");
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    }
  };

  return (
    <AuthLayout>
      <motion.div
        initial={{ opacity: 0, y: 42 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -24 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="glass-panel w-full rounded-3xl px-4 py-3 text-center text-sm shadow-md"
      >
        <p>
          <strong>Note:</strong> The word you never forget will be used for
          password recovery only.
        </p>
      </motion.div>

      <motion.form
        onSubmit={handleSubmit}
        autoComplete="on"
        initial={{ opacity: 0, y: 52 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -20 }}
        transition={{ duration: 0.5, ease: [0.4, 0, 0.2, 1] }}
        className="glass-panel w-full text-dark-text rounded-3xl p-8 sm:p-10 space-y-4 transition-colors duration-300 shadow-xl"
      >
        <h2 className="text-2xl font-bold text-center text-light-accent dark:text-dark-accent">
          Create Your Account
        </h2>

        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && (
          <div className="text-green-600 bg-green-100 border border-green-300 px-4 py-2 rounded-md text-sm">
            {success}
          </div>
        )}

        <input
          type="text"
          name="fullname"
          placeholder="Full Name"
          value={fullname}
          onChange={(e) => setFullName(e.target.value)}
          className="glass-input"
          required
        />

        <input
          type="email"
          name="email"
          autoComplete="username"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="glass-input"
          required
        />

        <input
          type="password"
          name="password"
          autoComplete="new-password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="glass-input"
          required
        />

        <input
          type="password"
          name="confirmPassword"
          autoComplete="new-password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="glass-input"
          required
        />

        {passwordMatchError && (
          <p className="text-red-500 text-sm mt-1">{passwordMatchError}</p>
        )}

        <div className="relative">
          <input
            type={showSecretWord ? "text" : "password"}
            name="securityword"
            placeholder="Word you never forget"
            value={securityword}
            onChange={(e) => setSecurityWord(e.target.value)}
            className="glass-input pr-12"
            required
          />
          <button
            type="button"
            onClick={() => setShowSecretWord(!showSecretWord)}
            className="absolute inset-y-0 right-3 flex items-center text-sm text-light-text dark:text-dark-text/80"
            tabIndex={-1}
          >
            {showSecretWord ? "🫣" : "😬"}
          </button>
        </div>

        <button type="submit" className="glass-button w-full py-3">
          Sign Up
        </button>

        <div className="text-center text-sm mt-2">
          Already have an account?{" "}
          <Link
            to="/"
            className="text-light-accent dark:text-dark-accent hover:underline"
          >
            Login
          </Link>
        </div>
      </motion.form>
    </AuthLayout>
  );
}
