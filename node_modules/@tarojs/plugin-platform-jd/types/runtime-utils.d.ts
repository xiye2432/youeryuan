declare function initNativeApi(taro: any): void;
declare const components: {
    Swiper: {
        "easing-function": string;
    };
    Canvas: {
        type: string;
    };
    Button: {
        bindGetPhoneNumber: string;
    };
    Map: {
        bindRegionChange: string;
    };
    WebView: {
        height: string;
    };
    Input: {
        "adjust-position": string;
    };
    Textarea: {
        "show-confirm-bar": string;
        "adjust-position": string;
        "disable-default-padding": string;
    };
    RootPortal: {
        enable: string;
    };
    Editor: {
        "read-only": string;
        placeholder: string;
        "show-img-size": string;
        "show-img-toolbar": string;
        "show-img-resize": string;
        focus: string;
        bindReady: string;
        bindFocus: string;
        bindBlur: string;
        bindInput: string;
        bindStatusChange: string;
        name: string;
    };
    PageContainer: {
        show: string;
        duration: string;
        "z-index": string;
        overlay: string;
        position: string;
        round: string;
        "close-on-slide-down": string;
        "overlay-style": string;
        "custom-style": string;
        bindBeforeEnter: string;
        bindEnter: string;
        bindAfterEnter: string;
        bindBeforeLeave: string;
        bindLeave: string;
        bindAfterLeave: string;
        bindClickOverlay: string;
    };
};
declare const hostConfig: {
    initNativeApi: typeof initNativeApi;
};
export { initNativeApi, components, hostConfig };
