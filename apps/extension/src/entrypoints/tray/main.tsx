import "../../styles/app.css";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { Tray } from "./Tray";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Tray />
  </StrictMode>,
);
