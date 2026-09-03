import { useState } from "react";
import { createFileRoute } from "@tanstack/react-router";
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

        // Query server health to check environment audit status
        try {
          const healthRes = await fetch("/api/auth/health");
          const healthData = await healthRes.json();
          console.error("🔍 [SERVER AUTH HEALTH AUDIT]:", healthData);
          if (healthData?.envAudit) {
            const missing: string[] = [];
            if (!healthData.envAudit.hasClientId) missing.push("GOOGLE_CLIENT_ID");
            if (!healthData.envAudit.hasClientSecret) missing.push("GOOGLE_CLIENT_SECRET");
            if (!healthData.envAudit.hasAuthSecret) missing.push("BETTER_AUTH_SECRET");
            if (!healthData.envAudit.hasDbUrl) missing.push("DATABASE_URL");

            if (missing.length > 0) {
              setErrorMsg(`Missing Cloudflare Secret(s): ${missing.join(", ")}. Please configure them in Cloudflare Dashboard.`);
              return;
            }
          }
        } catch (hErr) {
          console.error("Failed to query auth health:", hErr);
        }

        setErrorMsg(detail || "Failed to initiate Google Authentication. Check server environment.");
      }

    } catch (err: any) {
      console.error("❌ [CLIENT SIGNIN EXCEPTION]:", err);
      setErrorMsg(
        err?.message || "Authentication request failed. Please check server environment configuration."
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
            disabled={isLoading}
            className="w-full font-mono uppercase tracking-widest text-[10px] h-12 bg-transparent text-white hover:bg-white hover:text-black border-[0.5px] border-white/20 transition-all rounded-none disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleGoogleSignIn}
          >
            {isLoading ? "Initiating Gateway..." : "Authenticate via Google"}
          </button>
        </div>

        <div className="pt-6 mt-6 border-t-[0.5px] border-white/5">
          <p className="font-mono text-[9px] text-white/20 uppercase tracking-widest text-center">
            System Secured • Better Auth Protocol
          </p>
        </div>
      </div>
    </div>
  );
}

