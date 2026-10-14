import { Routes, Route, Outlet } from "react-router-dom";
import Navigation from "./components/Navigation";
import Homepage from "./pages/Homepage";
import FAQ from "./pages/FAQ";
import Plans from "./pages/Plans";
import Contact from "./pages/Contact";
import Login from "./pages/Login";

// Shared layout: the nav bar is rendered once and every page appears below it.
function Layout() {
  return (
    <>
      <Navigation />
      <Outlet />
    </>
  );
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route path="/" element={<Homepage />} />
        <Route path="/faq" element={<FAQ />} />
        <Route path="/plans" element={<Plans />} />
        <Route path="/contact" element={<Contact />} />
        <Route path="/login" element={<Login />} />
      </Route>
    </Routes>
  );
}
