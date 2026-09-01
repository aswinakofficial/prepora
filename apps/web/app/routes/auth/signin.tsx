import { createFileRoute } from "@tanstack/react-router";
import { authClient } from "../../../lib/auth-client";

export const Route = createFileRoute("/auth/signin")({
  component: SignInPage,
});

function SignInPage() {
  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
    });
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

        <div className="space-y-4 pt-4">
          <button
            className="w-full font-mono uppercase tracking-widest text-[10px] h-12 bg-transparent text-white hover:bg-white hover:text-black border-[0.5px] border-white/20 transition-all rounded-none"
            onClick={handleGoogleSignIn}
          >
            Authenticate via Google
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
