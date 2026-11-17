import React from "react";
import {createBrowserRouter, Navigate} from "react-router";
import {AdminShell} from "@/components/AdminShell";
import {RequireAuth} from "@/components/RequireAuth";
import {Login} from "@/pages/Login";

// Pages are code-split so the entry chunk stays small; Login and the shell stay eager for first paint.
export const routes = [
    {path: "/login", element: <Login />},
    {
        element: <RequireAuth />,
        children: [
            {
                element: <AdminShell />,
                children: [
                    {path: "/", element: <Navigate to="/reports" replace />},
                    {path: "/reports", lazy: () => import("@/pages/Reports").then(m => ({Component: m.Reports}))},
                    {
                        path: "/reports/:id",
                        lazy: () => import("@/pages/ReportDetail").then(m => ({Component: m.ReportDetail})),
                    },
                    {path: "/users/:id", lazy: () => import("@/pages/User").then(m => ({Component: m.User}))},
                    {path: "/health", lazy: () => import("@/pages/Health").then(m => ({Component: m.Health}))},
                    {path: "*", lazy: () => import("@/pages/NotFound").then(m => ({Component: m.NotFound}))},
                ],
            },
        ],
    },
];

export const router = createBrowserRouter(routes);
