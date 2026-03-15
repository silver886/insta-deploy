import { Routes, Route } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { DeploymentPage } from "./pages/DeploymentPage";

export function App() {
  return (
    <div className="min-h-screen bg-[#0f172a]">
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/deployments/:id" element={<DeploymentPage />} />
      </Routes>
    </div>
  );
}
