import React from "react";
import {createBrowserRouter, Navigate} from "react-router";
import {AdminShell} from "@/components/AdminShell";
import {RequireAuth} from "@/components/RequireAuth";
import {Health} from "@/pages/Health";
import {Login} from "@/pages/Login";
import {NotFound} from "@/pages/NotFound";
import {ReportDetail} from "@/pages/ReportDetail";
import {Reports} from "@/pages/Reports";
import {User} from "@/pages/User";

export const routes = [
    {path: "/login", element: <Login />},
    {
        element: <RequireAuth />,
        children: [
            {
                element: <AdminShell />,
                children: [
                    {path: "/", element: <Navigate to="/reports" replace />},
                    {path: "/reports", element: <Reports />},
                    {path: "/reports/:id", element: <ReportDetail />},
                    {path: "/users/:id", element: <User />},
                    {path: "/health", element: <Health />},
                    {path: "*", element: <NotFound />},
                ],
            },
        ],
    },
];

export const router = createBrowserRouter(routes);
