import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Rocket, Loader2 } from "lucide-react";
import { createDeployment } from "../lib/api";
import { saveSession } from "../lib/sessions";

export function RepoInput() {
  const [repoUrl, setRepoUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const navigate = useNavigate();

  function validate(url: string): boolean {
    if (!url.trim()) {
      setError("Please enter a repository URL.");
      return false;
    }
    if (!url.startsWith("https://")) {
      setError("URL must start with https://");
      return false;
    }
    setError(null);
    return true;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate(repoUrl)) return;

    setIsLoading(true);
    setError(null);

    try {
      const result = await createDeployment(repoUrl.trim());
      saveSession(result.id, result.sessionToken);
      navigate(`/deployments/${result.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create deployment.");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="w-full max-w-2xl mx-auto">
      <div className="flex flex-col gap-4">
        <div className="flex gap-3">
          <input
            type="text"
            value={repoUrl}
            onChange={(e) => {
              setRepoUrl(e.target.value);
              if (error) setError(null);
            }}
            placeholder="https://github.com/user/repo"
            disabled={isLoading}
            className="flex-1 px-5 py-4 bg-[#1e293b] border border-slate-600 rounded-xl text-lg text-slate-100 placeholder-slate-500 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-all disabled:opacity-50"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="px-6 py-4 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-xl flex items-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              <Rocket className="w-5 h-5" />
            )}
            Deploy
          </button>
        </div>
        {error && (
          <p className="text-red-400 text-sm px-1">{error}</p>
        )}
      </div>
    </form>
  );
}
