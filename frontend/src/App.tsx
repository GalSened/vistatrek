/**
 * VistaTrek Main App Component
 * Routes: Home -> Planner -> Pilot
 * Per PRD: SPA (NOT PWA) with localStorage persistence
 */

import { Routes, Route } from 'react-router-dom';
import { UserProvider } from './context/UserContext';
import { TripProvider } from './context/TripContext';
import { ConversationProvider } from './context/ConversationContext';
import Home from './pages/Home';
import Planner from './pages/Planner';
import Pilot from './pages/Pilot';
import ChatPlanner from './pages/ChatPlanner';
import Settings from './pages/Settings';
import TripReport from './pages/TripReport';
import NotFound from './pages/NotFound';
import { ChatOverlay } from './components/chat';

export default function App() {
  return (
    <UserProvider>
      <TripProvider>
        <div className="app">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route
              path="/plan"
              element={
                <ConversationProvider>
                  <ChatPlanner />
                </ConversationProvider>
              }
            />
            <Route path="/planner" element={<Planner />} />
            <Route path="/planner/:tripId" element={<Planner />} />
            <Route path="/pilot" element={<Pilot />} />
            <Route path="/pilot/:tripId" element={<Pilot />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/report/:tripId" element={<TripReport />} />
            <Route path="*" element={<NotFound />} />
          </Routes>
          <ChatOverlay />
        </div>
      </TripProvider>
    </UserProvider>
  );
}
