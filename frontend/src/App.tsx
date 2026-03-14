import { Routes, Route, Navigate } from "react-router-dom";
import Landing from "./pages/Landing";
import Dashboard from "./pages/Dashboard";
import Upload from "./pages/Upload";
import JobStatus from "./pages/JobStatus";
import SkillReview from "./pages/SkillReview";
import SkillPublish from "./pages/SkillPublish";
import Marketplace from "./pages/Marketplace";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="/upload" element={<Upload />} />
      <Route path="/jobs/:id" element={<JobStatus />} />
      <Route path="/skills/:id/review" element={<SkillReview />} />
      <Route path="/skills/:id/publish" element={<SkillPublish />} />
      <Route path="/marketplace" element={<Marketplace />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
