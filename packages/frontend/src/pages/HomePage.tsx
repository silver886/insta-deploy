import { Container } from "lucide-react";
import { RepoInput } from "../components/RepoInput";
import { DeploymentList } from "../components/DeploymentList";

export function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center px-4 pt-24 pb-12">
      <div className="flex flex-col items-center gap-8 max-w-2xl w-full">
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex items-center gap-3 mb-2">
            <Container className="w-10 h-10 text-blue-400" />
            <h1 className="text-5xl font-bold text-white tracking-tight">
              InstaDeploy
            </h1>
          </div>
          <p className="text-lg text-slate-400">
            Paste a repo URL. Get a running container.
          </p>
        </div>
        <RepoInput />
        <div className="flex items-center gap-6 text-sm text-slate-600">
          <span>Auto-detected Dockerfiles</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Live build logs</span>
          <span className="w-1 h-1 rounded-full bg-slate-700" />
          <span>Web terminal</span>
        </div>
        <DeploymentList />
      </div>
    </div>
  );
}
