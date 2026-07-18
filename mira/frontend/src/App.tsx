import { lazy, Suspense } from "react";
import { Navigate, Route, Routes } from "react-router-dom";
import { useStore } from "./state/store";
import { Skeleton } from "./components/ui";
import Login from "./pages/Login";
import UdyamiLayout from "./pages/udyami/UdyamiLayout";
import AdhikariLayout from "./pages/adhikari/AdhikariLayout";

const UHome = lazy(() => import("./pages/udyami/Home"));
const UAdd = lazy(() => import("./pages/udyami/AddEntry"));
const UForecast = lazy(() => import("./pages/udyami/Forecast"));
const UAlerts = lazy(() => import("./pages/udyami/Alerts"));
const ULoan = lazy(() => import("./pages/udyami/Loan"));
const UMessages = lazy(() => import("./pages/udyami/Messages"));

const AOverview = lazy(() => import("./pages/adhikari/Overview"));
const AList = lazy(() => import("./pages/adhikari/EnterpriseList"));
const A360 = lazy(() => import("./pages/adhikari/Enterprise360"));
const ARisk = lazy(() => import("./pages/adhikari/RiskPanel"));
const AInbox = lazy(() => import("./pages/adhikari/Inbox"));
const AWhatIf = lazy(() => import("./pages/adhikari/WhatIf"));

function Fallback() {
  return (
    <div className="p-4 space-y-3 max-w-3xl mx-auto">
      <Skeleton className="h-40" />
      <Skeleton className="h-24" />
      <Skeleton className="h-24" />
    </div>
  );
}

function Guard({ role, children }: { role: "officer" | "enterprise"; children: React.ReactNode }) {
  const { token, role: myRole } = useStore();
  if (!token) return <Navigate to="/login" replace />;
  if (myRole !== role) return <Navigate to={myRole === "officer" ? "/a" : "/u"} replace />;
  return <>{children}</>;
}

export default function App() {
  const { token, role } = useStore();
  return (
    <Suspense fallback={<Fallback />}>
      <Routes>
        <Route path="/login" element={
          token ? <Navigate to={role === "officer" ? "/a" : "/u"} replace /> : <Login />
        } />
        <Route path="/u" element={<Guard role="enterprise"><UdyamiLayout /></Guard>}>
          <Route index element={<UHome />} />
          <Route path="add" element={<UAdd />} />
          <Route path="forecast" element={<UForecast />} />
          <Route path="alerts" element={<UAlerts />} />
          <Route path="messages" element={<UMessages />} />
          <Route path="loan" element={<ULoan />} />
        </Route>
        <Route path="/a" element={<Guard role="officer"><AdhikariLayout /></Guard>}>
          <Route index element={<AOverview />} />
          <Route path="enterprises" element={<AList />} />
          <Route path="enterprises/:id" element={<A360 />} />
          <Route path="risk" element={<ARisk />} />
          <Route path="inbox" element={<AInbox />} />
          <Route path="whatif" element={<AWhatIf />} />
        </Route>
        <Route path="*" element={<Navigate to={token ? (role === "officer" ? "/a" : "/u") : "/login"} replace />} />
      </Routes>
    </Suspense>
  );
}
