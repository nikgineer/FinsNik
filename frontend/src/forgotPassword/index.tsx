import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion"; // optional
import config from "../config"; // make sure this exports `backendUrl` as a string
import type { FormEvent } from "react";
import AuthLayout from "../auth/AuthLayout";

export default function ForgotPasswordPage() {
  const navigate = useNavigate();

  const [email, setEmail] = useState<string>("");
  const [securityword, setSecurityWord] = useState<string>("");
  const [newPassword, setNewPassword] = useState<string>("");
  const [confirmPassword, setConfirmPassword] = useState<string>("");
  const [passwordMatchError, setPasswordMatchError] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [showSecretWord, setShowSecretWord] = useState<boolean>(false);

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  useEffect(() => {
    if (confirmPassword && newPassword !== confirmPassword) {
      setPasswordMatchError("Passwords do not match.");
    } else {
      setPasswordMatchError("");
    }
  }, [newPassword, confirmPassword]);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError("");
    setSuccess("");

    if (!email.trim() || !securityword.trim()) {
      setError("Email and security word are required.");
      return;
    }

    if (!passwordRegex.test(newPassword)) {
      setError(
        "Password must be at least 8 characters and include uppercase, lowercase, number, and special character.",
      );
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      const response = await fetch(`${config.backendUrl}/forgot-password`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, securityword, password: newPassword }),
      });

      if (!response.ok) {
        const errData = await response.json();
        throw new Error(errData.message || "Password reset failed");
      }

      const data = await response.json();
      console.log("Reset success:", data);
      setSuccess("Password Reset Successful! Redirecting to login...");
      setTimeout(() => navigate("/"), 2000);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Something went wrong.";
      setError(message);
    }
  };

  return (
    <AuthLayout>
      <motion.form
        onSubmit={handleSubmit}
        autoComplete="on"
        initial={{ opacity: 0, y: 48 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -28 }}
        transition={{ duration: 0.45, ease: [0.4, 0, 0.2, 1] }}
        className="glass-panel w-full text-dark-text rounded-3xl p-8 sm:p-10 space-y-4 transition-colors duration-300 shadow-xl"
      >
        <h2 className="text-2xl font-bold text-center text-light-accent dark:text-dark-accent">
          Reset Password
        </h2>

        <p className="text-sm text-center mb-2">
          Enter your registered email and your secret word. Then set a new
          password.
        </p>

        {error && <div className="text-red-500 text-sm">{error}</div>}
        {success && (
          <div className="text-green-600 bg-green-100 border border-green-300 px-4 py-2 rounded-md mb-4 text-sm">
            {success}
          </div>
        )}

        <input
          type="email"
          placeholder="Registered Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="glass-input"
          required
        />

        <input
          type="password"
          placeholder="New Password"
          value={newPassword}
          onChange={(e) => setNewPassword(e.target.value)}
          className="glass-input"
          required
        />

        <input
          type="password"
          placeholder="Confirm New Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          className="glass-input"
          required
        />

        <div className="relative">
          <input
            type={showSecretWord ? "text" : "password"}
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

        {passwordMatchError && (
          <p className="text-red-500 text-sm mt-1">{passwordMatchError}</p>
        )}

        <button type="submit" className="glass-button w-full py-3">
          Reset Password
        </button>

        <div className="text-center text-sm mt-2">
          Back to{" "}
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
