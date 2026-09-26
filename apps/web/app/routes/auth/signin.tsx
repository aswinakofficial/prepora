import { createFileRoute } from "@tanstack/react-router";
import type React from "react";
import { useState } from "react";
import { authClient } from "../../../lib/auth-client";

export const Route = createFileRoute("/auth/signin")({
  component: SignInPage,
});

function SignInPage() {
  const { data: session } = authClient.useSession();
  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (session) {
    console.log("✅ SUCCESSFUL LOGIN DETECTED. Session data:", session);
  }

  // Local development only: email/password accounts (the seeded local admin, or throwaway test
  // users). The server enables this only in development/test (packages/auth's
  // isEmailPasswordEnabled), and import.meta.env.DEV keeps the form out of production builds.
  const [devEmail, setDevEmail] = useState("");
  const [devPassword, setDevPassword] = useState("");
  const [devMode, setDevMode] = useState<"signin" | "signup">("signin");
  const handleDevSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsLoading(true);
    setErrorMsg(null);
    const result =
      devMode === "signin"
        ? await authClient.signIn.email({
            email: devEmail,
            password: devPassword,
            callbackURL: "/",
          })
        : await authClient.signUp.email({
            email: devEmail,
            password: devPassword,
            name: devEmail.split("@")[0] || "Local user",
            callbackURL: "/",
          });
    if (result.error) {
      setErrorMsg(result.error.message || "Sign-in failed.");
      setIsLoading(false);
      return;
    }
    window.location.href = "/";
  };

  const handleGoogleSignIn = async () => {
    setIsLoading(true);
    setErrorMsg(null);
    try {
      const callbackURL = typeof window !== "undefined" ? `${window.location.origin}/` : "/";
      console.log("🔍 [CLIENT SIGNIN] Initiating Google Auth with callbackURL:", callbackURL);
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL,
      });
      console.log("🔍 [CLIENT SIGNIN RESULT]:", result);

      if (result && "error" in result && result.error) {
        console.error("❌ [CLIENT SIGNIN ERROR DETAILS]:", result.error);
        const detail = (result.error as any)?.details || (result.error as any)?.message;
        setErrorMsg(detail || "Failed to initiate Google Authentication. Please try again.");
      }
    } catch (err: any) {
      console.error("❌ [CLIENT SIGNIN EXCEPTION]:", err);
      setErrorMsg(
        err?.message ||
          "Authentication request failed. Please check server environment configuration.",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-[80vh] items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-8 border-[0.5px] border-white/10 bg-[#06080a] p-8 shadow-2xl">
        <div className="space-y-2">
          <h1 className="font-mono text-2xl tracking-tighter text-white uppercase flex items-center gap-3">
            <span className="text-white/30 text-base">»</span> Sign In
          </h1>
          <p className="font-mono text-[11px] tracking-widest text-white/40 uppercase">
            Initialize your terminal session
          </p>
        </div>

        {errorMsg && (
          <div className="p-3 border border-red-500/30 bg-red-950/30 text-red-400 font-mono text-xs leading-relaxed">
            <p className="font-bold mb-1">ERR_AUTH_FAILURE</p>
            {errorMsg}
          </div>
        )}

        <div className="space-y-4 pt-4">
          <button
            type="button"
            disabled={isLoading}
            className="w-full font-mono uppercase tracking-widest text-[10px] h-12 bg-transparent text-white hover:bg-white hover:text-black border-[0.5px] border-white/20 transition-all rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleGoogleSignIn}
          >
            {isLoading ? "Initiating Gateway..." : "Authenticate via Google"}
          </button>
        </div>

        {import.meta.env.DEV && (
          <form
            onSubmit={handleDevSubmit}
            className="space-y-3 border-t-[0.5px] border-dashed border-amber-500/30 pt-6"
          >
            <p className="font-mono text-[10px] uppercase tracking-widest text-amber-300/80">
              Local development · email sign-in
            </p>
            <p className="font-mono text-[10px] leading-relaxed text-white/40">
              The local admin is DEV_ADMIN_EMAIL / DEV_ADMIN_PASSWORD in your .env. Not available on
              the deployed site.
            </p>
            <input
              type="email"
              required
              autoComplete="username"
              placeholder="email"
              value={devEmail}
              onChange={(e) => setDevEmail(e.target.value)}
              className="w-full h-10 bg-transparent border-[0.5px] border-white/20 px-3 font-mono text-xs text-white outline-none focus:border-white/50"
            />
            <input
              type="password"
              required
              minLength={8}
              autoComplete={devMode === "signin" ? "current-password" : "new-password"}
              placeholder="password"
              value={devPassword}
              onChange={(e) => setDevPassword(e.target.value)}
              className="w-full h-10 bg-transparent border-[0.5px] border-white/20 px-3 font-mono text-xs text-white outline-none focus:border-white/50"
            />
            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 font-mono uppercase tracking-widest text-[10px] border-[0.5px] border-amber-500/40 text-amber-200 hover:bg-amber-500/10 disabled:opacity-50"
            >
              {devMode === "signin" ? "Sign in" : "Create local account"}
            </button>
            <button
              type="button"
              onClick={() => setDevMode(devMode === "signin" ? "signup" : "signin")}
              className="w-full font-mono text-[10px] uppercase tracking-widest text-white/40 hover:text-white"
            >
              {devMode === "signin" ? "Need a test user? Create one" : "Have an account? Sign in"}
            </button>
          </form>
        )}

        <div className="pt-6 mt-6 border-t-[0.5px] border-white/5">
          <p className="font-mono text-[9px] text-white/20 uppercase tracking-widest text-center">
            System Secured • Better Auth Protocol
          </p>
        </div>
      </div>
    </div>
  );
}
