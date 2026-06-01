import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

document.body.classList.add("dark");

createRoot(document.getElementById("root")!).render(<App />);
