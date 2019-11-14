import {ConnectedRouter} from "connected-react-router";
import React from "react";
import ReactDOM from "react-dom";
import {Provider} from "react-redux";
import {withRouter} from "react-router";
import {call, delay} from "redux-saga/effects";
import {app} from "../app";
import {NavigationGuard} from "./NavigationGuard";
import {LoggerConfig} from "../Logger";
import {ErrorListener} from "../module";
import {errorAction} from "../reducer";
import {ErrorBoundary} from "../util/ErrorBoundary";
import {ajax} from "../util/network";
import {RuntimeException} from "../Exception";

interface BootstrapOption {
    componentType: React.ComponentType<{}>;
    errorListener: ErrorListener;
    navigationPreventionMessage?: ((isSamePage: boolean) => string) | string;
    logger?: LoggerConfig;
}

export function startApp(config: BootstrapOption): void {
    setupGlobalErrorHandler(config.errorListener);
    setupLogger(config.logger);
    renderDOM(config.componentType, config.navigationPreventionMessage || "Are you sure to leave current page?");
}

function renderDOM(EntryComponent: React.ComponentType<{}>, navigationPreventionMessage: ((isSamePage: boolean) => string) | string) {
    const rootElement: HTMLDivElement = document.createElement("div");
    rootElement.style.transition = "all 150ms ease-in 100ms";
    rootElement.style.opacity = "0";
    rootElement.style.transform = "translateY(-10px) scale(0.96)";
    rootElement.id = "framework-app-root";
    document.body.appendChild(rootElement);

    const RoutedEntryComponent = withRouter(EntryComponent as any);
    ReactDOM.render(
        <Provider store={app.store}>
            <ErrorBoundary>
                <ConnectedRouter history={app.browserHistory}>
                    <NavigationGuard message={navigationPreventionMessage} />
                    <RoutedEntryComponent />
                </ConnectedRouter>
            </ErrorBoundary>
        </Provider>,
        rootElement,
        () => {
            const rootElement = document.getElementById("framework-app-root")!;
            rootElement.style.transform = "none";
            rootElement.style.opacity = "1";
        }
    );
}

function setupGlobalErrorHandler(errorListener: ErrorListener) {
    window.onerror = (message: string | Event, source?: string, line?: number, column?: number, error?: Error): boolean => {
        const fullMessage = `Message: ${typeof message === "string" ? message : JSON.stringify(message)}\nSource: ${source || "-"}\nLine: ${line || "-"}\nColumn: ${column || "-"}`;
        if (process.env.NODE_ENV === "development") {
            console.error("Window Global Error", error, fullMessage);
        }
        app.store.dispatch(errorAction(new RuntimeException(fullMessage, error)));
        return true;
    };
    window.onunhandledrejection = (event: PromiseRejectionEvent) => {
        if (process.env.NODE_ENV === "development") {
            console.error("Unhandled Promise Rejection", event);
        }
        let message = event.reason && typeof event.reason.toString === "function" ? event.reason.toString() + ", reason object: " : "";
        message += JSON.stringify(event.reason);
        app.store.dispatch(errorAction(new Error("Unhandled Promise Rejection: " + message)));
    };

    app.errorHandler = errorListener.onError.bind(errorListener);
}

function setupLogger(config: LoggerConfig | undefined) {
    const pageOpenedTime = Date.now();
    app.logger.info("@@ENTER", {});

    if (config) {
        app.loggerConfig = config;
        if (process.env.NODE_ENV === "production") {
            app.sagaMiddleware.run(function*() {
                while (true) {
                    yield delay(config.sendingFrequency * 1000);
                    try {
                        const logs = app.logger.collect();
                        if (logs.length > 0) {
                            yield call(ajax, "POST", config.serverURL, {}, {events: logs});
                            app.logger.empty();
                        }
                    } catch (e) {
                        // Silent if sending error
                    }
                }
            });

            const isIOS = /iPad|iPhone|iPod/.test(navigator.platform);
            window.addEventListener(
                // Ref: https://developer.apple.com/library/archive/documentation/AppleApplications/Reference/SafariWebContent/HandlingEvents/HandlingEvents.html#//apple_ref/doc/uid/TP40006511-SW5
                isIOS ? "pagehide" : "unload",
                () => {
                    try {
                        app.logger.info("@@EXIT", {stayingSecond: ((Date.now() - pageOpenedTime) / 1000).toFixed(2)});
                        const logs = app.logger.collect();
                        /**
                         * navigator.sendBeacon() uses HTTP POST, but does not support CORS.
                         * We have to use text/plain as content type, instead of JSON.
                         */
                        const textData = JSON.stringify({events: logs});
                        navigator.sendBeacon(config.serverURL, textData);
                    } catch (e) {
                        // Silent if sending error
                    }
                },
                false
            );
        }
    }
}
