import { BrowserRouter, Route, Routes } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { MeetingPage } from "./pages/MeetingPage";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/m/:meetingId" element={<MeetingPage />} />
      </Routes>
    </BrowserRouter>
  );
}
