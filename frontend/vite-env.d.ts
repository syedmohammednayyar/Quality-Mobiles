/// <reference types="vite/client" />

declare module 'react' {
	export type ReactNode = any;
	export type ReactElement = any;
	export type FC<P = {}> = (props: P) => ReactElement | null;
	export function useState<T>(initialState: T | (() => T)): [T, (value: T | ((prev: T) => T)) => void];
	export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
	export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
	export function useDeferredValue<T>(value: T): T;
	export function useRef<T>(initialValue: T): { current: T };
	export function useCallback<T extends (...args: any[]) => any>(callback: T, deps: readonly unknown[]): T;
	export const Fragment: any;
	const React: {
		FC: FC<any>;
		Fragment: any;
	};
	export default React;
}

declare module 'react/jsx-runtime' {
	export const jsx: any;
	export const jsxs: any;
	export const Fragment: any;
}

declare namespace JSX {
	interface IntrinsicElements {
		[elemName: string]: any;
		button: {
			key?: string | number;
			className?: string;
			disabled?: boolean;
			type?: string;
			onClick?: (event: any) => void;
			children?: any;
		};
		input: {
			className?: string;
			type?: string;
			value?: any;
			checked?: any;
			disabled?: boolean;
			placeholder?: string;
			maxLength?: number;
			min?: number | string;
			step?: number | string;
			onChange?: (event: any) => void;
			children?: any;
		};
		select: {
			className?: string;
			value?: any;
			disabled?: boolean;
			onChange?: (event: any) => void;
			children?: any;
		};
		textarea: {
			className?: string;
			value?: any;
			disabled?: boolean;
			onChange?: (event: any) => void;
			children?: any;
		};
	}
}
