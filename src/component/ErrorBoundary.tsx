import React, {ErrorInfo, ReactElement, ReactNode} from "react";
import {connect, DispatchProp} from "react-redux";
import {errorAction, Exception} from "../exception";

export class ReactLifecycleException extends Exception {
    constructor(public message: string, public stack: string, public componentStack: string) {
        super(message);
    }
}

interface Props extends DispatchProp<any> {
    render?: (exception: ReactLifecycleException) => ReactElement<any>;
    children: ReactNode;
}

interface State {
    exception: ReactLifecycleException;
}

class Component extends React.PureComponent<Props, State> {
    public static defaultProps: Partial<Props> = {
        render: exception => <h2>Render fail: {exception.message}</h2>,
    };
    state: State = {exception: null};

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        const exception = new ReactLifecycleException(error.message, error.stack, errorInfo.componentStack);
        this.props.dispatch(errorAction(exception));
        this.setState({exception});
    }

    render() {
        return this.state.exception ? this.props.render(this.state.exception) : this.props.children;
    }
}

export const ErrorBoundary = connect()(Component);
