import React from "react";
import {Toast} from "@heroui/react";
import {RouterProvider} from "react-router";
import {router} from "./router";

export const App = () => {
    return (
        <React.Fragment>
            <RouterProvider router={router} />
            {/* Outside the router so a toast survives the navigation that follows a successful action. */}
            <Toast.Provider placement="top end" maxVisibleToasts={3} />
        </React.Fragment>
    );
};
