import React from "react";
import ReactDOM from "react-dom/client";
import {App} from "./app";
import "./styles/index.css";
import "./styles/index.less";

ReactDOM.createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
        <App />
    </React.StrictMode>
);
