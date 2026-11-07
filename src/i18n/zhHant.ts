export const zhHant = {
    app: {
        name: "Kaului 後台系統",
    },
    login: {
        title: "管理員登入",
        tokenLabel: "管理員令牌",
        tokenPlaceholder: "貼上或輸入管理員令牌",
        toggleVisibility: "切換令牌可見性",
        submit: "登入系統",
        submitting: "驗證權限中...",
        cooldownButton: "請等待 {seconds} 秒後重試",
        expired: "登入已失效,請重新登入",
        errorNotEnabled: "後台未啟用",
        errorInvalidToken: "令牌不正確",
        errorRateLimited: "嘗試次數過多,請 {seconds} 秒後再試",
        errorNetwork: "連唔到 server",
        errorServer: "伺服器錯誤，請稍後再試",
        requestId: "Request ID:{id}",
        lockWarning: "同一 IP 每分鐘失敗 10 次會被鎖",
    },
    shell: {
        navReports: "舉報",
        navHealth: "系統健康",
        userLookupPlaceholder: "輸入使用者編號查詢",
        userLookupLabel: "使用者編號查詢",
        userLookupSubmit: "查詢",
        userLookupHint: "P5 啟用",
        logout: "登出",
    },
    pages: {
        reports: "舉報隊列(P2)",
        reportDetail: "舉報詳情(P3)",
        user: "用戶(P5)",
        health: "系統健康(P6)",
    },
    notFound: {
        title: "找不到這個頁面",
        back: "返回舉報隊列",
    },
} as const;

export type ZhHant = typeof zhHant;
